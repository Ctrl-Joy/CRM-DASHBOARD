import 'dotenv/config';
import { createApp } from './app';
import { startScheduler } from './services/scheduler';

// API_PORT wins so tools that inject PORT for the web dev server don't collide.
const port = Number(process.env.API_PORT || process.env.PORT) || 4000;
createApp().listen(port, () => {
  console.log(`Nimbus CRM API listening on http://localhost:${port}`);
});
startScheduler();
