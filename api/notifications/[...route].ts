// Vercel Serverless Function: Notification Service Domain
import type { Request, Response } from 'express';
import { notificationApp } from '../../services/notification-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/notifications')) {
    req.url = req.url.replace('/api/notifications', '') || '/';
  }
  return notificationApp(req, res);
}
