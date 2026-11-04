// Dedicated Vercel Serverless Function: QStash Webhook Receiver with Cryptographic Signature Verification
import type { Request, Response } from 'express';
import { verifyQStashSignature, processQStashIncomingEvent, QStashEventEnvelope } from '../../services/common/qstash';

/**
 * Endpoint for receiving webhooks published by Upstash QStash.
 * Signature header: "upstash-signature"
 */
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Must be POST.' });
  }

  const signature = (req.headers['upstash-signature'] as string) || '';
  const correlationId = (req.headers['x-correlation-id'] as string) || `qstash-rx-${Date.now()}`;
  res.setHeader('X-Correlation-Id', correlationId);

  // 1. Raw body extraction for cryptographic verification
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // 2. Cryptographic Signature Verification
  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    console.error('[QStash Security Alert]: Invalid or forged signature received.');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED_SIGNATURE', message: 'Cryptographic signature verification failed.' },
    });
  }

  try {
    const envelope: QStashEventEnvelope = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!envelope || !envelope.eventId || !envelope.eventType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MALFORMED_EVENT', message: 'Event envelope must contain eventId and eventType.' },
      });
    }

    // 3. Process event with idempotency guarantees (checks processed_events table)
    const result = await processQStashIncomingEvent(envelope);

    return res.status(200).json({
      success: true,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      isDuplicate: result.isDuplicate,
      handlersRun: result.handlersRun,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[QStash Processing Error]:', err);
    // Returning 500 signals QStash to retry up to the configured retry limit
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_EVENT_ERROR', message: err.message },
    });
  }
}
