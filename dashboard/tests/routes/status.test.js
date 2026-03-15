import { describe, it, expect, vi } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const createStatusRouter = require('../../server/routes/status.js');

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    json(data) { this._json = data; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  return res;
}

describe('status routes', () => {
  it('GET / returns status from planningReader', async () => {
    const status = { phase: '03', status: 'building', plans_total: 3, plans_complete: 1 };
    const reader = {
      getStatus: vi.fn().mockResolvedValue(status),
    };

    const router = createStatusRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    expect(layer).toBeDefined();

    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json).toEqual(status);
    expect(reader.getStatus).toHaveBeenCalled();
  });

  it('GET / returns error when getStatus returns error object', async () => {
    const reader = {
      getStatus: vi.fn().mockResolvedValue({ error: 'No STATE.md found' }),
    };

    const router = createStatusRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json).toEqual({ error: 'No STATE.md found' });
  });

  it('GET / returns 500 on reader exception', async () => {
    const reader = {
      getStatus: vi.fn().mockRejectedValue(new Error('read failure')),
    };

    const router = createStatusRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res.statusCode).toBe(500);
    expect(res._json.error).toBe('read failure');
  });
});
