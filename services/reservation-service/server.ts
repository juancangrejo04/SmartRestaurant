// Standalone Microservice Runner for Reservation Service (Port 4003)
import { reservationApp } from './index';
import { runMigrations } from '../common/db';

const PORT = process.env.PORT || 4003;

async function start() {
  await runMigrations().catch((err) => console.warn('[Reservation Service Migration Notice]:', err.message));

  reservationApp.listen(PORT, () => {
    console.log(`[Reservation Service] Running independently at http://0.0.0.0:${PORT}`);
  });
}

start();
