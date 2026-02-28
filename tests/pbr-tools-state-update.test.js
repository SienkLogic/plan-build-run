'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { stateUpdate, configClearCache } = require('../plugins/pbr/scripts/pbr-tools');

const STATE_FM = [
  '---', 'version: 2', 'current_phase: 3', 'total_phases: 5',
  'phase_slug: "auth"', 'status: "executing"', 'progress_percent: 40',
  'plans_total: 2', 'plans_complete: 1', 'last_activity: "2026-02-20 10:00:00"',
  'last_command: "/pbr:build 3"', 'blockers: []', '---',
  '# Project State', '', '## Current Position',
  'Phase: 3 of 5 -- Auth', 'Plan: 1 of 2 in current phase',
  'Status: executing', 'Progress: 40%',
].join('\n');

function buildFixture(tmpDir) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), STATE_FM);
}

describe('stateUpdate — expanded field coverage', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-state-update-test-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Fields that were already in validFields ---

  test('updates status field', () => {
    const result = stateUpdate('status', 'built');
    expect(result.success).toBe(true);
    expect(result.field).toBe('status');
    expect(result.value).toBe('built');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/status:\s*"built"/);
  });

  test('updates current_phase field', () => {
    const result = stateUpdate('current_phase', '4');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/current_phase:\s*4/);
  });

  test('updates plans_complete field', () => {
    const result = stateUpdate('plans_complete', '2');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/plans_complete:\s*2/);
  });

  test('updates last_activity with explicit value', () => {
    const result = stateUpdate('last_activity', '2026-03-01 12:00:00');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('2026-03-01 12:00:00');
  });

  // --- Fields newly added to validFields ---

  test('updates progress_percent field', () => {
    const result = stateUpdate('progress_percent', '60');
    expect(result.success).toBe(true);
    expect(result.field).toBe('progress_percent');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/progress_percent:\s*60/);
  });

  test('updates phase_slug field', () => {
    const result = stateUpdate('phase_slug', 'api');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('api');
  });

  test('updates total_phases field', () => {
    const result = stateUpdate('total_phases', '6');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/total_phases:\s*6/);
  });

  test('updates last_command field', () => {
    const result = stateUpdate('last_command', '/pbr:plan 4');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('/pbr:plan 4');
  });

  test('updates blockers field', () => {
    const result = stateUpdate('blockers', 'waiting for API keys');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('waiting for API keys');
  });

  // --- last_activity 'now' auto-timestamp ---

  test('last_activity with "now" auto-timestamps with ISO-like format', () => {
    const before = Date.now();
    const result = stateUpdate('last_activity', 'now');
    const after = Date.now();
    expect(result.success).toBe(true);
    // value should be a timestamp, not the literal string 'now'
    expect(result.value).not.toBe('now');
    // Should look like a date/time string (YYYY-MM-DD HH:MM:SS)
    expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // The timestamp should be within the test window
    const parsed = new Date(result.value.replace(' ', 'T') + 'Z').getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  // --- Error cases ---

  test('rejects unknown field', () => {
    const result = stateUpdate('nonexistent_field', 'value');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid field/);
    expect(result.error).toContain('nonexistent_field');
  });

  test('error message for unknown field lists valid fields', () => {
    const result = stateUpdate('bogus', 'x');
    expect(result.success).toBe(false);
    // Error should mention some valid fields to guide the caller
    expect(result.error).toMatch(/current_phase|status|progress_percent/);
  });

  test('returns error when STATE.md is missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const result = stateUpdate('status', 'built');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/STATE\.md not found/);
  });
});
