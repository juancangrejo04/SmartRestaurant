// Concurrent Microservices Launcher for Multi-Service Architecture
import { authApp } from './auth-service';
import { restaurantApp } from './restaurant-service';
import { reservationApp } from './reservation-service';
import { orderApp } from './order-service';
import { kitchenApp } from './kitchen-service';
import { notificationApp } from './notification-service';
import { analyticsApp } from './analytics-service';
import { runMigrations } from './common/db';
import { startOutboxWorker } from './common/outbox';

const SERVICES = [
  { name: 'Auth Service', app: authApp, port: 4001 },
  { name: 'Restaurant Service', app: restaurantApp, port: 4002 },
  { name: 'Reservation Service', app: reservationApp, port: 4003 },
  { name: 'Order Service', app: orderApp, port: 4004 },
  { name: 'Kitchen Service', app: kitchenApp, port: 4005 },
  { name: 'Notification Service', app: notificationApp, port: 4006 },
  { name: 'Analytics Service', app: analyticsApp, port: 4007 },
];

async function launch() {
  console.log('=================================================================');
  console.log('🚀 INICIALIZANDO ARQUITECTURA DISTRIBUIDA REAL SMARTRESTAURANT');
  console.log('=================================================================\n');

  // 1. Run PostgreSQL Migrations
  await runMigrations().catch((err) => console.warn('[Migration Runner Notice]:', err.message));

  // 2. Start Background Transactional Outbox Worker
  startOutboxWorker(2000);
  console.log('[Transactional Outbox Worker]: Active (Polling pending events every 2000ms)');

  // 3. Start Each Microservice on its Dedicated Port
  for (const s of SERVICES) {
    s.app.listen(s.port, '0.0.0.0', () => {
      console.log(`✅ [${s.name}]: Listening independently on http://0.0.0.0:${s.port}`);
    });
  }

  console.log('\n[Distributed Cluster Ready]: 7 microservices active.');
}

launch().catch((err) => {
  console.error('[Distributed Cluster Fatal]:', err);
});
