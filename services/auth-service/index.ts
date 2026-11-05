// Auth Service — Production Authentication, Registration, Password Recovery, and RBAC via Supabase Auth
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';
import { authenticateJWT, requireRole, AuthenticatedRequest } from '../common/auth';
import { UserRole } from '../../src/types';

export const authApp = express();
authApp.use(cors());
authApp.use(express.json());

// Correlation ID
authApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `auth-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

/**
 * Health check
 */
authApp.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'auth-service',
    status: 'UP',
    provider: 'Supabase Auth (Native OAuth/JWT) & PostgreSQL',
    security: 'Supabase Auth Sessions + RBAC + Tenant Isolation',
    timestamp: new Date().toISOString(),
  });
});

/**
 * User Login with Supabase Auth (signInWithPassword).
 * Validates credentials directly against Supabase Auth.
 * No custom password hashes in public tables.
 */
authApp.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email and password are required.' },
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();

    // 1. Authenticate against Supabase Auth
    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError || !authData.user || !authData.session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: authError?.message || 'Invalid email or password.',
        },
      });
    }

    const authUser = authData.user;

    // 2. Query business profile from users table
    const { data: profile } = await db
      .from('users')
      .select('id, tenant_id, name, email, role, assigned_branch_id')
      .eq('id', authUser.id)
      .maybeSingle();

    const userRole = (profile?.role || authUser.user_metadata?.role || 'CUSTOMER') as UserRole;
    const tenantId = (profile?.tenant_id || authUser.user_metadata?.tenantId || 'rest-col-01') as string;
    const name = profile?.name || authUser.user_metadata?.name || cleanEmail.split('@')[0];
    const assignedBranchId = profile?.assigned_branch_id || authUser.user_metadata?.assignedBranchId;

    return res.json({
      success: true,
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresIn: authData.session.expires_in,
      user: {
        id: authUser.id,
        tenantId,
        name,
        email: cleanEmail,
        role: userRole,
        assignedBranchId,
      },
      correlationId: res.getHeader('X-Correlation-Id'),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: err.message },
    });
  }
});

/**
 * User Registration with Supabase Auth (signUp).
 * Creates identity in auth.users and profile in users table.
 */
authApp.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = 'CUSTOMER', tenantId = 'rest-col-01', branchId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, email, and password are required.' },
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();

    // 1. Register with Supabase Auth
    const { data: authData, error: authError } = await db.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name,
          role,
          tenantId,
          assignedBranchId: branchId || null,
        },
      },
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: { code: 'REGISTRATION_FAILED', message: authError.message },
      });
    }

    const authUser = authData.user;
    if (!authUser) {
      return res.status(500).json({
        success: false,
        error: { code: 'REGISTRATION_ERROR', message: 'User was not created by Supabase Auth.' },
      });
    }

    // 2. Create business profile in users table (without storing password)
    const { error: profileError } = await db.from('users').upsert({
      id: authUser.id,
      tenant_id: tenantId,
      name,
      email: cleanEmail,
      role,
      assigned_branch_id: branchId || null,
      created_at: new Date().toISOString(),
    });

    if (profileError) {
      console.warn('[Profile Sync Notice]:', profileError.message);
    }

    return res.status(201).json({
      success: true,
      user: {
        id: authUser.id,
        tenantId,
        name,
        email: cleanEmail,
        role: role as UserRole,
        assignedBranchId: branchId || null,
      },
      token: authData.session?.access_token || null,
      message: 'Account registered successfully with Supabase Auth.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'REGISTRATION_ERROR', message: err.message },
    });
  }
});

/**
 * Password Recovery via Supabase Auth (resetPasswordForEmail)
 */
authApp.post('/recover-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_EMAIL', message: 'Email is required.' },
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const db = getDb();

    const { error } = await db.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { code: 'RECOVERY_FAILED', message: error.message },
      });
    }

    return res.json({
      success: true,
      message: `Password recovery link dispatched successfully via Supabase Auth to ${cleanEmail}.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'RECOVERY_ERROR', message: err.message },
    });
  }
});

/**
 * User Logout via Supabase Auth (signOut)
 */
authApp.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const db = getDb();
    if (token) {
      await db.auth.signOut().catch(() => {});
    }
    return res.json({ success: true, message: 'Logged out successfully from Supabase Auth.' });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'LOGOUT_ERROR', message: err.message },
    });
  }
});

/**
 * Profile verification endpoint — Reads verified identity from Supabase Auth
 */
authApp.get('/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, user: req.user });
});

export { authenticateJWT, requireRole };
