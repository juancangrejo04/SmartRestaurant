// Restaurant Service (Port 4002) - Manages Multi-tenant Restaurant Configurations, Branches, Tables, and Menus
import express, { Request, Response } from 'express';
import { store } from '../../src/domain/store';

export const restaurantApp = express();
restaurantApp.use(express.json());

restaurantApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'restaurant-service', status: 'UP', port: 4002, timestamp: new Date().toISOString() });
});

restaurantApp.get('/restaurants', (_req: Request, res: Response) => {
  res.json({ success: true, data: store.getRestaurants() });
});

restaurantApp.get('/restaurants/:tenantId/branches', (req: Request, res: Response) => {
  const branches = store.getBranches(req.params.tenantId);
  res.json({ success: true, data: branches });
});

restaurantApp.get('/branches/:branchId/tables', (req: Request, res: Response) => {
  const tables = store.getTables(req.params.branchId);
  res.json({ success: true, data: tables });
});

restaurantApp.get('/tables/qr/:qrToken', (req: Request, res: Response) => {
  const tableData = store.getTableByQrToken(req.params.qrToken);
  if (!tableData) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table QR token not found.' } });
  }
  res.json({ success: true, data: tableData });
});

restaurantApp.get('/restaurants/:tenantId/menu', (req: Request, res: Response) => {
  const categories = store.getMenuCategories(req.params.tenantId);
  const items = store.getMenuItems(undefined, req.params.tenantId);
  res.json({ success: true, data: { categories, items } });
});

restaurantApp.patch('/menu/items/:itemId/availability', (req: Request, res: Response) => {
  const { isAvailable } = req.body;
  const updated = store.updateMenuItemAvailability(req.params.itemId, Boolean(isAvailable));
  if (!updated) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Menu item not found' } });
  }
  res.json({ success: true, data: { itemId: req.params.itemId, isAvailable } });
});
