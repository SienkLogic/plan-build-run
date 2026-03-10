/**
 * routes.test.js -- API endpoint tests for the dashboard server.
 *
 * Validates health, status, requirements, roadmap, config endpoints,
 * and 404 handling for unmatched /api/* routes.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');

const { createApp } = require('../index');

// Point planningDir at the real .planning/ directory for integration tests
const PLANNING_DIR = path.resolve(__dirname, '..', '..', '..', '.planning');

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (_e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
  });
}

describe('Dashboard API Routes', () => {
  let server;
  let port;

  before(async () => {
    const { app } = createApp({ planningDir: PLANNING_DIR, port: 0 });
    server = app.listen(0);
    await new Promise((resolve) => server.on('listening', resolve));
    port = server.address().port;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /api/health returns 200 with status ok', async () => {
    const { status, body } = await get(port, '/api/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(typeof body.uptime === 'number', 'uptime should be a number');
    assert.ok(body.version, 'version should be present');
  });

  it('GET /api/status returns 200 with object', async () => {
    const { status, body } = await get(port, '/api/status');
    assert.equal(status, 200);
    assert.ok(typeof body === 'object', 'body should be an object');
  });

  it('GET /api/requirements returns 200 with requirements array', async () => {
    const { status, body } = await get(port, '/api/requirements');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.requirements), 'requirements should be an array');
  });

  it('GET /api/roadmap returns 200 with phases array', async () => {
    const { status, body } = await get(port, '/api/roadmap');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.phases), 'phases should be an array');
  });

  it('GET /api/config returns 200 with object', async () => {
    const { status, body } = await get(port, '/api/config');
    assert.equal(status, 200);
    assert.ok(typeof body === 'object', 'config should be an object');
  });

  it('GET /api/nonexistent returns 404', async () => {
    const { status, body } = await get(port, '/api/nonexistent');
    assert.equal(status, 404);
    assert.ok(body.error, 'should have error message');
  });
});
