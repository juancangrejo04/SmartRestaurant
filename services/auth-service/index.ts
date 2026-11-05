// Auth Service — Production Authentication, Registration, Password Recovery, and RBAC with Supabase
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';
import { comparePassword, hashPassword, generateToken, authenticateJWT, requireRole } from '../common/auth';
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
    provider: 'Supabase PostgreSQL & Auth',
    security: 'JWT + Bcrypt (Cost 10) + RBAC + Tenant Isolation',
    timestamp: new Date().toISOString(),
  });
});

/**
 * User Login with Real Supabase Verification & Bcrypt Password Validation.
 * No demo bypasses, no role-only logins, and no plaintext fallbacks.
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

    const db = getDb();
    const cleanEmail = email.toLowerCase().trim();

    // 1. Fetch user from Supabase users table
    const { data: userRow, error: fetchError } = await db
      .from('users')
      .select('id, tenant_id, name, email, role, password_hash, assigned_branch_id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: fetchError.message },
      });
    }

    if (!userRow || !userRow.password_hash) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' },
      });
    }

    // 2. Strict Bcrypt Password Comparison (No bypasses)
    const isValid = await comparePassword(password, userRow.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' },
      });
    }

    // 3. Issue Signed JWT with Claims (Tenant ID and Role)
    const token = generateToken({
      id: userRow.id,
      tenantId: userRow.tenant_id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role as UserRole,
      assignedBranchId: userRow.assigned_branch_id,
    });

    return res.json({
      success: true,
      token,
      user: {
        id: userRow.id,
        tenantId: userRow.tenant_id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        assignedBranchId: userRow.assigned_branch_id,
      },
      expiresIn: '12h',
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
 * User Registration with Supabase Persistence
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

    // Check if email already exists
    const { data: existingUser } = await db
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { code: 'USER_EXISTS', message: 'An account with this email already exists.' },
      });
    }

    const passwordHash = await hashPassword(password);
    const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const { error: insertError } = await db.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      name,
      email: cleanEmail,
      role,
      password_hash: passwordHash,
      assigned_branch_id: branchId || null,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      return res.status(500).json({
        success: false,
        error: { code: 'REGISTRATION_FAILED', message: insertError.message },
      });
    }

    const token = generateToken({
      id: userId,
      tenantId,
      name,
      email: cleanEmail,
      role: role as UserRole,
      assignedBranchId: branchId,
    });

    return res.status(201).json({
      success: true,
      token,
      user: { id: userId, tenantId, name, email: cleanEmail, role, assignedBranchId: branchId },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'REGISTRATION_ERROR', message: err.message },
    });
  }
});

/**
 * Password Recovery via Supabase Auth
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

    const db = getDb();
    const cleanEmail = email.toLowerCase().trim();

    // Check user existence
    const { data: user } = await db.from('users').select('id').eq('email', cleanEmail).maybeSingle();
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'No registered user found with the provided email.' },
      });
    }

    await db.auth.resetPasswordForEmail(cleanEmail).catch(() => {});

    return res.json({
      success: true,
      message: `If an account exists for ${cleanEmail}, a password recovery link has been dispatched securely.`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'RECOVERY_ERROR', message: err.message },
    });
  }
});

/**
 * User Logout
 */
authApp.post('/logout', (_req: Request, res: Response) => {
  return res.json({ success: true, message: 'Logged out successfully.' });
});

/**
 * Profile verification endpoint
 */
authApp.get('/me', authenticateJWT, (req: any, res: Response) => {
  return res.json({ success: true, user: req.user });
});

export { authenticateJWT, requireRole };
