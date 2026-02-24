import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createAdaptorServer } from '@hono/node-server';
import { createApp } from '../../src/index.tsx';

/**
 * Integration tests for dashboard Hono routes.
 * Creates a temporary .planning/ directory with fixture data,
 * boots the app via createApp(), wraps it with createAdaptorServer for supertest.
 */

let app;
let projectDir;

beforeAll(async () => {
  // Create a temporary project directory with minimal .planning/ state
  projectDir = await mkdtemp(join(tmpdir(), 'pbr-dashboard-test-'));
  const planningDir = join(projectDir, '.planning');
  await mkdir(planningDir, { recursive: true });
  await mkdir(join(planningDir, 'phases', '01-setup'), { recursive: true });

  // STATE.md
  await writeFile(join(planningDir, 'STATE.md'), [
    '---',
    'phase: 1',
    'status: Planning',
    '---',
    '',
    '**Phase**: 1',
    '**Status**: Planning',
    ''
  ].join('\n'));

  // ROADMAP.md
  await writeFile(join(planningDir, 'ROADMAP.md'), [
    '# Roadmap',
    '',
    '## Phases',
    '',
    '### Phase 1 — Setup',
    '- Goal: Initial project setup',
    '- Dependencies: none',
    ''
  ].join('\n'));

  // config.json
  await writeFile(join(planningDir, 'config.json'), JSON.stringify({
    workflow: { depth: 'standard', context_strategy: 'aggressive' },
    features: {}
  }));

  const honoApp = createApp({ projectDir, port: 0 });
  app = createAdaptorServer(honoApp);
});

afterAll(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe('GET /', () => {
  it('returns 200 with HTML page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('returns HTML for HTMX requests', async () => {
    const res = await request(app)
      .get('/')
      .set('HX-Request', 'true');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /explorer', () => {
  it('returns 200 with HTML page', async () => {
    const res = await request(app).get('/explorer');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /timeline', () => {
  it('returns 200 with HTML page', async () => {
    const res = await request(app).get('/timeline');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /settings', () => {
  it('returns 200 with HTML page', async () => {
    const res = await request(app).get('/settings');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /favicon.ico', () => {
  it('returns 204 No Content', async () => {
    const res = await request(app).get('/favicon.ico');
    expect(res.status).toBe(204);
  });
});

describe('404 handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent-page');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('SSE endpoint', () => {
  it('returns event-stream content type', async () => {
    // SSE is a long-lived connection; we just verify headers
    const res = await request(app)
      .get('/api/events/stream')
      .buffer(false)
      .parse((res, callback) => {
        // Collect just the first chunk and abort
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
          res.destroy(); // Close connection after first chunk
        });
        res.on('end', () => callback(null, data));
        res.on('error', () => callback(null, data));
        res.on('close', () => callback(null, data));
      });
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });
});
