import { describe, it, expect, vi } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const createPlanningRouter = require('../../server/routes/planning.js');

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    json(data) { this._json = data; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  return res;
}

function createReader(overrides = {}) {
  return {
    planningDir: '/tmp/test/.planning',
    getDecisions: vi.fn().mockResolvedValue([]),
    getPhases: vi.fn().mockResolvedValue([]),
    getMilestones: vi.fn().mockResolvedValue([]),
    getTodos: vi.fn().mockResolvedValue([]),
    getNotes: vi.fn().mockResolvedValue([]),
    getQuick: vi.fn().mockResolvedValue([]),
    getResearch: vi.fn().mockResolvedValue([]),
    getFiles: vi.fn().mockResolvedValue([]),
    getFileContent: vi.fn().mockResolvedValue({ content: '# Test', mtime: 1234 }),
    writeFile: vi.fn().mockResolvedValue({ ok: true, mtime: 5678 }),
    ...overrides,
  };
}

describe('planning routes', () => {
  it('GET /decisions returns decisions array', async () => {
    const decisions = [{ id: 1, phase: '01', text: 'Use React' }];
    const reader = createReader({ getDecisions: vi.fn().mockResolvedValue(decisions) });

    const router = createPlanningRouter(reader);
    // Find the decisions route (skip the middleware layer)
    const layer = router.stack.find(l => l.route && l.route.path === '/decisions' && l.route.methods.get);
    expect(layer).toBeDefined();

    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json).toEqual(decisions);
  });

  it('GET /:type returns data for valid types', async () => {
    const phases = [{ number: 1, name: 'Setup' }];
    const reader = createReader({ getPhases: vi.fn().mockResolvedValue(phases) });

    const router = createPlanningRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/:type' && l.route.methods.get);
    expect(layer).toBeDefined();

    const res = mockRes();
    await layer.route.stack[0].handle({ params: { type: 'phases' } }, res);

    expect(res._json).toEqual(phases);
    expect(reader.getPhases).toHaveBeenCalled();
  });

  it('GET /:type returns 400 for invalid type', async () => {
    const reader = createReader();

    const router = createPlanningRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/:type' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({ params: { type: 'invalid' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toContain('Invalid planning type');
  });

  it('GET /files returns file listing', async () => {
    const files = [{ name: 'STATE.md', size: 1234 }, { name: 'ROADMAP.md', size: 5678 }];
    const reader = createReader({ getFiles: vi.fn().mockResolvedValue(files) });

    const router = createPlanningRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/files' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json).toEqual(files);
  });

  it('GET /files/:filename returns 400 for non-.md files', async () => {
    const reader = createReader();

    const router = createPlanningRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/files/:filename' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({ params: { filename: 'config.json' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toContain('.md');
  });

  it('POST /todos returns 400 when title is missing', async () => {
    const reader = createReader();

    const router = createPlanningRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/todos' && l.route.methods.post);
    const res = mockRes();
    await layer.route.stack[0].handle({ body: {}, method: 'POST', headers: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toContain('title');
  });
});
