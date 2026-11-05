// Standalone Microservice Runner for Restaurant Service (Port 4002)
import { restaurantApp } from './index';
import { runMigrations } from '../common/db';

const PORT = process.env.PORT || 4002;

async function start() {
  await runMigrations().catch((err: any) => console.warn('[Restaurant Service Migration Notice]:', err?.message));

  restaurantApp.listen(PORT, () => {
    console.log(`[Restaurant Service] Running independently at http://0.0.0.0:${PORT}`);
  });
}

start();
