'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const healthRouter = require('./routes/health');
const progressRouter = require('./routes/progress');
const { PlanningReader } = require('./services/planning-reader');
const createStatusRouter = require('./routes/status');
const createProjectsRouter = require('./routes/projects');
const createPlanningRouter = require('./routes/planning');
const createConfigRouter = require('./routes/config');
const createTelemetryRouter = require('./routes/telemetry');
const createAgentsRouter = require('./routes/agents');
const createMemoryRouter = require('./routes/memory');
const createRoadmapRouter = require('./routes/roadmap');
const createRequirementsRouter = require('./routes/requirements');
const createIntelRouter = require('./routes/intel');
const createIncidentsRouter = require('./routes/incidents');
const createSessionsRouter = require('./routes/sessions');
const { setupStatic } = require('./middleware/static');
const { setupWebSocket } = require('./ws');
const { FileWatcher } = require('./services/file-watcher');

/**
 * Create an Express app with the given options.
 * Pure factory — no side effects (does not listen).
 *
 * @param {object} [options]
 * @param {string} [options.planningDir] - Path to .planning/ directory
 * @param {string} [options.distDir]     - Path to built frontend assets
 * @param {number} [options.port]        - Port to listen on
 * @returns {{ app: Express, options: object }}
 */
function createApp(options = {}) {
  const resolved = {
    planningDir: options.planningDir || path.join(process.cwd(), '.planning'),
    distDir: options.distDir || path.join(__dirname, '..', 'dist'),
    port: options.port != null ? options.port : (Number(process.env.PBR_DASHBOARD_PORT) || (() => {
      throw new Error('Port is required: pass via options.port or PBR_DASHBOARD_PORT env var');
    })()),
  };

  const app = express();

  // Core middleware
  app.use(cors());
  app.use(express.json());

  // Store resolved options on app for downstream middleware
  app.locals.options = resolved;

  // Create shared services
  const planningReader = new PlanningReader(resolved.planningDir);

  // API routes — health first for fast health checks
  app.use('/api/health', healthRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/status', createStatusRouter(planningReader));
  app.use('/api/projects', createProjectsRouter(planningReader));
  app.use('/api/planning', createPlanningRouter(planningReader));
  app.use('/api/config', createConfigRouter(planningReader));
  app.use('/api/telemetry', createTelemetryRouter({ planningDir: resolved.planningDir }));
  const agentsRouter = createAgentsRouter({ planningDir: resolved.planningDir });
  app.use('/api/agents', agentsRouter);
  // Alias /api/hooks and /api/errors to agents sub-routes for HooksPage
  app.use('/api/hooks', (req, res, next) => { req.url = '/hooks' + req.url; agentsRouter(req, res, next); });
  app.use('/api/errors', (req, res, next) => { req.url = '/errors' + req.url; agentsRouter(req, res, next); });
  app.use('/api/memory', createMemoryRouter({ planningDir: resolved.planningDir, planningReader }));
  app.use('/api/roadmap', createRoadmapRouter(planningReader));
  app.use('/api/requirements', createRequirementsRouter(planningReader));
  app.use('/api/intel', createIntelRouter({ planningDir: resolved.planningDir }));
  app.use('/api/incidents', createIncidentsRouter({ planningDir: resolved.planningDir }));
  app.use('/api/sessions', createSessionsRouter({ planningDir: resolved.planningDir }));

  // 404 handler for unmatched /api/* routes
  app.all(/^\/api\//, (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Static file serving and SPA fallback
  setupStatic(app, resolved.distDir);

  return { app, options: resolved };
}

/**
 * Start the server, binding to the configured port.
 *
 * @param {object} [options] - Same options as createApp
 * @returns {import('http').Server}
 */
function startServer(options = {}) {
  const { app, options: resolved } = createApp(options);
  const server = app.listen(resolved.port, () => {
    console.log(`PBR Dashboard server listening on port ${resolved.port}`);
  });

  // File watcher for real-time updates
  const fileWatcher = new FileWatcher(resolved.planningDir);

  // Attach WebSocket server to HTTP server
  const { wss } = setupWebSocket(server, fileWatcher);

  // Start watching for file changes
  fileWatcher.start().then(() => {
    console.log(`File watcher started on ${resolved.planningDir}`);
  }).catch((err) => {
    console.error('Failed to start file watcher:', err.message);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down...');
    fileWatcher.stop().catch(() => {});
    wss.close();
    server.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

// Direct execution
if (require.main === module || process.argv[1] === __filename) {
  // Parse --dir and --port from command line args
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  const portIdx = args.indexOf('--port');
  const opts = {};
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    opts.planningDir = path.join(path.resolve(args[dirIdx + 1]), '.planning');
  }
  if (portIdx !== -1 && args[portIdx + 1]) {
    opts.port = Number(args[portIdx + 1]);
  }
  startServer(opts);
}

module.exports = { createApp, startServer };
