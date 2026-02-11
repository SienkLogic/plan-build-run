import { Router } from 'express';
import { addClient, removeClient } from '../services/sse.service.js';

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

export default router;
