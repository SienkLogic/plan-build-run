import { describe, it, expect, vi } from 'vitest';

// The route modules are CommonJS — use createRequire to load them
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const createRoadmapRouter = require('../../server/routes/roadmap.js');

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    json(data) { this._json = data; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  return res;
}

describe('roadmap routes', () => {
  it('GET / returns milestone and phases from planningReader', async () => {
    const reader = {
      getMilestones: vi.fn().mockResolvedValue([
        { name: 'v1.0', description: 'First release' },
      ]),
      getRoadmapPhases: vi.fn().mockResolvedValue([
        { number: 1, name: 'Setup', status: 'Built', slug: '01-setup' },
        { number: 2, name: 'Features', status: 'Planned', slug: '02-features' },
      ]),
      getPhases: vi.fn().mockResolvedValue([]),
    };

    const router = createRoadmapRouter(reader);
    // Find the GET / handler
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    expect(layer).toBeDefined();

    const req = {};
    const res = mockRes();
    await layer.route.stack[0].handle(req, res);

    expect(res._json.milestone.name).toBe('v1.0');
    expect(res._json.phases).toHaveLength(2);
    expect(res._json.phases[0].name).toBe('Setup');
  });

  it('GET / returns null milestone when none exist', async () => {
    const reader = {
      getMilestones: vi.fn().mockResolvedValue([]),
      getRoadmapPhases: vi.fn().mockResolvedValue([]),
      getPhases: vi.fn().mockResolvedValue([]),
    };

    const router = createRoadmapRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res._json.milestone).toBe(null);
    expect(res._json.phases).toEqual([]);
  });

  it('GET / returns 500 on planningReader error', async () => {
    const reader = {
      getMilestones: vi.fn().mockRejectedValue(new Error('disk full')),
      getRoadmapPhases: vi.fn().mockResolvedValue([]),
      getPhases: vi.fn().mockResolvedValue([]),
    };

    const router = createRoadmapRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
    const res = mockRes();
    await layer.route.stack[0].handle({}, res);

    expect(res.statusCode).toBe(500);
    expect(res._json.error).toBe('disk full');
  });

  it('GET /phases/:slug returns 404 for empty phase', async () => {
    const reader = {
      getPhaseDetail: vi.fn().mockResolvedValue({
        plans: [], summaries: [], verifications: [], context: [],
      }),
    };

    const router = createRoadmapRouter(reader);
    const layer = router.stack.find(l => l.route && l.route.path === '/phases/:slug');
    const res = mockRes();
    await layer.route.stack[0].handle({ params: { slug: 'nonexistent' } }, res);

    expect(res.statusCode).toBe(404);
  });
});
