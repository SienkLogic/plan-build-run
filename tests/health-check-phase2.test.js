'use strict';

/**
 * Tests for Phase 2 health check feature status reporting
 * Validates cmdValidateHealth reports enabled/disabled/degraded for
 * inline_simple_tasks, rich_agent_prompts, and multi_phase_awareness.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-health-p2-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '01-test'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "building"\n---\nPhase: 1 of 1 (Test)');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
    '### Phase 1: Test\n**Goal:** Test\n');
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
    '# Project\n\n## What This Is\n\nTest.\n\n## Core Value\n\nTest.\n\n## Requirements\n\nNone.\n');
  mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
  mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mockStderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  mockExit.mockRestore();
  mockStdout.mockRestore();
  mockStderr.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { cmdValidateHealth } = require('../plugins/pbr/scripts/lib/verify');

function parseOutput() {
  const raw = mockStdout.mock.calls.map(c => c[0]).join('');
  try { return JSON.parse(raw); } catch { return null; }
}

function runHealth(config) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
    JSON.stringify(config, null, 2));
  try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* EXIT mock */ }
  return parseOutput();
}

describe('Phase 2 health check — inline_simple_tasks', () => {
  test('reports enabled when toggle true and workflow props valid', async () => {
    const result = runHealth({
      features: { inline_simple_tasks: true },
      workflow: { inline_max_files: 5, inline_max_lines: 50 }
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.inline_simple_tasks).toEqual({
      enabled: true,
      status: 'enabled'
    });
  });

  test('reports disabled when toggle false', async () => {
    const result = runHealth({
      features: { inline_simple_tasks: false },
      workflow: {}
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.inline_simple_tasks).toEqual({
      enabled: false,
      status: 'disabled'
    });
  });

  test('reports degraded when enabled but inline_max_files/inline_max_lines missing', async () => {
    const result = runHealth({
      features: { inline_simple_tasks: true },
      workflow: {}
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.inline_simple_tasks).toEqual({
      enabled: true,
      status: 'degraded'
    });
  });
});

describe('Phase 2 health check — rich_agent_prompts', () => {
  test('reports enabled when toggle true', async () => {
    const result = runHealth({
      features: { rich_agent_prompts: true },
      workflow: {}
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.rich_agent_prompts).toEqual({
      enabled: true,
      status: 'enabled'
    });
  });

  test('reports disabled when toggle false', async () => {
    const result = runHealth({
      features: { rich_agent_prompts: false },
      workflow: {}
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.rich_agent_prompts).toEqual({
      enabled: false,
      status: 'disabled'
    });
  });
});

describe('Phase 2 health check — multi_phase_awareness', () => {
  test('reports enabled when toggle true and max_phases_in_context set', async () => {
    const result = runHealth({
      features: { multi_phase_awareness: true },
      workflow: { max_phases_in_context: 3 }
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.multi_phase_awareness).toEqual({
      enabled: true,
      status: 'enabled'
    });
  });

  test('reports degraded when enabled but max_phases_in_context missing', async () => {
    const result = runHealth({
      features: { multi_phase_awareness: true },
      workflow: {}
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.multi_phase_awareness).toEqual({
      enabled: true,
      status: 'degraded'
    });
  });
});

describe('Phase 2 health check — all features combined', () => {
  test('all 3 features report status simultaneously', async () => {
    const result = runHealth({
      features: {
        inline_simple_tasks: true,
        rich_agent_prompts: false,
        multi_phase_awareness: true
      },
      workflow: {
        inline_max_files: 10,
        inline_max_lines: 100,
        max_phases_in_context: 5
      }
    });
    expect(result).not.toBeNull();
    expect(result.feature_status.inline_simple_tasks.status).toBe('enabled');
    expect(result.feature_status.rich_agent_prompts.status).toBe('disabled');
    expect(result.feature_status.multi_phase_awareness.status).toBe('enabled');
  });
});
