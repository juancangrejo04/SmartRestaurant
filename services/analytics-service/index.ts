// Analytics Service (Port 4007) - Real KPIs, Sales Volumes, and Rule-Based Operational Recommendations Engine
import express, { Request, Response } from 'express';
import { store } from '../../src/domain/store';

export const analyticsApp = express();
analyticsApp.use(express.json());

analyticsApp.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'analytics-service', status: 'UP', port: 4007, timestamp: new Date().toISOString() });
});

analyticsApp.get('/dashboard-metrics', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const metrics = store.getDashboardMetrics(branchId);
  res.json({ success: true, data: metrics });
});

analyticsApp.get('/recommendations', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const recommendations = store.getOperationalRecommendations(branchId);
  res.json({ success: true, data: recommendations });
});
