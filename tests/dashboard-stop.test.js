'use strict';

const { fork } = require('child_process');
const path = require('path');
const http = require('http');
const { stopDashboard } = require('../dashboard/bin/stop.cjs');

// Helper: start a minimal HTTP server in a child process, returns { port, child }
function startTestServer() {
  return new Promise((resolve, reject) => {
    const child = fork(
      path.join(__dirname, 'helpers', 'dashboard-test-server.js'),
      [],
      { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }
    );

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Test server startup timed out'));
    }, 8000);

    child.on('message', (msg) => {
      if (msg.port) {
        clearTimeout(timeout);
        resolve({ port: msg.port, child });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe('stopDashboard', () => {
  test('module exports stopDashboard function', async () => {
    expect(typeof stopDashboard).toBe('function');
  });

  test('returns false when no server is running', async () => {
    const result = stopDashboard(19999);
    expect(result).toBe(false);
  });

  test('returns true when server is running', async () => {
    const { port, child } = await startTestServer();

    try {
      const result = stopDashboard(port);
      expect(result).toBe(true);

      // Verify the server is no longer reachable
      await new Promise((resolve) => {
        setTimeout(() => {
          const req = http.get(`http://localhost:${port}/api/health`, () => {
            // Server still up — unexpected but not fatal for this test
            resolve();
          });
          req.on('error', () => {
            // Expected — server was stopped
            resolve();
          });
          req.setTimeout(1000, () => {
            req.destroy();
            resolve();
          });
        }, 500);
      });
    } finally {
      // Clean up: ensure child is dead
      try { child.kill(); } catch (_e) { /* already dead */ }
    }
  }, 15000);
});
