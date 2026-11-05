// Vercel Serverless Function: Order Service Domain
import type { Request, Response } from 'express';
import { orderApp } from '../../services/order-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/orders')) {
    req.url = req.url.replace('/api/orders', '') || '/';
  }
  return orderApp(req, res);
}
