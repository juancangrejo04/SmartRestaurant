// Local Development Server & Vercel Parity Server
import { createServer as createViteServer } from 'vite';
import { app } from './api/index';
import { dispatchPendingOutboxToQStash } from './services/common/qstash';

async function startLocalServer() {
  // Start periodic outbox dispatcher in development (every 5 seconds)
  setInterval(() => {
    dispatchPendingOutboxToQStash(10).catch(() => {});
  }, 5000);

  // Mount Vite SPA in Development or Serve Static in Production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(require('express').static('dist'));
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SmartRestaurant Serverless Architecture] Dev Server running at http://0.0.0.0:${PORT}`);
    console.log(`[Architecture]: Vercel Hobby + Supabase PostgreSQL + Upstash QStash`);
  });
}

startLocalServer().catch((err) => {
  console.error('[SmartRestaurant Fatal Error]:', err);
});
