// Vercel Serverless Function: Restaurant Service Domain
import type { Request, Response } from 'express';
import { restaurantApp } from '../../services/restaurant-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/restaurants')) {
    req.url = req.url.replace('/api/restaurants', '') || '/';
  }
  return restaurantApp(req, res);
}
