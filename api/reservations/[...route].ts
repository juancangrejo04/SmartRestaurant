// Vercel Serverless Function: Reservation Service Domain
import type { Request, Response } from 'express';
import { reservationApp } from '../../services/reservation-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/reservations')) {
    req.url = req.url.replace('/api/reservations', '') || '/';
  }
  return reservationApp(req, res);
}
