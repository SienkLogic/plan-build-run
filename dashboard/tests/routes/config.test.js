import { describe, it, expect, vi } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const createConfigRouter = require('../../server/routes/config.js');

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    json(data) { this._json = data; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  return res;
}

describe('config routes', () => {
  it('GET / returns config from planningReader', async () => {
    const config = { mode: 'autonomous', depth: 'standard', version: 1 };
    const reader = {
      getConfig: vi.fn().mockResolvedValue(config),
    };

    const router = createConfigRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json).toEqual(config);
    expect(reader.getConfig).toHaveBeenCalled();
  });

  it('PUT / saves config and returns updated data', async () => {
    const updated = { mode: 'supervised', depth: 'thorough', version: 2 };
    const reader = {
      writeConfig: vi.fn().mockResolvedValue(updated),
    };

    const router = createConfigRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.put);
    const res = mockRes();
    await layer.route.stack[0].handle({ body: { mode: 'supervised', depth: 'thorough' } }, res);

    expect(res._json).toEqual(updated);
    expect(reader.writeConfig).toHaveBeenCalledWith({ mode: 'supervised', depth: 'thorough' });
  });

  it('PUT / returns 400 for non-object body', async () => {
    const reader = { writeConfig: vi.fn() };

    const router = createConfigRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.put);
    const res = mockRes();
    await layer.route.stack[0].handle({ body: 'not-an-object' }, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toContain('JSON object');
    expect(reader.writeConfig).not.toHaveBeenCalled();
  });

  it('PUT / returns 400 for invalid mode value', async () => {
    const reader = { writeConfig: vi.fn() };

    const router = createConfigRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.put);
    const res = mockRes();
    await layer.route.stack[0].handle({ body: { mode: 'invalid-mode' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.details).toContain('mode must be one of: autonomous, supervised, manual');
  });

  it('PUT / returns 400 for invalid depth value', async () => {
    const reader = { writeConfig: vi.fn() };

    const router = createConfigRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.put);
    const res = mockRes();
    await layer.route.stack[0].handle({ body: { depth: 'ultra' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.details[0]).toContain('depth');
  });

  it('GET / returns 500 on reader error', async () => {
    const reader = {
      getConfig: vi.fn().mockRejectedValue(new Error('file not found')),
    };

    const router = createConfigRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res.statusCode).toBe(500);
    expect(res._json.error).toBe('file not found');
  });
});
