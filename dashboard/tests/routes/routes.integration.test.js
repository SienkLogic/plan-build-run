import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../../src/app.js';

/**
 * Integration tests for dashboard Express routes.
 * Creates a temporary .planning/ directory with fixture data,
 * boots the app via createApp(), and tests routes via supertest.
 */

let app;
let projectDir;

beforeAll(async () => {
  // Create a temporary project directory with minimal .planning/ state
  projectDir = await mkdtemp(join(tmpdir(), 'pbr-dashboard-test-'));
  const planningDir = join(projectDir, '.planning');
  await mkdir(planningDir, { recursive: true });
  await mkdir(join(planningDir, 'phases', '01-setup'), { recursive: true });
  await mkdir(join(planningDir, 'todos', 'pending'), { recursive: true });
  await mkdir(join(planningDir, 'todos', 'done'), { recursive: true });
  await mkdir(join(planningDir, 'milestones'), { recursive: true });

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

  // A sample PLAN.md (service looks for {planId}-PLAN.md or PLAN.md)
  await writeFile(join(planningDir, 'phases', '01-setup', '01-01-PLAN.md'), [
    '---',
    'plan_id: "01-01"',
    'title: "Initial setup"',
    'wave: 1',
    'estimated_tasks: 3',
    '---',
    '',
    '# Plan 01-01: Initial setup',
    '',
    '## Tasks',
    '1. Create project structure',
    ''
  ].join('\n'));

  // A sample todo
  await writeFile(join(planningDir, 'todos', 'pending', '001-sample-todo.md'), [
    '---',
    'priority: medium',
    'created: 2026-01-01',
    '---',
    '',
    '# Sample todo',
    '',
    'This is a test todo.',
    ''
  ].join('\n'));

  app = createApp({ projectDir });
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

  it('returns partial content for HTMX requests', async () => {
    const res = await request(app)
      .get('/')
      .set('HX-Request', 'true');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /phases', () => {
  it('returns 200 with phases list', async () => {
    const res = await request(app).get('/phases');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['vary']).toBe('HX-Request');
  });
});

describe('GET /phases/:phaseId', () => {
  it('returns 200 for valid phase ID', async () => {
    const res = await request(app).get('/phases/01');
    expect(res.status).toBe(200);
  });

  it('includes phase navigation data', async () => {
    const res = await request(app).get('/phases/01');
    expect(res.status).toBe(200);
    expect(res.text).toContain('All Phases');
  });

  it('returns 404 for invalid phase ID format', async () => {
    const res = await request(app).get('/phases/abc');
    expect(res.status).toBe(404);
  });

  it('returns 404 for path traversal attempt', async () => {
    const res = await request(app).get('/phases/../../../etc/passwd');
    // Express normalizes the path, so this should either 404 or not match the route
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /phases/:phaseId/:planId/:docType', () => {
  it('returns 200 for valid plan document', async () => {
    const res = await request(app).get('/phases/01/01-01/plan');
    expect(res.status).toBe(200);
  });

  it('returns 404 for invalid planId format', async () => {
    const res = await request(app).get('/phases/01/bad/plan');
    expect(res.status).toBe(404);
  });

  it('returns 404 for invalid docType', async () => {
    const res = await request(app).get('/phases/01/01-01/invalid');
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent plan', async () => {
    const res = await request(app).get('/phases/01/99-99/plan');
    expect(res.status).toBe(404);
  });
});

describe('GET /todos', () => {
  it('returns 200 with todo list', async () => {
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /todos/new', () => {
  it('returns 200 with create form', async () => {
    const res = await request(app).get('/todos/new');
    expect(res.status).toBe(200);
  });
});

describe('GET /todos/:id', () => {
  it('returns 200 for valid todo', async () => {
    const res = await request(app).get('/todos/001');
    expect(res.status).toBe(200);
  });

  it('returns 404 for invalid ID format', async () => {
    const res = await request(app).get('/todos/abc');
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-three-digit ID', async () => {
    const res = await request(app).get('/todos/1');
    expect(res.status).toBe(404);
  });
});

describe('POST /todos', () => {
  it('creates a todo and redirects', async () => {
    const res = await request(app)
      .post('/todos')
      .type('form')
      .send({ title: 'New test todo', priority: 'low', description: 'Test' });
    // Should redirect to the new todo
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^\/todos\/\d{3}$/);
  });
});

describe('POST /todos/:id/done', () => {
  it('completes a todo and redirects', async () => {
    const res = await request(app).post('/todos/001/done');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/todos');
  });

  it('returns 404 for invalid ID format', async () => {
    const res = await request(app).post('/todos/abc/done');
    expect(res.status).toBe(404);
  });
});

describe('GET /milestones', () => {
  it('returns 200 with milestones list', async () => {
    const res = await request(app).get('/milestones');
    expect(res.status).toBe(200);
  });
});

describe('GET /milestones/:version', () => {
  it('returns 404 for non-existent milestone', async () => {
    const res = await request(app).get('/milestones/99.0.0');
    expect(res.status).toBe(404);
  });

  it('returns 404 for invalid version format', async () => {
    const res = await request(app).get('/milestones/../../etc');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /roadmap', () => {
  it('returns 200 with roadmap page', async () => {
    const res = await request(app).get('/roadmap');
    expect(res.status).toBe(200);
  });
});

describe('GET /favicon.ico', () => {
  it('returns 204 No Content', async () => {
    const res = await request(app).get('/favicon.ico');
    expect(res.status).toBe(204);
  });
});

describe('GET /sw.js', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/sw.js');
    expect(res.status).toBe(404);
  });
});

describe('404 handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent-page');
    expect(res.status).toBe(404);
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
