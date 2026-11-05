// Vercel Serverless Function: Dispatch Pending Transactional Outbox to QStash
import type { Request, Response } from 'express';
import { dispatchPendingOutboxEvents } from '../../services/common/outbox';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Must be POST.' });
  }

  try {
    const batchSize = Number(req.query.batchSize) || 20;
    const dispatched = await dispatchPendingOutboxEvents(batchSize);
    return res.json({
      success: true,
      dispatched,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'OUTBOX_DISPATCH_ERROR', message: err.message },
    });
  }
}
