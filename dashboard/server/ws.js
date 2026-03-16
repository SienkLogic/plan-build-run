'use strict';

const { WebSocketServer, WebSocket } = require('ws');

/**
 * Broadcast a LiveEvent to all connected WebSocket clients.
 *
 * @param {WebSocketServer} wss - The WebSocket server instance
 * @param {object} event - LiveEvent-shaped object to broadcast
 */
function broadcast(wss, event) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (_err) {
        // Per-client send errors are non-fatal
      }
    }
  }
}

/**
 * Attach a WebSocket server to an HTTP server and wire it to a FileWatcher.
 *
 * - Clients connect at /ws
 * - On connect, clients receive a welcome message
 * - File change events from the watcher are broadcast to all clients
 * - Heartbeat ping/pong runs every 30s to detect stale connections
 *
 * @param {import('http').Server} server - HTTP server to attach to
 * @param {import('./services/file-watcher').FileWatcher} fileWatcher - FileWatcher instance
 * @returns {{ wss: WebSocketServer }}
 */
function setupWebSocket(server, fileWatcher) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Track alive status for heartbeat
  const aliveMap = new WeakMap();

  wss.on('connection', (ws) => {
    aliveMap.set(ws, true);
    console.log(`WebSocket client connected (${wss.clients.size} total)`);

    // Send welcome message
    ws.send(JSON.stringify({
      ts: new Date().toISOString(),
      type: 'connection',
      source: 'server',
      msg: 'Connected to PBR Dashboard WebSocket',
      level: 'info',
    }));

    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    ws.on('error', () => {
      // Errors are non-fatal; client will be cleaned up on close
    });

    ws.on('close', () => {
      aliveMap.delete(ws);
      console.log(`WebSocket client disconnected (${wss.clients.size} total)`);
    });
  });

  // Heartbeat: ping all clients every 30s, terminate unresponsive ones
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (aliveMap.get(ws) === false) {
        ws.terminate();
        continue;
      }
      aliveMap.set(ws, false);
      ws.ping();
    }
  }, 30000);

  // Clean up heartbeat when server closes
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Forward file watcher events to all clients
  if (fileWatcher) {
    fileWatcher.on('event', (event) => {
      broadcast(wss, event);
    });
  }

  return { wss };
}

module.exports = { setupWebSocket, broadcast };
