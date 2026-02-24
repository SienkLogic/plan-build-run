import { createApp } from './app.js';
import { createWatcher } from './services/watcher.service.js';
import { broadcast } from './services/sse.service.js';
import { cache as milestoneCache } from './services/milestone.service.js';
import { cache as analyticsCache } from './services/analytics.service.js';

export function startServer(config) {
  const app = createApp(config);
  const { port, projectDir } = config;

  // Start file watcher for live updates
  const watcher = createWatcher(projectDir, (event) => {
    milestoneCache.invalidateAll();
    analyticsCache.invalidateAll();
    broadcast('file-change', event);
  });

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`PBR Dashboard running at http://127.0.0.1:${port}`);
    console.log(`Project directory: ${projectDir}`);
    console.log('File watcher active on .planning/**/*.md');
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Shutting down PBR Dashboard...`);

    // Close watcher first (stops generating events)
    try {
      await watcher.close();
      console.log('File watcher closed.');
    } catch (err) {
      console.error('Error closing watcher:', err.message);
    }

    // Then close the HTTP server
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
