// Restaurant Service - Multi-tenant Restaurants, Branches, Tables, Menus, and Reviews with Supabase
import express, { Request, Response } from 'express';
import cors from 'cors';
import { query } from '../common/db';
import { getSupabaseAdminClient } from '../common/supabase';
import { store } from '../../src/domain/store';

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
  res.json({ service: 'restaurant-service', status: 'UP', architecture: 'Serverless Functions (Vercel)', timestamp: new Date().toISOString() });
});

/**
 * Get all restaurants (tenants)
 */
restaurantApp.get('/restaurants', async (_req: Request, res: Response) => {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data: tenantData } = await supabase.from('tenants').select('*');
    if (tenantData && tenantData.length > 0) {
      const { data: branchData } = await supabase.from('branches').select('*');
      const formatted = tenantData.map((t) => ({
        id: t.id,
        name: t.name,
        taxId: t.tax_id,
        cuisineType: t.cuisine_type,
        branches: (branchData || [])
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
    }
  }

  try {
    const { rows } = await query(`SELECT * FROM tenants`);
    if (rows.length > 0) {
      const restaurantsWithBranches = await Promise.all(
        rows.map(async (t) => {
          const { rows: bRows } = await query(`SELECT * FROM branches WHERE tenant_id = $1`, [t.id]);
          return {
            id: t.id,
            name: t.name,
            taxId: t.tax_id,
            cuisineType: t.cuisine_type,
            branches: bRows.map((b) => ({
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
          };
        })
      );
      return res.json({ success: true, data: restaurantsWithBranches });
    }
  } catch {
    // Fallback to store
  }

  res.json({ success: true, data: store.getRestaurants() });
});

/**
 * Get branches for tenant
 */
restaurantApp.get('/restaurants/:tenantId/branches', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data } = await supabase.from('branches').select('*').eq('tenant_id', req.params.tenantId);
    if (data && data.length > 0) {
      return res.json({
        success: true,
        data: data.map((b) => ({
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
      });
    }
  }

  try {
    const { rows } = await query(`SELECT * FROM branches WHERE tenant_id = $1`, [req.params.tenantId]);
    if (rows.length > 0) {
      return res.json({
        success: true,
        data: rows.map((b) => ({
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
      });
    }
  } catch {
    // Fallback
  }
  res.json({ success: true, data: store.getBranches(req.params.tenantId) });
});

/**
 * Get tables of a branch
 */
restaurantApp.get('/branches/:branchId/tables', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data } = await supabase.from('restaurant_tables').select('*').eq('branch_id', req.params.branchId);
    if (data && data.length > 0) {
      return res.json({
        success: true,
        data: data.map((t) => ({
          id: t.id,
          tenantId: t.tenant_id,
          branchId: t.branch_id,
          number: t.table_number,
          capacity: t.capacity,
          locationArea: t.location_area,
          qrToken: t.qr_token,
          status: t.status,
        })),
      });
    }
  }

  try {
    const { rows } = await query(`SELECT * FROM restaurant_tables WHERE branch_id = $1`, [req.params.branchId]);
    if (rows.length > 0) {
      return res.json({
        success: true,
        data: rows.map((t) => ({
          id: t.id,
          tenantId: t.tenant_id,
          branchId: t.branch_id,
          number: t.table_number,
          capacity: t.capacity,
          locationArea: t.location_area,
          qrToken: t.qr_token,
          status: t.status,
        })),
      });
    }
  } catch {
    // Fallback
  }
  res.json({ success: true, data: store.getTables(req.params.branchId) });
});

/**
 * Scan Table by QR Token
 */
restaurantApp.get('/tables/qr/:qrToken', async (req: Request, res: Response) => {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { data } = await supabase.from('restaurant_tables').select('*').eq('qr_token', req.params.qrToken).single();
    if (data) {
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
    }
  }

  try {
    const { rows } = await query(`SELECT * FROM restaurant_tables WHERE qr_token = $1 LIMIT 1`, [req.params.qrToken]);
    if (rows.length > 0) {
      const t = rows[0];
      return res.json({
        success: true,
        data: {
          table: {
            id: t.id,
            tenantId: t.tenant_id,
            branchId: t.branch_id,
            number: t.table_number,
            capacity: t.capacity,
            locationArea: t.location_area,
            qrToken: t.qr_token,
            status: t.status,
          },
        },
      });
    }
  } catch {
    // Fallback
  }
  const tableData = store.getTableByQrToken(req.params.qrToken);
  if (!tableData) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table QR token not found.' } });
  }
  res.json({ success: true, data: tableData });
});

/**
 * Get Menu Categories & Dishes
 */
restaurantApp.get('/restaurants/:tenantId/menu', (req: Request, res: Response) => {
  const categories = store.getMenuCategories(req.params.tenantId);
  const items = store.getMenuItems(undefined, req.params.tenantId);
  res.json({ success: true, data: { categories, items } });
});

/**
 * Update Menu Item Availability
 */
restaurantApp.patch('/menu/items/:itemId/availability', (req: Request, res: Response) => {
  const { isAvailable } = req.body;
  const updated = store.updateMenuItemAvailability(req.params.itemId, Boolean(isAvailable));
  if (!updated) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Menu item not found' } });
  }
  res.json({ success: true, data: { itemId: req.params.itemId, isAvailable } });
});

/**
 * Customer Reviews Endpoints (All Branches & Countries)
 */
restaurantApp.get('/reviews', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const tenantId = req.query.tenantId as string;
  const reviews = store.getReviews(branchId, tenantId);
  const stats = store.getReviewStats(branchId, tenantId);
  res.json({ success: true, data: { reviews, stats } });
});

restaurantApp.post('/reviews', async (req: Request, res: Response) => {
  try {
    const { tenantId, branchId, customerName, rating, comment, orderNumber, dishName } = req.body;
    const review = store.addReview({
      tenantId,
      branchId,
      customerName,
      rating: Number(rating),
      comment,
      orderNumber,
      dishName,
      isVerifiedPurchase: Boolean(orderNumber),
    });

    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        await supabase.from('reviews').insert({
          id: review.id,
          tenant_id: tenantId,
          branch_id: branchId,
          customer_name: customerName,
          rating: Number(rating),
          comment,
        });
      } catch {
        // Fallback
      }
    }

    res.status(201).json({ success: true, data: review });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } });
  }
});
