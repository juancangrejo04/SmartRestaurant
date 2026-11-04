// Standalone Microservice Runner for Kitchen Service (Port 4005)
import { kitchenApp } from './index';
import { runMigrations } from '../common/db';

const PORT = process.env.PORT || 4005;

async function start() {
  await runMigrations().catch((err) => console.warn('[Kitchen Service Migration Notice]:', err.message));

  kitchenApp.listen(PORT, () => {
    console.log(`[Kitchen Service] Running independently at http://0.0.0.0:${PORT}`);
  });
}

start();
