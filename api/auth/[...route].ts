// Vercel Serverless Function: Auth Service Domain
import type { Request, Response } from 'express';
import { authApp } from '../../services/auth-service';

export default function handler(req: Request, res: Response) {
  if (req.url && req.url.startsWith('/api/auth')) {
    req.url = req.url.replace('/api/auth', '') || '/';
  }
  return authApp(req, res);
}
