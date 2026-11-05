// Restaurant Service — Real Supabase Multi-tenant Queries & Zero Local Fallbacks
import express, { Request, Response } from 'express';
import cors from 'cors';
import { getDb } from '../common/db';

export const restaurantApp = express();
restaurantApp.use(cors());
restaurantApp.use(express.json());

// Correlation ID
restaurantApp.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || `rest-${Date.now().toString(36)}`;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

restaurantApp.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'restaurant-service',
    status: 'UP',
    database: 'Supabase PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get all restaurants (tenants) with branches
 */
restaurantApp.get('/restaurants', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data: tenants, error: tErr } = await db.from('tenants').select('*');
    if (tErr) throw new Error(tErr.message);

    const { data: branches, error: bErr } = await db.from('branches').select('*');
    if (bErr) throw new Error(bErr.message);

    const formatted = (tenants || []).map((t) => ({
      id: t.id,
      name: t.name,
      taxId: t.tax_id,
      cuisineType: t.cuisine_type,
      branches: (branches || [])
        .filter((b) => b.tenant_id === t.id)
        .map((b) => ({
          id: b.id,
          tenantId: b.tenant_id,
          name: b.name,
          address: b.address,
          city: b.city,
          country: b.country,
          timezone: b.timezone,
          commercialCurrency: b.commercial_currency,
          openingTime: b.opening_time,
          closingTime: b.closing_time,
          maxCapacity: b.max_capacity,
        })),
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Get branches for tenant
 */
restaurantApp.get('/restaurants/:tenantId/branches', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('branches')
      .select('*')
      .eq('tenant_id', req.params.tenantId);

    if (error) throw new Error(error.message);

    const formatted = (data || []).map((b) => ({
      id: b.id,
      tenantId: b.tenant_id,
      name: b.name,
      address: b.address,
      city: b.city,
      country: b.country,
      timezone: b.timezone,
      commercialCurrency: b.commercial_currency,
      openingTime: b.opening_time,
      closingTime: b.closing_time,
      maxCapacity: b.max_capacity,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Get tables of a branch
 */
restaurantApp.get('/branches/:branchId/tables', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('restaurant_tables')
      .select('*')
      .eq('branch_id', req.params.branchId)
      .order('table_number', { ascending: true });

    if (error) throw new Error(error.message);

    const formatted = (data || []).map((t) => ({
      id: t.id,
      tenantId: t.tenant_id,
      branchId: t.branch_id,
      number: t.table_number,
      capacity: t.capacity,
      locationArea: t.location_area,
      qrToken: t.qr_token,
      status: t.status,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Scan Table by QR Token
 */
restaurantApp.get('/tables/qr/:qrToken', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('restaurant_tables')
      .select('*')
      .eq('qr_token', req.params.qrToken)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table QR token not found.' } });
    }

    return res.json({
      success: true,
      data: {
        table: {
          id: data.id,
          tenantId: data.tenant_id,
          branchId: data.branch_id,
          number: data.table_number,
          capacity: data.capacity,
          locationArea: data.location_area,
          qrToken: data.qr_token,
          status: data.status,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Get Menu Categories & Dishes for a tenant
 */
restaurantApp.get('/restaurants/:tenantId/menu', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { data: categories, error: cErr } = await db
      .from('menu_categories')
      .select('*')
      .eq('tenant_id', req.params.tenantId)
      .order('sort_order', { ascending: true });

    if (cErr) throw new Error(cErr.message);

    const { data: items, error: iErr } = await db
      .from('menu_items')
      .select('*')
      .eq('tenant_id', req.params.tenantId);

    if (iErr) throw new Error(iErr.message);

    return res.json({
      success: true,
      data: {
        categories: categories || [],
        items: items || [],
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Update Menu Item Availability
 */
restaurantApp.patch('/menu/items/:itemId/availability', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { isAvailable } = req.body;

    const { data, error } = await db
      .from('menu_items')
      .update({ is_available: Boolean(isAvailable) })
      .eq('id', req.params.itemId)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Menu item not found.' } });
    }

    return res.json({ success: true, data: { itemId: data.id, isAvailable: data.is_available } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Customer Reviews Endpoints (All Branches & Countries)
 */
restaurantApp.get('/reviews', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    let query = db.from('reviews').select('*').order('created_at', { ascending: false });

    if (req.query.tenantId) {
      query = query.eq('tenant_id', req.query.tenantId as string);
    }
    if (req.query.branchId) {
      query = query.eq('branch_id', req.query.branchId as string);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const reviews = data || [];
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 5;

    return res.json({
      success: true,
      data: {
        reviews,
        stats: {
          totalReviews: reviews.length,
          averageRating: Number(averageRating.toFixed(1)),
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

restaurantApp.post('/reviews', async (req: Request, res: Response) => {
  try {
    const { tenantId, branchId, customerName, rating, comment, orderId } = req.body;

    if (!tenantId || !branchId || !customerName || !rating || !comment) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Missing required review fields.' },
      });
    }

    const db = getDb();
    const reviewId = `rev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const { data, error } = await db
      .from('reviews')
      .insert({
        id: reviewId,
        tenant_id: tenantId,
        branch_id: branchId,
        order_id: orderId || null,
        customer_name: customerName,
        rating: Math.min(5, Math.max(1, Number(rating))),
        comment,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return res.status(201).json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});
