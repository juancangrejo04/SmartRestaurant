// Standalone Microservice Runner for Analytics Service (Port 4007)
import { analyticsApp } from './index';

const PORT = process.env.PORT || 4007;

analyticsApp.listen(PORT, () => {
  console.log(`[Analytics Service] Running independently at http://0.0.0.0:${PORT}`);
});
