// Standalone Microservice Runner for Auth Service (Port 4001)
import { authApp } from './index';
import { runMigrations } from '../common/db';

const PORT = process.env.PORT || 4001;

async function start() {
  await runMigrations().catch((err: any) => console.warn('[Auth Service Migration Notice]:', err?.message));

  authApp.listen(PORT, () => {
    console.log(`[Auth Service] Running independently at http://0.0.0.0:${PORT}`);
  });
}

start();
