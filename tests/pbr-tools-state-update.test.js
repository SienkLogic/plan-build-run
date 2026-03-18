'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { stateUpdate, stateRecordActivity, stateUpdateProgress } = require('../plan-build-run/bin/lib/state.cjs');
const { configClearCache } = require('../plan-build-run/bin/lib/config.cjs');
const { syncBodyLine: _syncBodyLine } = require('../plan-build-run/bin/lib/state.cjs');

const STATE_FM = [
  '---', 'version: 2', 'current_phase: 3',
  'phase_slug: "auth"', 'status: "executing"', 'progress_percent: 40',
  'plans_total: 2', 'plans_complete: 1', 'last_activity: "2026-02-20 10:00:00"',
  'last_command: "/pbr:execute-phase 3"', 'blockers: []', '---',
  '# Project State', '', '## Current Position',
  'Phase: 3 of 5 (Auth)', 'Plan: 1 of 2 in current phase',
  'Status: Executing', 'Last activity: 2026-02-20 -- Phase 3 started',
  'Progress: [████████░░░░░░░░░░░░] 40%',
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

  test('updates status field in frontmatter AND body', () => {
    const result = stateUpdate('status', 'built');
    expect(result.success).toBe(true);
    expect(result.field).toBe('status');
    expect(result.value).toBe('built');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/status:\s*"built"/);
    expect(content).toMatch(/^Status: Built$/m);
  });

  test('updates current_phase field in frontmatter AND body', () => {
    const result = stateUpdate('current_phase', '4');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/current_phase:\s*4/);
    expect(content).toMatch(/^Phase: 4 of 5/m);
  });

  test('updates plans_complete field in frontmatter AND body', () => {
    const result = stateUpdate('plans_complete', '2');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/plans_complete:\s*2/);
    expect(content).toMatch(/^Plan: 2 of 2/m);
  });

  test('updates last_activity in frontmatter AND body', () => {
    const result = stateUpdate('last_activity', '2026-03-01 12:00:00');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('2026-03-01 12:00:00');
    expect(content).toMatch(/^Last activity: 2026-03-01 12:00:00$/m);
  });

  // --- Fields newly added to validFields ---

  test('updates progress_percent in frontmatter AND body', () => {
    const result = stateUpdate('progress_percent', '60');
    expect(result.success).toBe(true);
    expect(result.field).toBe('progress_percent');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/progress_percent:\s*60/);
    expect(content).toMatch(/^Progress: \[████████████░░░░░░░░\] 60%$/m);
  });

  test('updates phase_slug in frontmatter AND body', () => {
    const result = stateUpdate('phase_slug', 'api-layer');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('api-layer');
    expect(content).toMatch(/^Phase: 3 of 5 \(Api Layer\)$/m);
  });

  test('rejects total_phases field (removed field)', () => {
    const result = stateUpdate('total_phases', '6');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid field/);
  });

  test('updates last_command field', () => {
    const result = stateUpdate('last_command', '/pbr:plan-phase 4');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('/pbr:plan-phase 4');
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

  test('body lines without matching body content are left unchanged', () => {
    // Write STATE.md with frontmatter but no body position lines
    const minimal = [
      '---', 'version: 2', 'current_phase: 1', 'status: "planned"', '---',
      '# Project State', '', 'No position section here.',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), minimal);
    const result = stateUpdate('status', 'building');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/status:\s*"building"/);
    // Body unchanged (no Status: line to replace)
    expect(content).toContain('No position section here.');
  });

  test('phase_slug updates body with -- format', () => {
    // Write STATE.md with double-dash phase line format
    const dashState = STATE_FM.replace('Phase: 3 of 5 (Auth)', 'Phase: 3 of 5 -- Auth');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), dashState);
    const result = stateUpdate('phase_slug', 'api-layer');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/^Phase: 3 of 5 -- Api Layer$/m);
  });

  test('status with underscores displays as title case with spaces', () => {
    const result = stateUpdate('status', 'needs_fixes');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/^Status: Needs Fixes$/m);
  });
});

