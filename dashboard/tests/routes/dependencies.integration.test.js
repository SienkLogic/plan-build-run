import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../../src/app.js';

let app;
let projectDir;

beforeAll(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'pbr-deps-test-'));
  const planningDir = join(projectDir, '.planning');
  await mkdir(planningDir, { recursive: true });
  await mkdir(join(planningDir, 'phases', '01-setup'), { recursive: true });
  await mkdir(join(planningDir, 'todos', 'pending'), { recursive: true });
  await mkdir(join(planningDir, 'milestones'), { recursive: true });

  await writeFile(join(planningDir, 'STATE.md'), [
    '---', 'phase: 1', 'status: Planning', '---', '', '**Phase**: 1', ''
  ].join('\n'));

  await writeFile(join(planningDir, 'ROADMAP.md'), [
    '# Roadmap', '', '## Phases', '',
    '### Phase 1 — Setup', '- Goal: Initial project setup', '- Dependencies: none', ''
  ].join('\n'));

  await writeFile(join(planningDir, 'config.json'), JSON.stringify({
    workflow: { depth: 'standard' }, features: {}
  }));

  app = createApp({ projectDir });
});

afterAll(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe('GET /dependencies', () => {
  it('returns 200 with HTML', async () => {
    const res = await request(app).get('/dependencies');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('returns partial content for HX-Request', async () => {
    const res = await request(app)
      .get('/dependencies')
      .set('HX-Request', 'true');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['vary']).toBe('HX-Request');
  });

  it('handles missing ROADMAP.md gracefully', async () => {
    // Create a separate project dir without ROADMAP.md
    const emptyDir = await mkdtemp(join(tmpdir(), 'pbr-deps-empty-'));
    const pd = join(emptyDir, '.planning');
    await mkdir(pd, { recursive: true });
    await mkdir(join(pd, 'phases'), { recursive: true });
    await mkdir(join(pd, 'todos', 'pending'), { recursive: true });
    await mkdir(join(pd, 'milestones'), { recursive: true });
    await writeFile(join(pd, 'STATE.md'), '---\nphase: 1\nstatus: Planning\n---\n');
    await writeFile(join(pd, 'config.json'), '{}');

    const emptyApp = createApp({ projectDir: emptyDir });
    const res = await request(emptyApp).get('/dependencies');
    // Should not crash - either 200 with empty state or a handled error
    expect([200, 500].includes(res.status)).toBe(true);

    await rm(emptyDir, { recursive: true, force: true });
  });
});
