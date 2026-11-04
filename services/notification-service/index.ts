// Notification Service - QStash Event Integration & Real-time Alerts
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getSupabaseAdminClient } from '../common/supabase';
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

const NOTIFICATIONS: InAppNotification[] = [];

export function addNotification(notif: {
  tenantId: string;
  branchId?: string;
  title: string;
  message: string;
  type: InAppNotification['type'];
  correlationId?: string;
}) {
  const item: InAppNotification = {
    id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    tenantId: notif.tenantId,
    branchId: notif.branchId,
    title: notif.title,
    message: notif.message,
    type: notif.type,
    read: false,
    timestamp: new Date().toISOString(),
    correlationId: notif.correlationId,
  };
  NOTIFICATIONS.unshift(item);
  if (NOTIFICATIONS.length > 50) NOTIFICATIONS.pop();

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    Promise.resolve(
      supabase.from('notifications').insert({
        id: item.id,
        tenant_id: item.tenantId,
        branch_id: item.branchId,
        title: item.title,
        message: item.message,
        type: item.type,
        is_read: false,
      })
    ).catch(() => {});
  }
}

notificationApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'notification-service', status: 'UP', architecture: 'Serverless Functions (Vercel)', timestamp: new Date().toISOString() });
});

notificationApp.get('/notifications', async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data } = await q;
    if (data && data.length > 0) {
      return res.json({
        success: true,
        data: data.map((n) => ({
          id: n.id,
          tenantId: n.tenant_id,
          branchId: n.branch_id,
          title: n.title,
          message: n.message,
          type: n.type,
          read: n.is_read,
          timestamp: n.created_at,
        })),
      });
    }
  }

  const filtered = tenantId ? NOTIFICATIONS.filter((n) => n.tenantId === tenantId) : NOTIFICATIONS;
  res.json({ success: true, data: filtered });
});

notificationApp.patch('/notifications/:id/read', (req: Request, res: Response) => {
  const item = NOTIFICATIONS.find((n) => n.id === req.params.id);
  if (item) item.read = true;
  res.json({ success: true });
});
