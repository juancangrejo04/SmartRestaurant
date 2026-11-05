// Vercel Serverless Function: Kitchen Service Domain
import type { Request, Response } from 'express';
import { kitchenApp } from '../../services/kitchen-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/kitchen')) {
    req.url = req.url.replace('/api/kitchen', '') || '/';
  }
  return kitchenApp(req, res);
}
