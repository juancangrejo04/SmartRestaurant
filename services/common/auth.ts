// JWT Authentication, Bcrypt Password Hashing, and RBAC Security Middleware
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole } from '../../src/types';

export const JWT_SECRET = process.env.JWT_SECRET || 'sr_super_secret_jwt_key_dist_2026';

export interface UserTokenPayload {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  name: string;
  assignedBranchId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

/**
 * Sign a valid JWT with role claims and expiration
 */
export function generateToken(payload: UserTokenPayload, expiresIn: string | number = '12h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

/**
 * Verify JWT signature and extract payload
 */
export function verifyToken(token: string): UserTokenPayload {
  return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
}

/**
 * Hash password with bcrypt salt rounds
 */
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 10);
}

/**
 * Compare plain text password against stored bcrypt hash
 */
export async function comparePassword(plainText: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plainText, hashed);
}

/**
 * Middleware: Enforces valid Bearer JWT on protected endpoints
 */
export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header with Bearer token' },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired', details: err.message },
    });
  }
}

/**
 * Middleware: Enforces Role-Based Access Control (RBAC) in the backend
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Check verified JWT user
    if (req.user) {
      if (allowedRoles.includes(req.user.role)) {
        return next();
      }
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Role ${req.user.role} does not have permission to access this resource.`,
          allowedRoles,
        },
      });
    }

    // 2. Fallback for backwards-compatibility only if authenticated
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required for role verification.' },
    });
  };
}

/**
 * Middleware: Enforces Tenant Isolation
 */
export function requireTenantIsolation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
  }

  const targetTenantId = (req.params.tenantId || req.body.tenantId || req.query.tenantId) as string;

  // OWNER can inspect cross-tenant in multi-chain, otherwise user must match tenant
  if (targetTenantId && req.user.role !== 'OWNER' && req.user.tenantId !== targetTenantId) {
    return res.status(403).json({
      success: false,
      error: { code: 'TENANT_MISMATCH', message: 'Access denied to data from different tenant organization.' },
    });
  }

  next();
}
