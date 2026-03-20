'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { stateUpdate, stateRecordActivity, stateUpdateProgress, stateRecordVelocity, stateRecordSession, parseStateMd } = require('../plugins/pbr/scripts/lib/state');
const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
const { syncBodyLine: _syncBodyLine } = require('../plugins/pbr/scripts/lib/state');

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
  const { syncBodyLine, buildProgressBar } = require('../plugins/pbr/scripts/lib/state');

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

describe('stateUpdate — velocity and session fields', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-velocity-session-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('stateUpdate accepts velocity as valid field', () => {
    const result = stateUpdate('velocity', '{"plan_duration":{"history":[],"trend":"stable"}}');
    expect(result.success).toBe(true);
    expect(result.field).toBe('velocity');
  });

  test('stateUpdate accepts session_last as valid field', () => {
    const result = stateUpdate('session_last', '2026-03-18 10:00:00');
    expect(result.success).toBe(true);
    expect(result.field).toBe('session_last');
  });

  test('stateUpdate accepts session_stopped_at as valid field', () => {
    const result = stateUpdate('session_stopped_at', 'Phase 3, Plan 2, Task 4');
    expect(result.success).toBe(true);
    expect(result.field).toBe('session_stopped_at');
  });

  test('stateUpdate accepts session_resume as valid field', () => {
    const result = stateUpdate('session_resume', '.PROGRESS-03-02');
    expect(result.success).toBe(true);
    expect(result.field).toBe('session_resume');
  });

  test('velocity field persists in frontmatter', () => {
    stateUpdate('velocity', '{"test":"data"}');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('velocity:');
    expect(content).toContain('test');
  });

  test('session fields persist in frontmatter', () => {
    stateUpdate('session_last', '2026-03-18 14:30:00');
    stateUpdate('session_stopped_at', 'Plan 02-01 task 3');
    stateUpdate('session_resume', '.PROGRESS-02-01');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('session_last:');
    expect(content).toContain('session_stopped_at:');
    expect(content).toContain('session_resume:');
  });
});

describe('stateRecordVelocity', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-record-velocity-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('records a velocity metric and returns success', () => {
    const result = stateRecordVelocity('plan_duration', 15);
    expect(result.success).toBe(true);
    expect(result.metricType).toBe('plan_duration');
    expect(result.value).toBe(15);
    expect(result.trend).toBe('stable');
  });

  test('stores metric in frontmatter velocity field', () => {
    stateRecordVelocity('plan_duration', 10);
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('velocity:');
    expect(content).toContain('plan_duration');
  });

  test('keeps last 5 entries per metric type', () => {
    for (let i = 1; i <= 7; i++) {
      stateRecordVelocity('plan_duration', i * 10);
    }
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    const parsed = parseStateMd(content);
    const velocity = typeof parsed.velocity === 'string' ? JSON.parse(parsed.velocity) : parsed.velocity;
    expect(velocity.plan_duration.history.length).toBe(5);
    // Should keep the last 5 (values 30-70)
    expect(velocity.plan_duration.history[0].value).toBe(30);
  });

  test('calculates improving trend when recent values are lower', () => {
    // First entry with high value
    stateRecordVelocity('phase_duration', 100);
    // Add lower values
    stateRecordVelocity('phase_duration', 50);
    stateRecordVelocity('phase_duration', 40);
    const result = stateRecordVelocity('phase_duration', 30);
    expect(result.trend).toBe('improving');
  });

  test('returns error when STATE.md missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const result = stateRecordVelocity('plan_duration', 10);
    expect(result.success).toBe(false);
  });
});

