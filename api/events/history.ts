// Vercel Serverless Function: Stream Real Supabase Outbox History
import type { Request, Response } from 'express';
import { getDb } from '../../services/common/db';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Must be GET.' });
  }

  try {
    const db = getDb();
    const { data: outbox, error } = await db
      .from('outbox_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const formatted = (outbox || []).map((e) => ({
      id: e.id,
      aggregateType: e.aggregate_type,
      aggregateId: e.aggregate_id,
      eventType: e.event_type,
      tenantId: e.tenant_id,
      branchId: e.branch_id,
      correlationId: e.correlation_id,
      schemaVersion: '1.0',
      payload: e.payload,
      createdAt: e.created_at,
      status: e.status,
      retryCount: e.retry_count,
    }));

    return res.json({ success: true, count: formatted.length, events: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
