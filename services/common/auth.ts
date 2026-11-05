// Supabase Auth Integration & RBAC Security Middleware
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../src/types';
import { getDb } from './db';

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
 * Queries Supabase Auth directly via db.auth.getUser(token) and retrieves the
 * verified profile from the `users` table.
 *
 * CRITICAL SECURITY: Never trusts client-sent identity headers (e.g. x-user-role or x-user-id).
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

    // 2. Fetch associated business profile from users table
    const { data: profile } = await db
      .from('users')
      .select('id, tenant_id, name, email, role, assigned_branch_id')
      .eq('id', authUser.id)
      .maybeSingle();

    const role = (profile?.role || authUser.user_metadata?.role || 'CUSTOMER') as UserRole;
    const tenantId = (profile?.tenant_id || authUser.user_metadata?.tenantId || 'rest-col-01') as string;
    const name = profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Usuario';
    const assignedBranchId = profile?.assigned_branch_id || authUser.user_metadata?.assignedBranchId;

    // 3. Attach authenticated, tamper-proof identity to request
    req.user = {
      id: authUser.id,
      tenantId,
      email: authUser.email || '',
      role,
      name,
      assignedBranchId,
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
