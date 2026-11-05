// Vercel Serverless Function: Analytics Service Domain
import type { Request, Response } from 'express';
import { analyticsApp } from '../../services/analytics-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/analytics')) {
    req.url = req.url.replace('/api/analytics', '') || '/';
  }
  return analyticsApp(req, res);
}
