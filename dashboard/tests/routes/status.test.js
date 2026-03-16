import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const createStatusRouter = require('../../server/routes/status.js');
const { PlanningReader } = require('../../server/services/planning-reader.js');

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

describe('PlanningReader integration with arbitrary directory', () => {
  let tempDir;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('getStatus reads STATE.md from arbitrary temp directory', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dash-'));
    fs.writeFileSync(
      path.join(tempDir, 'STATE.md'),
      '---\nphase: "01"\nstatus: "building"\n---\n'
    );

    const reader = new PlanningReader(tempDir);
    const status = await reader.getStatus();

    expect(status.phase).toBe('01');
    expect(status.status).toBe('building');
  });

  it('getRoadmapPhases reads ROADMAP.md from arbitrary temp directory', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dash-'));
    const roadmapContent = [
      '---',
      'title: "Test Roadmap"',
      '---',
      '',
      '## Phase Checklist',
      '- [x] Phase 1: Foundation',
      '- [ ] Phase 2: Features',
      '',
      '## Phase Details',
      '',
      '### Phase 1: Foundation',
      '**Goal:** Set up project structure',
      '**Depends on:** none',
      '',
      '### Phase 2: Features',
      '**Goal:** Build core features',
      '**Depends on:** Phase 1',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tempDir, 'ROADMAP.md'), roadmapContent);

    const reader = new PlanningReader(tempDir);
    const phases = await reader.getRoadmapPhases();

    expect(phases.length).toBeGreaterThanOrEqual(1);
    expect(phases[0]).toHaveProperty('number');
    expect(phases[0]).toHaveProperty('name');
  });

  it('getStatus returns error for missing STATE.md', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dash-'));

    const reader = new PlanningReader(tempDir);
    const status = await reader.getStatus();

    expect(status).toEqual({ error: 'No STATE.md found' });
  });
});
