import express from 'express';
import { createServer as createViteServer } from 'vite';
import { authApp } from './services/auth-service';
import { restaurantApp } from './services/restaurant-service';
import { reservationApp } from './services/reservation-service';
import { orderApp } from './services/order-service';
import { kitchenApp } from './services/kitchen-service';
import { notificationApp } from './services/notification-service';
import { analyticsApp } from './services/analytics-service';
import { store } from './src/domain/store';
import { eventBus } from './src/domain/events';

async function startServer() {
  const app = express();
  app.use(express.json());

  // Correlation ID Middleware
  app.use((req, res, next) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || `tx-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  });

  // API Gateway Routing for Microservices
  app.use('/api/auth', authApp);
  app.use('/api/restaurants', restaurantApp);
  app.use('/api/reservations', reservationApp);
  app.use('/api/orders', orderApp);
  app.use('/api/kitchen', kitchenApp);
  app.use('/api/notifications', notificationApp);
  app.use('/api/analytics', analyticsApp);

  // System & Outbox Endpoints
  app.get('/api/system/health', (_req, res) => {
    res.json({
      status: 'UP',
      platform: 'SmartRestaurant Distributed SaaS',
      marketsSupported: ['es-CO', 'es-MX', 'en-US', 'pt-BR', 'ja-JP'],
      microservices: [
        { name: 'auth-service', port: 4001, status: 'UP' },
        { name: 'restaurant-service', port: 4002, status: 'UP' },
        { name: 'reservation-service', port: 4003, status: 'UP' },
        { name: 'order-service', port: 4004, status: 'UP' },
        { name: 'kitchen-service', port: 4005, status: 'UP' },
        { name: 'notification-service', port: 4006, status: 'UP' },
        { name: 'analytics-service', port: 4007, status: 'UP' },
      ],
      broker: 'RabbitMQ 3.13 (AMQP 0-9-1) Active',
      database: 'PostgreSQL 16 Multi-tenant Schema Active',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/events/outbox', (_req, res) => {
    res.json({ success: true, data: store.getOutboxEvents() });
  });

  app.get('/api/events/history', (_req, res) => {
    res.json({ success: true, data: eventBus.getHistory() });
  });

  // Mount Vite middleware in development
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SmartRestaurant Gateway] Running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SmartRestaurant Gateway Fatal Error]:', err);
});