describe('stateRecordSession', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-record-session-'));
    buildFixture(tmpDir);
    origCwd = process.cwd();
    process.chdir(tmpDir);
    configClearCache();
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('records session info and returns success', () => {
    const result = stateRecordSession('Phase 3, Plan 2, Task 4', '.PROGRESS-03-02');
    expect(result.success).toBe(true);
    expect(result.session_last).toBeTruthy();
    expect(result.session_stopped_at).toBe('Phase 3, Plan 2, Task 4');
    expect(result.session_resume).toBe('.PROGRESS-03-02');
  });

  test('sets all three session fields in frontmatter', () => {
    stateRecordSession('Plan 01-01 task 2', '.PROGRESS-01-01');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(content).toContain('session_last:');
    expect(content).toContain('session_stopped_at:');
    expect(content).toContain('session_resume:');
    expect(content).toContain('Plan 01-01 task 2');
    expect(content).toContain('.PROGRESS-01-01');
  });

  test('session_last is auto-timestamped', () => {
    const result = stateRecordSession('test', 'test-file');
    expect(result.session_last).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test('returns error when STATE.md missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const result = stateRecordSession('test', 'test-file');
    expect(result.success).toBe(false);
  });
});

describe('parseStateMd — velocity and session extraction', () => {
  test('extracts velocity from frontmatter', () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nstatus: "building"\nvelocity: "{\\"plan_duration\\":{\\"history\\":[],\\"trend\\":\\"stable\\"}}"\n---\n# State\n';
    const result = parseStateMd(content);
    expect(result.velocity).toBeTruthy();
  });

  test('extracts session fields from frontmatter', () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nstatus: "building"\nsession_last: "2026-03-18 10:00:00"\nsession_stopped_at: "Plan 2 task 3"\nsession_resume: ".PROGRESS-02-01"\n---\n# State\n';
    const result = parseStateMd(content);
    expect(result.session_last).toBe('2026-03-18 10:00:00');
    expect(result.session_stopped_at).toBe('Plan 2 task 3');
    expect(result.session_resume).toBe('.PROGRESS-02-01');
  });

  test('returns null for missing session fields', () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nstatus: "building"\n---\n# State\n';
    const result = parseStateMd(content);
    expect(result.session_last).toBeNull();
    expect(result.session_stopped_at).toBeNull();
    expect(result.session_resume).toBeNull();
    expect(result.velocity).toBeNull();
  });
});

describe('syncBodyLine — session fields', () => {
  const { syncBodyLine } = require('../plugins/pbr/scripts/lib/state');

  const contentWithSessionLines = [
    '---', 'version: 2', 'current_phase: 1', 'status: "building"', '---',
    '## Session',
    'Last session: 2026-03-17 09:00:00',
    'Stopped at: Plan 01-01 task 2',
    'Resume: .PROGRESS-01-01',
  ].join('\n');

  test('syncBodyLine for session_last replaces Last session line', () => {
    const result = syncBodyLine(contentWithSessionLines, 'session_last', '2026-03-18 14:00:00');
    expect(result).toMatch(/^Last session: 2026-03-18 14:00:00$/m);
  });

  test('syncBodyLine for session_stopped_at replaces Stopped at line', () => {
    const result = syncBodyLine(contentWithSessionLines, 'session_stopped_at', 'Plan 02-01 task 5');
    expect(result).toMatch(/^Stopped at: Plan 02-01 task 5$/m);
  });

  test('syncBodyLine for session_resume replaces Resume line', () => {
    const result = syncBodyLine(contentWithSessionLines, 'session_resume', '.PROGRESS-02-01');
    expect(result).toMatch(/^Resume: .PROGRESS-02-01$/m);
  });

  test('syncBodyLine for session fields is no-op when body lines are absent', () => {
    const noSessionContent = [
      '---', 'version: 2', '---',
      '## Position',
      'Status: Building',
    ].join('\n');
    expect(syncBodyLine(noSessionContent, 'session_last', 'value')).toBe(noSessionContent);
    expect(syncBodyLine(noSessionContent, 'session_stopped_at', 'value')).toBe(noSessionContent);
    expect(syncBodyLine(noSessionContent, 'session_resume', 'value')).toBe(noSessionContent);
  });
});
