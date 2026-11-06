// Vercel Serverless Function: Dispatch Pending Transactional Outbox to QStash
import type { Request, Response } from 'express';
import { dispatchPendingOutboxEvents } from '../../services/common/outbox';

const CRON_SECRET = process.env.CRON_SECRET || '';
const QSTASH_TOKEN = process.env.QSTASH_TOKEN || '';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Must be POST.' });
  }

  // Authorization validation: require Bearer token matching CRON_SECRET or QSTASH_TOKEN when configured
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (CRON_SECRET || QSTASH_TOKEN) {
    const isAuthorized =
      (CRON_SECRET && token === CRON_SECRET) ||
      (QSTASH_TOKEN && token === QSTASH_TOKEN);

    if (!isAuthorized) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Acceso no autorizado al despachador de Outbox.' },
      });
    }
  }

  try {
    const batchSize = Number(req.query.batchSize) || 20;
    const workerId = (req.headers['x-worker-id'] as string) || undefined;
    const dispatched = await dispatchPendingOutboxEvents(batchSize, workerId);
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

