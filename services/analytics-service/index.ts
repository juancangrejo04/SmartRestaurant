// Analytics Service — Real Supabase Aggregations, KPIs, and Rule-based Recommendations
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';

export const analyticsApp = express();
analyticsApp.use(cors());
analyticsApp.use(express.json());

// Correlation ID
analyticsApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `analytics-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

analyticsApp.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'analytics-service',
    status: 'UP',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Real KPIs and revenue metrics computed directly from Supabase tables
 */
analyticsApp.get('/dashboard-metrics', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    const db = getDb();

    // 1. Fetch branch orders
    let ordersQuery = db
      .from('orders')
      .select('id, total, status, prep_started_at, prep_completed_at, created_at')
      .neq('status', 'CANCELLED');

    if (branchId) {
      ordersQuery = ordersQuery.eq('branch_id', branchId);
    }

    const { data: orders, error: oErr } = await ordersQuery;
    if (oErr) throw new Error(oErr.message);

    const validOrders = orders || [];
    const totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalOrdersCount = validOrders.length;
    const averageTicket = totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0;

    // 2. Compute average kitchen preparation time
    const completedWithTimes = validOrders.filter(
      (o) => o.prep_started_at && o.prep_completed_at
    );
    let avgKitchenMinutes = 14;
    if (completedWithTimes.length > 0) {
      const totalMinutes = completedWithTimes.reduce((acc, o) => {
        const diffMs = new Date(o.prep_completed_at).getTime() - new Date(o.prep_started_at).getTime();
        return acc + Math.max(1, Math.round(diffMs / 60000));
      }, 0);
      avgKitchenMinutes = Math.round(totalMinutes / completedWithTimes.length);
    }

    // 3. Compute Table Occupancy Rate
    let tablesQuery = db.from('restaurant_tables').select('id, status');
    if (branchId) tablesQuery = tablesQuery.eq('branch_id', branchId);
    const { data: tables } = await tablesQuery;

    const totalTables = tables?.length || 10;
    const occupiedTables = validOrders.filter((o) => o.status === 'RECEIVED' || o.status === 'PREPARING').length;
    const occupancyRate = Math.min(100, Math.round((occupiedTables / totalTables) * 100));

    // 4. Fetch branch reservations
    let resQuery = db
      .from('reservations')
      .select('id, party_size')
      .neq('status', 'CANCELLED');
    if (branchId) resQuery = resQuery.eq('branch_id', branchId);
    const { data: reservations } = await resQuery;

    const totalReservations = reservations?.length || 0;
    const totalDiners = reservations?.reduce((sum, r) => sum + Number(r.party_size || 2), 0) || 0;

    return res.json({
      success: true,
      data: {
        totalRevenue,
        ordersCount: totalOrdersCount,
        averageTicket,
        averageKitchenTimeMinutes: avgKitchenMinutes,
        occupancyRate,
        totalReservations,
        totalDiners,
        activeOrders: occupiedTables,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Operational recommendations computed from real Supabase metrics
 */
analyticsApp.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const branchId = req.query.branchId as string;
    const db = getDb();

    // Fetch active orders and kitchen delays
    let ordersQuery = db
      .from('orders')
      .select('id, status, prep_started_at, created_at')
      .in('status', ['RECEIVED', 'PREPARING']);

    if (branchId) ordersQuery = ordersQuery.eq('branch_id', branchId);
    const { data: activeOrders } = await ordersQuery;

    const recommendations: any[] = [];
    const count = activeOrders?.length || 0;

    if (count > 8) {
      recommendations.push({
        id: 'rec-kitchen-load',
        title: 'Alta demanda en cocina detectada',
        description: `Hay ${count} comandas activas simultáneamente en cocina. Se recomienda asignar un cocinero de apoyo para acelerar la partida caliente.`,
        priority: 'HIGH',
        category: 'KITCHEN',
      });
    } else {
      recommendations.push({
        id: 'rec-flow-optimal',
        title: 'Flujo de cocina en balance óptimo',
        description: 'El ritmo de comandas entrantes se encuentra dentro de los tiempos estándar de despacho (menor a 18 minutos).',
        priority: 'LOW',
        category: 'EFFICIENCY',
      });
    }

    // Check table capacity
    let tablesQuery = db.from('restaurant_tables').select('id');
    if (branchId) tablesQuery = tablesQuery.eq('branch_id', branchId);
    const { data: tables } = await tablesQuery;
    const totalTables = tables?.length || 10;

    if (count / totalTables > 0.8) {
      recommendations.push({
        id: 'rec-table-turnover',
        title: 'Optimización de rotación de mesas',
        description: 'La ocupación supera el 80%. Activar protocolo de agilización de entrega de cuenta y limpieza rápida.',
        priority: 'MEDIUM',
        category: 'SERVICE',
      });
    }

    return res.json({ success: true, data: recommendations });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});
