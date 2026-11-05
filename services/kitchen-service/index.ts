// Kitchen Service — Real Supabase KDS Queue, Controlled State Machine, and QStash Outbox
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';
import { stageOutboxEvent } from '../common/outbox';
import { publishToQStash } from '../common/qstash';
import { authenticateJWT, AuthenticatedRequest } from '../common/auth';
import { OrderStatus, UserRole } from '../../src/types';

export const kitchenApp = express();
kitchenApp.use(cors());
kitchenApp.use(express.json());

// Correlation ID
kitchenApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `kitch-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

kitchenApp.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'kitchen-service',
    status: 'UP',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get active kitchen queue directly from Supabase
 */
kitchenApp.get('/queue', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    const db = getDb();

    let q = db
      .from('orders')
      .select('*')
      .not('status', 'in', '("CANCELLED","DELIVERED")')
      .order('created_at', { ascending: true });

    if (branchId) {
      q = q.eq('branch_id', branchId);
    }

    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);

    // Fetch line items for each active kitchen order
    const orderIds = (orders || []).map((o) => o.id);
    let itemsMap: Record<string, any[]> = {};

    if (orderIds.length > 0) {
      const { data: items } = await db
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

      (items || []).forEach((it) => {
        if (!itemsMap[it.order_id]) itemsMap[it.order_id] = [];
        itemsMap[it.order_id].push({
          menuItemId: it.menu_item_id,
          name: it.name,
          quantity: it.quantity,
          unitPrice: Number(it.unit_price),
          totalPrice: Number(it.total_price),
          notes: it.notes,
        });
      });
    }

    const formatted = (orders || []).map((o) => ({
      id: o.id,
      tenantId: o.tenant_id,
      branchId: o.branch_id,
      tableId: o.table_id,
      tableNumber: o.table_number,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      status: o.status,
      subtotal: Number(o.subtotal),
      tax: Number(o.tax),
      total: Number(o.total),
      currency: o.currency,
      idempotencyKey: o.idempotency_key,
      createdAt: o.created_at,
      prepStartedAt: o.prep_started_at,
      prepCompletedAt: o.prep_completed_at,
      deliveredAt: o.delivered_at,
      items: itemsMap[o.id] || [],
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Advance order in the Finite State Machine:
 * RECEIVED -> PREPARING -> READY -> DELIVERED
 * Enforced strictly against current order status in Supabase
 */
kitchenApp.patch('/orders/:id/status', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const correlationId = (res.getHeader('X-Correlation-Id') as string) || `kds-${Date.now()}`;

  try {
    const { status, note } = req.body;
    const userRole = (req.user?.role || 'KITCHEN') as UserRole;
    const userTenantId = req.user?.tenantId;
    const db = getDb();

    // 1. Fetch current order from Supabase
    const { data: currentOrder, error: fetchError } = await db
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!currentOrder) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }

    // 2. Strict Tenant Isolation Check: Colombian staff cannot mutate Japanese orders
    if (userTenantId && req.user?.role !== 'OWNER' && currentOrder.tenant_id !== userTenantId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_MISMATCH',
          message: `Forbidden: User from tenant '${userTenantId}' cannot modify order belonging to tenant '${currentOrder.tenant_id}'.`,
        },
      });
    }

    const currentStatus = currentOrder.status as OrderStatus;
    const nextStatus = status as OrderStatus;

    // 3. Role Authorization based on nextStatus
    if ((nextStatus === 'PREPARING' || nextStatus === 'READY') && !['KITCHEN', 'ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ROLE_FORBIDDEN', message: `Role '${userRole}' cannot mark orders as ${nextStatus}.` },
      });
    }

    if (nextStatus === 'DELIVERED' && !['WAITER', 'ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ROLE_FORBIDDEN', message: `Role '${userRole}' cannot mark orders as DELIVERED.` },
      });
    }

    // 4. Validate Finite State Machine sequence
    const validTransitions: Record<string, string[]> = {
      RECEIVED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Illegal state jump from '${currentStatus}' to '${nextStatus}'. Valid next states: [${allowed.join(', ')}].`,
        },
      });
    }

    // 3. Build update payload
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: nextStatus,
    };

    if (nextStatus === 'PREPARING') updatePayload.prep_started_at = now;
    if (nextStatus === 'READY') updatePayload.prep_completed_at = now;
    if (nextStatus === 'DELIVERED') updatePayload.delivered_at = now;

    // 4. Update order in Supabase
    const { data: updatedOrder, error: updateError } = await db
      .from('orders')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    // 5. Append to order_status_history
    await db.from('order_status_history').insert({
      id: `osh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order_id: req.params.id,
      from_status: currentStatus,
      to_status: nextStatus,
      changed_by_role: userRole,
      note: note || `Estado modificado a ${nextStatus} por ${userRole}`,
      created_at: now,
    });

    // 6. Map to standard QStash event type
    const qstashEventType =
      nextStatus === 'PREPARING'
        ? 'KitchenOrderAccepted'
        : nextStatus === 'READY'
        ? 'KitchenOrderCompleted'
        : 'OrderUpdated';

    // 7. Stage Transactional Outbox Event
    const outboxRecord = await stageOutboxEvent({
      aggregateType: 'Kitchen',
      aggregateId: updatedOrder.id,
      eventType: qstashEventType as any,
      tenantId: updatedOrder.tenant_id,
      branchId: updatedOrder.branch_id,
      correlationId,
      payload: {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        tableNumber: updatedOrder.table_number,
        status: nextStatus,
        updatedByRole: userRole,
        note,
      },
    });

    // 8. Publish to Upstash QStash
    await publishToQStash(qstashEventType, {
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.order_number,
      status: nextStatus,
      tableNumber: updatedOrder.table_number,
      updatedByRole: userRole,
    }, {
      correlationId,
      tenantId: updatedOrder.tenant_id,
      branchId: updatedOrder.branch_id,
      deduplicationId: outboxRecord.id,
    }).catch(() => {});

    return res.json({
      success: true,
      data: {
        id: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        status: updatedOrder.status,
        prepStartedAt: updatedOrder.prep_started_at,
        prepCompletedAt: updatedOrder.prep_completed_at,
        deliveredAt: updatedOrder.delivered_at,
      },
      outboxEventId: outboxRecord.id,
      correlationId,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'KITCHEN_ERROR', message: err.message },
    });
  }
});
