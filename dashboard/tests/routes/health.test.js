import { describe, it, expect } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const healthRouter = require('../../server/routes/health.js');

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    json(data) { this._json = data; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  return res;
}

describe('health route', () => {
  it('GET / returns status ok with 200', async () => {
    const layer = healthRouter.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    expect(layer).toBeDefined();

    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res.statusCode).toBe(200);
    expect(res._json.status).toBe('ok');
  });

  it('GET / includes uptime, version, and timestamp fields', async () => {
    const layer = healthRouter.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json).toHaveProperty('uptime');
    expect(res._json).toHaveProperty('version');
    expect(res._json).toHaveProperty('timestamp');
    expect(typeof res._json.uptime).toBe('number');
    expect(typeof res._json.timestamp).toBe('string');
  });
});
