// Vercel Serverless API Gateway for SmartRestaurant
import express from 'express';
import cors from 'cors';
import { authApp } from '../services/auth-service';
import { restaurantApp } from '../services/restaurant-service';
import { reservationApp } from '../services/reservation-service';
import { orderApp } from '../services/order-service';
import { kitchenApp } from '../services/kitchen-service';
import { notificationApp } from '../services/notification-service';
import { analyticsApp } from '../services/analytics-service';
import { checkSupabaseHealth } from '../services/common/supabase';
import { isQStashConfigured, isQStashReceiverConfigured } from '../services/common/qstash';
import { dispatchPendingOutboxEvents } from '../services/common/outbox';
import { getDb } from '../services/common/db';
import qstashReceiverHandler from './events/qstash-receiver';

export const app = express();
app.use(cors());

// Preserve rawBody for cryptographic signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Global Correlation ID Middleware
app.use((req, res, next) => {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    `gw-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

// Domain Microservices (Serverless Routes)
app.use('/api/auth', authApp);
app.use('/api/restaurants', restaurantApp);
app.use('/api/reservations', reservationApp);
app.use('/api/orders', orderApp);
app.use('/api/kitchen', kitchenApp);
app.use('/api/notifications', notificationApp);
app.use('/api/analytics', analyticsApp);

// Upstash QStash Webhook Receiver
app.post('/api/events/qstash-receiver', (req, res) => {
  return qstashReceiverHandler(req, res);
});

// Outbox Dispatch Trigger (invocable via QStash scheduled cron or on-demand)
app.post('/api/events/dispatch-outbox', async (req, res) => {
  try {
    const batchSize = Number(req.query.batchSize) || 20;
    const dispatched = await dispatchPendingOutboxEvents(batchSize);
    return res.json({ success: true, dispatched, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Real Supabase Event Stream History
app.get('/api/events/history', async (_req, res) => {
  try {
    const db = getDb();
    const { data: outbox } = await db
      .from('outbox_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: processed } = await db
      .from('processed_events')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(30);

    return res.json({
      success: true,
      data: {
        outbox: outbox || [],
        processed: processed || [],
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Serverless Architecture Health & Diagnostic Endpoint
app.get('/api/system/health', async (_req, res) => {
  const supabaseHealth = await checkSupabaseHealth();
  const qstashConfigured = isQStashConfigured();
  const receiverConfigured = isQStashReceiverConfigured();

  return res.json({
    status: 'UP',
    platform: 'SmartRestaurant Serverless Architecture (Vercel Hobby + Supabase + QStash)',
    marketsSupported: ['es-CO', 'es-MX', 'en-US', 'pt-BR', 'ja-JP'],
    services: [
      { name: 'auth-service', runtime: 'Vercel Serverless Function', responsibilities: 'Supabase Auth, Bcrypt, JWT, RBAC' },
      { name: 'restaurant-service', runtime: 'Vercel Serverless Function', responsibilities: 'Multi-tenant Catalog, Branches, Tables, Menus, Reviews' },
      { name: 'reservation-service', runtime: 'Vercel Serverless Function', responsibilities: 'ACID Interval Collision Prevention, QStash Outbox' },
      { name: 'order-service', runtime: 'Vercel Serverless Function', responsibilities: 'Server Price Integrity, Idempotency-Key, QStash Outbox' },
      { name: 'kitchen-service', runtime: 'Vercel Serverless Function', responsibilities: 'KDS Queue, Finite State Machine, QStash Events' },
      { name: 'notification-service', runtime: 'Vercel Serverless Function', responsibilities: 'QStash Webhook Consumer, Real-time Alerts' },
      { name: 'analytics-service', runtime: 'Vercel Serverless Function', responsibilities: 'Operational KPIs, Revenue Aggregations' },
    ],
    database: {
      provider: 'Supabase PostgreSQL',
      configured: supabaseHealth.configured,
      connected: supabaseHealth.connected,
      message: supabaseHealth.message,
    },
    messaging: {
      provider: 'Upstash QStash',
      configured: qstashConfigured,
      receiverConfigured,
      targetEndpoint: '/api/events/qstash-receiver',
      mode: 'Serverless HTTP Webhook Delivery with Signature Verification',
    },
    transactionalOutbox: 'Active (Supabase outbox_events table with QStash dispatcher)',
    timestamp: new Date().toISOString(),
  });
});

export default app;
