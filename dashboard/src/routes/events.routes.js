import { Router } from 'express';
import { addClient, removeClient } from '../services/sse.service.js';
import { tailLogFile } from '../services/log.service.js';
import { join } from 'node:path';

const router = Router();

/**
 * GET /stream - Server-Sent Events endpoint.
 * Establishes a long-lived SSE connection. Events are pushed by the SSE service
 * when the file watcher detects changes. Heartbeat comments every 30s keep the
 * connection alive.
 */
router.get('/stream', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();

  // Send initial connection confirmation
  res.write(': connected\n\n');

  // If client reconnected with a lastEventId, send state-recovery event
  if (req.query.lastEventId) {
    res.write(`event: state-recovery\ndata: {"action":"refresh"}\nid: ${Date.now()}\n\n`);
  }

  // Register this client for broadcasts
  addClient(res);

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

/**
 * GET /logs/stream?file=<filename>
 * SSE endpoint that tails a .planning/logs/<filename> for new JSONL entries.
 * Sends log-entry events to the connected client.
 */
router.get('/logs/stream', async (req, res) => {
  const { file } = req.query;

  // Validate filename to prevent path traversal
  if (!file || !/^[\w.-]+\.jsonl$/.test(file)) {
    res.status(400).end('Invalid log file parameter');
    return;
  }

  const projectDir = req.app.locals.projectDir;
  const filePath = join(projectDir, '.planning', 'logs', file);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  const sendEntry = (entry) => {
    try {
      const id = Date.now();
      res.write(`event: log-entry\ndata: ${JSON.stringify(entry)}\nid: ${id}\n\n`);
    } catch {
      // client disconnected
    }
  };

  const cleanup = await tailLogFile(filePath, sendEntry);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });
});

export default router;