describe('syncBodyLine — unit tests', () => {
  const { syncBodyLine, buildProgressBar } = require('../plan-build-run/bin/lib/state.cjs');

  const sampleContent = [
    '---', 'version: 2', 'current_phase: 3', 'status: "building"', '---',
    '## Current Position',
    'Phase: 3 of 5 (Auth)',
    'Plan: 1 of 2 in current phase',
    'Status: Building',
    'Last activity: 2026-02-20 -- Started',
    'Progress: [████████░░░░░░░░░░░░] 40%',
  ].join('\n');

  test('syncBodyLine for status replaces Status: line', () => {
    const result = syncBodyLine(sampleContent, 'status', 'verified');
    expect(result).toMatch(/^Status: Verified$/m);
    expect(result).not.toMatch(/^Status: Building$/m);
  });

  test('syncBodyLine for plans_complete replaces plan count', () => {
    const result = syncBodyLine(sampleContent, 'plans_complete', '2');
    expect(result).toMatch(/^Plan: 2 of 2/m);
  });

  test('syncBodyLine for progress_percent replaces progress bar', () => {
    const result = syncBodyLine(sampleContent, 'progress_percent', '80');
    expect(result).toMatch(/^Progress: \[████████████████░░░░\] 80%$/m);
  });

  test('syncBodyLine for current_phase replaces phase number', () => {
    const result = syncBodyLine(sampleContent, 'current_phase', '4');
    expect(result).toMatch(/^Phase: 4 of 5/m);
  });

  test('syncBodyLine for phase_slug replaces parenthesized name', () => {
    const result = syncBodyLine(sampleContent, 'phase_slug', 'api-layer');
    expect(result).toMatch(/^Phase: 3 of 5 \(Api Layer\)$/m);
  });

  test('syncBodyLine for last_activity replaces activity line', () => {
    const result = syncBodyLine(sampleContent, 'last_activity', '2026-03-01 -- Done');
    expect(result).toMatch(/^Last activity: 2026-03-01 -- Done$/m);
  });

  test('syncBodyLine for last_command is a no-op', () => {
    const result = syncBodyLine(sampleContent, 'last_command', '/pbr:execute-phase');
    expect(result).toBe(sampleContent);
  });

  test('syncBodyLine for blockers is a no-op', () => {
    const result = syncBodyLine(sampleContent, 'blockers', 'none');
    expect(result).toBe(sampleContent);
  });

  test('buildProgressBar renders correctly at boundaries', () => {
    expect(buildProgressBar(0)).toBe('[░░░░░░░░░░░░░░░░░░░░] 0%');
    expect(buildProgressBar(100)).toBe('[████████████████████] 100%');
    expect(buildProgressBar(50)).toBe('[██████████░░░░░░░░░░] 50%');
  });

  test('syncBodyLine for plans_total replaces total in Plan line', () => {
    const result = syncBodyLine(sampleContent, 'plans_total', '5');
    expect(result).toMatch(/^Plan: 1 of 5/m);
  });
});

describe('stateUpdate — plans_total field', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-plans-total-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('stateUpdate accepts plans_total as valid field', () => {
    const result = stateUpdate('plans_total', '5');
    expect(result.success).toBe(true);
    expect(result.field).toBe('plans_total');
  });

  test('plans_total updates frontmatter and body', () => {
    stateUpdate('plans_total', '5');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/plans_total:\s*5/);
    expect(content).toMatch(/^Plan: 1 of 5/m);
  });
});

describe('stateRecordActivity', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-record-activity-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns success with today date and description', () => {
    const result = stateRecordActivity('Built phase 3');
    expect(result.success).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    expect(result.last_activity).toBe(`${today} Built phase 3`);
  });

  test('updates both frontmatter and body last_activity', () => {
    stateRecordActivity('Phase 3 planned');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    expect(content).toContain(`${today} Phase 3 planned`);
    expect(content).toMatch(/^Last activity:.*Phase 3 planned$/m);
  });

  test('multi-word description preserved', () => {
    const result = stateRecordActivity('Phase 3 built with 5 commits and 200 lines');
    expect(result.success).toBe(true);
    expect(result.last_activity).toContain('Phase 3 built with 5 commits and 200 lines');
  });

  test('returns error when STATE.md missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const result = stateRecordActivity('test');
    expect(result.success).toBe(false);
  });
});

describe('stateUpdateProgress', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-update-progress-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns error when STATE.md missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const result = stateUpdateProgress();
    expect(result.success).toBe(false);
  });

  test('returns 0% with empty phases dir', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
    const result = stateUpdateProgress();
    expect(result.success).toBe(true);
    expect(result.percent).toBe(0);
    expect(result.completed_plans).toBe(0);
    expect(result.total_plans).toBe(0);
  });

  test('calculates progress from plans and summaries', () => {
    const phasesDir = path.join(tmpDir, '.planning', 'phases');
    const phase3 = path.join(phasesDir, '03-auth');
    fs.mkdirSync(phase3, { recursive: true });
    fs.writeFileSync(path.join(phase3, 'PLAN-01.md'), '---\nplan: "3-01"\n---\n');
    fs.writeFileSync(path.join(phase3, 'PLAN-02.md'), '---\nplan: "3-02"\n---\n');
    fs.writeFileSync(path.join(phase3, 'SUMMARY.md'), '---\nstatus: complete\n---\n');
    const result = stateUpdateProgress();
    expect(result.success).toBe(true);
    expect(result.total_plans).toBeGreaterThanOrEqual(1);
  });

  test('updates frontmatter progress_percent atomically', () => {
    const phasesDir = path.join(tmpDir, '.planning', 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    stateUpdateProgress();
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toMatch(/progress_percent:\s*\d+/);
    expect(content).toMatch(/^Progress: \[/m);
  });
});
