import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { Layout } from './components/Layout';
import { indexRouter } from './routes/index.routes';
import { commandCenterRouter } from './routes/command-center.routes';
import { explorerRouter } from './routes/explorer.routes';
import { timelineRouter } from './routes/timeline.routes';
import { sseHandler } from './sse-handler';
import { startWatcher } from './watcher-setup';
import { currentPhaseMiddleware } from './middleware/current-phase';

interface ServerConfig {
  projectDir: string;
  port: number;
}

interface CurrentPhase {
  number: number;
  name: string;
  status: string;
  nextAction: string | null;
}

type Env = {
  Variables: {
    projectDir: string;
    currentPhase: CurrentPhase | null;
  };
};

function createApp(config: ServerConfig) {
  const app = new Hono<Env>();

  // Inject projectDir into context for all routes
  app.use('*', async (c, next) => {
    c.set('projectDir', config.projectDir);
    await next();
  });

  // Security headers (replaces helmet)
  app.use('*', secureHeaders());

  // Compression — skip SSE endpoint to avoid buffering
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/events')) {
      return next();
    }
    return compress()(c, next);
  });

  // Request logging
  app.use('*', logger());

  // Vary: Accept header on all responses
  app.use('*', async (c, next) => {
    await next();
    c.header('Vary', 'Accept');
  });

  // Static file serving from public/
  app.use('*', serveStatic({ root: './public' }));

  // Current phase middleware — populates c.var.currentPhase for all routes
  app.use('*', currentPhaseMiddleware);

  // Routes
  app.route('/', indexRouter);
  app.route('/api/command-center', commandCenterRouter);
  app.route('/', explorerRouter);
  app.route('/', timelineRouter);

  // SSE endpoint — real streamSSE handler with multi-client broadcast
  app.get('/api/events/stream', sseHandler);

  // 404 handler
  app.notFound((c) => {
    return c.html(
      <Layout title="Not Found">
        <h1>404 — Not Found</h1>
        <p>The page you requested does not exist.</p>
        <p><a href="/">Return to Command Center</a></p>
      </Layout>,
      404
    );
  });

  // Error handler
  app.onError((err, c) => {
    console.error('Server error:', err);
    return c.html(
      <Layout title="Server Error">
        <h1>500 — Server Error</h1>
        <p>Something went wrong. Check the server logs for details.</p>
        <p><a href="/">Return to Command Center</a></p>
      </Layout>,
      500
    );
  });

  return app;
}

export function startServer(config: ServerConfig): void {
  const app = createApp(config);

  const server = serve({
    fetch: app.fetch,
    port: config.port,
  });

  // Start file watcher — broadcasts SSE events on .planning/ changes
  // Import caches lazily to avoid circular deps
  const watcher = startWatcher(config.projectDir, () => {
    // Cache invalidation callback — services with TTL caches expose them
    // These will be wired as services are consumed by routes
  });

  console.log(`PBR Dashboard running at http://localhost:${config.port}`);
  console.log(`Project directory: ${config.projectDir}`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down dashboard...');
    watcher.close();
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    watcher.close();
    server.close(() => process.exit(0));
  });
}

export { createApp };
