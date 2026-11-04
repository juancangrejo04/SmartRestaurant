// Analytics Service - Operational KPIs, Revenue Metrics, and Real-time Aggregations
import express, { Request, Response } from 'express';
import cors from 'cors';
import { store } from '../../src/domain/store';

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
  res.json({ service: 'analytics-service', status: 'UP', architecture: 'Serverless Functions (Vercel)', timestamp: new Date().toISOString() });
});

/**
 * Real KPIs and revenue metrics
 */
analyticsApp.get('/dashboard-metrics', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const metrics = store.getDashboardMetrics(branchId);
  res.json({ success: true, data: metrics });
});

/**
 * Rule-based operational recommendations
 */
analyticsApp.get('/recommendations', (req: Request, res: Response) => {
  const branchId = req.query.branchId as string;
  const recommendations = store.getOperationalRecommendations(branchId);
  res.json({ success: true, data: recommendations });
});
