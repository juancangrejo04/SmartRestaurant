// Standalone Microservice Runner for Notification Service (Port 4006)
import { notificationApp } from './index';

const PORT = process.env.PORT || 4006;

notificationApp.listen(PORT, () => {
  console.log(`[Notification Service] Running independently at http://0.0.0.0:${PORT}`);
});
