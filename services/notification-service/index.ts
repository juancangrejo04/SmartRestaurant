// Notification Service — Real Supabase Queries & QStash Integration
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';
import { InAppNotification } from '../../src/types';

export const notificationApp = express();
notificationApp.use(cors());
notificationApp.use(express.json());

// Correlation ID
notificationApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `notif-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

notificationApp.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'notification-service',
    status: 'UP',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

/**
 * List notifications from Supabase
 */
notificationApp.get('/notifications', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string;
    const db = getDb();

    let q = db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const formatted = (data || []).map((n) => ({
      id: n.id,
      tenantId: n.tenant_id,
      branchId: n.branch_id,
      title: n.title,
      message: n.message,
      type: n.type as InAppNotification['type'],
      read: n.is_read,
      timestamp: n.created_at,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Mark notification as read in Supabase
 */
notificationApp.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { error } = await db
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id);

    if (error) throw new Error(error.message);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Create a new notification directly in Supabase
 */
export async function createNotification(notif: {
  tenantId: string;
  branchId?: string;
  title: string;
  message: string;
  type: InAppNotification['type'];
  targetRole?: string;
}) {
  const db = getDb();
  const id = `notif-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  await db.from('notifications').insert({
    id,
    tenant_id: notif.tenantId,
    branch_id: notif.branchId || null,
    title: notif.title,
    message: notif.message,
    type: notif.type,
    target_role: notif.targetRole || null,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}
