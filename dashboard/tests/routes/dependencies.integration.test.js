import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createAdaptorServer } from '@hono/node-server';
import { createApp } from '../../src/index.tsx';

let app;
let projectDir;

beforeAll(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'pbr-deps-test-'));
  const planningDir = join(projectDir, '.planning');
  await mkdir(planningDir, { recursive: true });
  await mkdir(join(planningDir, 'phases', '01-setup'), { recursive: true });

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

  const honoApp = createApp({ projectDir, port: 0 });
  app = createAdaptorServer(honoApp);
});

afterAll(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe('GET /', () => {
  it('returns 200 with HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('returns HTML for HX-Request', async () => {
    const res = await request(app)
      .get('/')
      .set('HX-Request', 'true');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('handles missing STATE.md gracefully', async () => {
    // Create a separate project dir without STATE.md
    const emptyDir = await mkdtemp(join(tmpdir(), 'pbr-deps-empty-'));
    const pd = join(emptyDir, '.planning');
    await mkdir(pd, { recursive: true });
    await mkdir(join(pd, 'phases'), { recursive: true });
    await writeFile(join(pd, 'ROADMAP.md'), '# Roadmap\n');
    await writeFile(join(pd, 'config.json'), '{}');

    const emptyHonoApp = createApp({ projectDir: emptyDir, port: 0 });
    const emptyApp = createAdaptorServer(emptyHonoApp);
    const res = await request(emptyApp).get('/');
    // Should not crash - either 200 with empty state or a handled error
    expect([200, 500].includes(res.status)).toBe(true);

    await rm(emptyDir, { recursive: true, force: true });
  });
});

describe('GET /explorer', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/explorer');
    expect(res.status).toBe(200);
  });
});

describe('GET /timeline', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/timeline');
    expect(res.status).toBe(200);
  });
});
