// Supabase Auth Integration & Strict RBAC Security Middleware
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../src/types';
import { getDb } from './db';

export const VALID_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'WAITER', 'KITCHEN', 'CUSTOMER'];

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
 * Middleware: Enforces verified Supabase Auth session via Bearer Token.
 * 
 * Strict Security Rules:
 * 1. Validates the token using Supabase Auth (db.auth.getUser).
 * 2. Queries the business profile in the 'users' table using authUser.id.
 * 3. If no profile exists -> 403 Forbidden.
 * 4. If tenant_id is null or empty -> 403 Forbidden.
 * 5. If role is not a recognized role -> 403 Forbidden.
 * 6. Never uses user_metadata as an authorization source.
 * 7. Never assigns default tenants or default roles.
 * 8. Rejects client-supplied headers (e.g. x-user-role, x-user-id).
 */
export async function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header with Bearer token' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const db = getDb();

    // 1. Validate session cryptographically via Supabase Auth
    const { data: authData, error: authError } = await db.auth.getUser(token);

    if (authError || !authData?.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Supabase session token is invalid or expired.',
          details: authError?.message,
        },
      });
      return;
    }

    const authUser = authData.user;

    // 2. Fetch associated business profile from protected 'users' table in PostgreSQL
    const { data: profile, error: profileError } = await db
      .from('users')
      .select('id, tenant_id, name, email, role, assigned_branch_id')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: `Failed to query user profile: ${profileError.message}` },
      });
      return;
    }

    // 3. Reject if no profile exists (Rule 3)
    if (!profile) {
      res.status(403).json({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'No application business profile found for this authenticated user.' },
      });
      return;
    }

    // 4. Reject if tenant_id is null, empty, or whitespace (Rule 4)
    if (!profile.tenant_id || typeof profile.tenant_id !== 'string' || profile.tenant_id.trim() === '') {
      res.status(403).json({
        success: false,
        error: { code: 'INVALID_TENANT', message: 'Authenticated user profile does not have a valid tenant assigned.' },
      });
      return;
    }

    // 5. Reject if role is invalid or not recognized (Rule 5)
    if (!profile.role || !VALID_ROLES.includes(profile.role as UserRole)) {
      res.status(403).json({
        success: false,
        error: { code: 'INVALID_ROLE', message: `User profile role '${profile.role}' is invalid or unauthorized.` },
      });
      return;
    }

    // 6. Attach strictly verified, tamper-proof identity to request (No user_metadata, no client headers)
    req.user = {
      id: authUser.id,
      tenantId: profile.tenant_id.trim(),
      email: profile.email || authUser.email || '',
      role: profile.role as UserRole,
      name: profile.name || 'Usuario',
      assignedBranchId: profile.assigned_branch_id || undefined,
    };

    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_VERIFICATION_FAILED', message: err.message },
    });
  }
}

/**
 * Middleware: Enforces Role-Based Access Control (RBAC) in the backend based strictly
 * on the verified Supabase Auth user.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required for role verification.' },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Role '${req.user.role}' is not authorized to perform this operation.`,
          allowedRoles,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Enforces Strict Multi-Tenant Isolation
 * Ensures users cannot read or mutate data belonging to a different tenant.
 */
export function requireTenantIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  const targetTenantId = (req.params.tenantId || req.body?.tenantId || req.query?.tenantId) as string;

  // Only global OWNER can inspect across tenants; all others are strictly bound to their tenant
  if (targetTenantId && req.user.role !== 'OWNER' && req.user.tenantId !== targetTenantId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_MISMATCH',
        message: `Cross-tenant access forbidden. User from '${req.user.tenantId}' cannot access '${targetTenantId}'.`,
      },
    });
    return;
  }

  next();
}
