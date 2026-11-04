// Standalone Microservice Runner for Order Service (Port 4004)
import { orderApp } from './index';
import { runMigrations } from '../common/db';

const PORT = process.env.PORT || 4004;

async function start() {
  await runMigrations().catch((err) => console.warn('[Order Service Migration Notice]:', err.message));

  orderApp.listen(PORT, () => {
    console.log(`[Order Service] Running independently at http://0.0.0.0:${PORT}`);
  });
}

start();
