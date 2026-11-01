// Auth Service (Port 4001) - Handles User Authentication, RBAC, and Tenant Verification
import express, { Request, Response } from 'express';
import { UserRole } from '../../src/types';

export const authApp = express();
authApp.use(express.json());

interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  name: string;
}

const USERS: AuthUser[] = [
  { id: 'usr-owner-01', tenantId: 'rest-col-01', email: 'owner@andres.co', role: 'OWNER', name: 'Carlos Mendoza' },
  { id: 'usr-admin-01', tenantId: 'rest-col-01', email: 'admin@andres.co', role: 'ADMIN', name: 'Valeria Gómez' },
  { id: 'usr-waiter-01', tenantId: 'rest-col-01', email: 'waiter@andres.co', role: 'WAITER', name: 'Mateo Restrepo' },
  { id: 'usr-kitchen-01', tenantId: 'rest-col-01', email: 'kitchen@andres.co', role: 'KITCHEN', name: 'Chef Andrés Parra' },
  { id: 'usr-customer-01', tenantId: 'rest-col-01', email: 'customer@gmail.com', role: 'CUSTOMER', name: 'Sofía Caballero' },
];

/**
 * Health check endpoint
 */
authApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'auth-service', status: 'UP', port: 4001, timestamp: new Date().toISOString() });
});

/**
 * Login endpoint - returns user info & mock JWT token with role claims
 */
authApp.post('/login', (req: Request, res: Response) => {
  const { email, role } = req.body;
  const user = USERS.find((u) => u.email === email || (role && u.role === role)) || USERS[0];

  res.json({
    success: true,
    token: `jwt-sr-token-${user.id}-${Date.now()}`,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    correlationId: req.headers['x-correlation-id'] || `auth-${Date.now()}`,
  });
});

/**
 * Validate token & permissions middleware
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    const roleHeader = (req.headers['x-user-role'] as UserRole) || 'OWNER';
    if (!allowedRoles.includes(roleHeader)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Role ${roleHeader} is not authorized for this resource.` },
      });
    }
    next();
  };
}
