// Notification Service (Port 4006) - Subscribes to RabbitMQ Business Events and Dispatches Notifications
import express, { Request, Response } from 'express';
import { eventBus } from '../../src/domain/events';
import { InAppNotification, OutboxEvent } from '../../src/types';

export const notificationApp = express();
notificationApp.use(express.json());

const NOTIFICATIONS: InAppNotification[] = [];

// Subscribe to asynchronous business events
eventBus.subscribeAll((event: OutboxEvent) => {
  let title = `Evento: ${event.eventType}`;
  let message = `Notificación distribuida generada para ${event.aggregateType} #${event.aggregateId}`;
  let type: InAppNotification['type'] = 'SYSTEM';

  if (event.eventType === 'ReservationCreated') {
    title = 'Nueva Reserva Confirmada';
    message = `Reserva para ${event.payload.customerName} en Mesa #${event.payload.tableNumber}`;
    type = 'RESERVATION';
  } else if (event.eventType === 'OrderCreated') {
    title = 'Nuevo Pedido QR Recibido';
    message = `Comanda #${event.payload.orderNumber} en Mesa #${event.payload.tableNumber} lista para cocina`;
    type = 'ORDER';
  } else if (event.eventType === 'OrderReady') {
    title = 'Comanda Lista para Servir';
    message = `La orden #${event.payload.orderNumber} está lista en barra`;
    type = 'KITCHEN';
  }

  NOTIFICATIONS.unshift({
    id: `notif-${Date.now().toString(36)}`,
    tenantId: event.tenantId,
    branchId: event.branchId,
    title,
    message,
    type,
    read: false,
    timestamp: new Date().toISOString(),
    correlationId: event.correlationId,
  });

  if (NOTIFICATIONS.length > 50) NOTIFICATIONS.pop();
});

notificationApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'notification-service', status: 'UP', port: 4006, timestamp: new Date().toISOString() });
});

notificationApp.get('/notifications', (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;
  const filtered = tenantId ? NOTIFICATIONS.filter((n) => n.tenantId === tenantId) : NOTIFICATIONS;
  res.json({ success: true, data: filtered });
});
