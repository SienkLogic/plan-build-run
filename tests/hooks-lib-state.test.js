/**
 * Tests for hooks/lib/state.js — STATE.md operations.
 *
 * Covers exported functions: parseStateMd,
 * updateFrontmatterField, syncBodyLine, buildProgressBar, stateLoad,
 * stateCheckProgress, stateUpdate, statePatch, stateAdvancePlan,
 * stateRecordMetric, stateRecordActivity, stateUpdateProgress.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
const {
  parseStateMd,
  updateFrontmatterField,
  syncBodyLine,
  buildProgressBar,
  stateLoad,
  stateCheckProgress,
  stateUpdate,
  statePatch,
  stateAdvancePlan,
  stateRecordMetric,
  stateRecordActivity,
  stateUpdateProgress
} = require('../plugins/pbr/scripts/lib/state');

// --- Fixtures ---

const V2_STATE = `---
version: 2
current_phase: 3
phase_slug: "auth-system"
status: "building"
progress_percent: 40
plans_total: 5
plans_complete: 2
last_activity: "2026-03-10 Built phase 2"
last_command: "build"
blockers: []
---

# Project State

Phase: 3 of 8 (Auth System)
Status: Building
Progress: [████████░░░░░░░░░░░░] 40%
Plan: 2 of 5
Last activity: 2026-03-10 Built phase 2
`;

const V1_STATE = `# Project State

Phase: 2 of 6 -- Authentication
Status: built
Progress: 33%

## Current Work
Plan: 1 of 2
Wave: 1
`;

const MINIMAL_ROADMAP = `# Roadmap

## Progress

| Phase | Plans Complete | Status |
|-------|---------------|--------|
| 1. Setup | 0/1 | planned |
| 2. Auth | 1/2 | building |
`;

// --- Helpers ---

let tmpDir, planningDir;
let stderrSpy;

function setupTmp() {
  const tmp = createTmpPlanning();
  tmpDir = tmp.tmpDir;
  planningDir = tmp.planningDir;
  return { tmpDir, planningDir };
}

function writeStateV2(dir) {
  writePlanningFile(dir || planningDir, 'STATE.md', V2_STATE);
}

function writeStateV1(dir) {
  writePlanningFile(dir || planningDir, 'STATE.md', V1_STATE);
}

afterEach(async () => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    cleanupTmp(tmpDir);
  }
  tmpDir = null;
  planningDir = null;
  configClearCache();
  if (stderrSpy) {
    stderrSpy.mockRestore();
    stderrSpy = null;
  }
});

// ===== parseStateMd =====

describe('parseStateMd', () => {
  it('parses v2 frontmatter format', async () => {
    const result = parseStateMd(V2_STATE);
    expect(result.format).toBe('frontmatter');
    expect(result.current_phase).toBe(3);
    expect(result.phase_name).toBe('auth-system');
    expect(result.status).toBe('building');
    expect(result.progress).toBe(40);
    expect(result.plans_total).toBe(5);
    expect(result.plans_complete).toBe(2);
    expect(result.last_activity).toBe('2026-03-10 Built phase 2');
    expect(result.last_command).toBe('build');
    expect(result.blockers).toEqual([]);
  });

  it('returns nulls for v1 format (no longer parsed)', async () => {
    const result = parseStateMd(V1_STATE);
    expect(result.format).toBe('frontmatter');
    expect(result.current_phase).toBeNull();
    expect(result.status).toBeNull();
    expect(result.progress).toBeNull();
  });

  it('handles CRLF content identically to LF', async () => {
    const crlfContent = V2_STATE.replace(/\n/g, '\r\n');
    const lfResult = parseStateMd(V2_STATE);
    const crlfResult = parseStateMd(crlfContent);
    expect(crlfResult.current_phase).toBe(lfResult.current_phase);
    expect(crlfResult.status).toBe(lfResult.status);
    expect(crlfResult.progress).toBe(lfResult.progress);
    expect(crlfResult.format).toBe('frontmatter');
  });

  it('returns nulls for empty content', async () => {
    const result = parseStateMd('');
    expect(result.current_phase).toBeNull();
    expect(result.phase_name).toBeNull();
    expect(result.status).toBeNull();
    expect(result.progress).toBeNull();
  });

  it('returns nulls for minimal content without frontmatter', async () => {
    const result = parseStateMd('# Just a heading\nSome text');
    expect(result.format).toBe('frontmatter');
    expect(result.current_phase).toBeNull();
    expect(result.status).toBeNull();
  });

  it('extracts phase_name from phase_slug in v2', async () => {
    const content = `---\ncurrent_phase: 1\nphase_slug: "my-cool-phase"\n---\n`;
    const result = parseStateMd(content);
    expect(result.phase_name).toBe('my-cool-phase');
  });
});

// ===== updateFrontmatterField =====

describe('updateFrontmatterField', () => {
  it('updates an existing field', async () => {
    const result = updateFrontmatterField(V2_STATE, 'status', 'built');
    expect(result).toContain('status: "built"');
    expect(result).not.toContain('status: "building"');
  });

  it('adds a new field not yet present', async () => {
    const result = updateFrontmatterField(V2_STATE, 'new_field', 'hello');
    expect(result).toContain('new_field: "hello"');
  });

  it('keeps integer values unquoted', async () => {
    const result = updateFrontmatterField(V2_STATE, 'current_phase', 5);
    expect(result).toContain('current_phase: 5');
    expect(result).not.toContain('current_phase: "5"');
  });

  it('quotes string values', async () => {
    const result = updateFrontmatterField(V2_STATE, 'status', 'verified');
    expect(result).toContain('status: "verified"');
  });

  it('returns content unchanged if no frontmatter delimiters', async () => {
    const plain = '# No frontmatter here\nJust text.';
    const result = updateFrontmatterField(plain, 'status', 'built');
    expect(result).toBe(plain);
  });

  it('preserves body content after frontmatter', async () => {
    const result = updateFrontmatterField(V2_STATE, 'status', 'built');
    expect(result).toContain('# Project State');
    expect(result).toContain('Phase: 3 of 8');
  });
});

// updateLegacyStateField tests removed

// ===== syncBodyLine =====

describe('syncBodyLine', () => {
  it('syncs status with title case and underscore removal', async () => {
    const result = syncBodyLine(V2_STATE, 'status', 'needs_fixes');
    expect(result).toContain('Status: Needs Fixes');
  });

  it('syncs plans_complete', async () => {
    const result = syncBodyLine(V2_STATE, 'plans_complete', 4);
    expect(result).toContain('Plan: 4 of 5');
  });

  it('syncs plans_total', async () => {
    const result = syncBodyLine(V2_STATE, 'plans_total', 10);
    expect(result).toContain('Plan: 2 of 10');
  });

  it('syncs progress_percent with progress bar', async () => {
    const result = syncBodyLine(V2_STATE, 'progress_percent', 75);
    expect(result).toMatch(/Progress:.*75%/);
    expect(result).toContain('███████████████');
  });

  it('returns content unchanged for NaN progress_percent', async () => {
    const result = syncBodyLine(V2_STATE, 'progress_percent', 'abc');
    expect(result).toBe(V2_STATE);
  });

  it('syncs last_activity', async () => {
    const result = syncBodyLine(V2_STATE, 'last_activity', '2026-03-19 new activity');
    expect(result).toContain('Last activity: 2026-03-19 new activity');
  });

  it('syncs current_phase number', async () => {
    const result = syncBodyLine(V2_STATE, 'current_phase', 7);
    expect(result).toContain('Phase: 7 of 8');
  });

  it('syncs phase_slug with parenthesized name', async () => {
    const result = syncBodyLine(V2_STATE, 'phase_slug', 'new-phase');
    expect(result).toContain('(New Phase)');
  });

  it('syncs phase_slug with dashed name format', async () => {
    const dashed = V2_STATE.replace('(Auth System)', '-- Auth System');
    const result = syncBodyLine(dashed, 'phase_slug', 'new-phase');
    expect(result).toContain('-- New Phase');
  });

  it('returns content unchanged for unknown field', async () => {
    const result = syncBodyLine(V2_STATE, 'unknown_field', 'value');
    expect(result).toBe(V2_STATE);
  });
});

// ===== buildProgressBar =====

describe('buildProgressBar', () => {
  it('builds 0% bar', async () => {
    const bar = buildProgressBar(0);
    expect(bar).toBe('[░░░░░░░░░░░░░░░░░░░░] 0%');
  });

  it('builds 50% bar', async () => {
    const bar = buildProgressBar(50);
    expect(bar).toBe('[██████████░░░░░░░░░░] 50%');
  });

  it('builds 100% bar', async () => {
    const bar = buildProgressBar(100);
    expect(bar).toBe('[████████████████████] 100%');
  });

  it('handles 25% bar', async () => {
    const bar = buildProgressBar(25);
    expect(bar).toContain('25%');
    expect(bar).toContain('█████');
  });
});

// ===== stateLoad =====

describe('stateLoad', () => {
  it('returns exists:false for missing .planning dir', async () => {
    const nonexistent = path.join(os.tmpdir(), 'pbr-nonexistent-' + Date.now());
    const result = stateLoad(nonexistent);
    expect(result.exists).toBe(false);
    expect(result.config).toBeNull();
    expect(result.state).toBeNull();
  });

  it('loads populated state from temp directory', async () => {
    setupTmp();
    writeStateV2();
    writePlanningFile(planningDir, 'config.json', JSON.stringify({ project_name: 'test' }));
    writePlanningFile(planningDir, 'ROADMAP.md', MINIMAL_ROADMAP);

    const result = stateLoad(planningDir);
    expect(result.exists).toBe(true);
    expect(result.config).toEqual({ project_name: 'test' });
    expect(result.state).toBeDefined();
    expect(result.state.current_phase).toBe(3);
    expect(result.state.format).toBe('frontmatter');
    expect(result.current_phase).toBe(3);
    expect(result.roadmap).toBeDefined();
    expect(result.phase_count).toBe(2);
  });

  it('returns _error for malformed config.json', async () => {
    setupTmp();
    writeStateV2();
    writePlanningFile(planningDir, 'config.json', 'not json{{{');

    const result = stateLoad(planningDir);
    expect(result.exists).toBe(true);
    expect(result.config._error).toBe('Failed to parse config.json');
  });

  it('handles missing STATE.md gracefully', async () => {
    setupTmp();
    const result = stateLoad(planningDir);
    expect(result.exists).toBe(true);
    expect(result.state).toBeNull();
  });

  it('handles missing ROADMAP.md gracefully', async () => {
    setupTmp();
    writeStateV2();
    const result = stateLoad(planningDir);
    expect(result.exists).toBe(true);
    expect(result.roadmap).toBeNull();
    expect(result.phase_count).toBe(0);
  });
});

// ===== stateUpdate =====

describe('stateUpdate', () => {
  it('updates a valid field in v2 format', async () => {
    setupTmp();
    writeStateV2();
    const result = await stateUpdate('status', 'built', planningDir);
    expect(result.success).toBe(true);
    expect(result.field).toBe('status');
    expect(result.value).toBe('built');
    // Verify written to disk
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('status: "built"');
  });

  it('rejects invalid field', async () => {
    setupTmp();
    writeStateV2();
    const result = await stateUpdate('invalid_field', 'val', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid field');
  });

  it('returns error for missing STATE.md', async () => {
    setupTmp();
    const result = await stateUpdate('status', 'built', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });

  it('auto-timestamps last_activity with value "now"', async () => {
    setupTmp();
    writeStateV2();
    const result = await stateUpdate('last_activity', 'now', planningDir);
    expect(result.success).toBe(true);
    // Value should be a timestamp, not literally "now"
    expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('updates v2 format fields', async () => {
    setupTmp();
    writeStateV2();
    const result = await stateUpdate('status', 'verified', planningDir);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('status: "verified"');
  });

  it('syncs body line after frontmatter update', async () => {
    setupTmp();
    writeStateV2();
    await stateUpdate('status', 'needs_fixes', planningDir);
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Status: Needs Fixes');
  });
});

// ===== statePatch =====

describe('statePatch', () => {
  it('updates multiple fields at once', async () => {
    setupTmp();
    writeStateV2();
    const json = JSON.stringify({ status: 'built', plans_complete: '4' });
    const result = await statePatch(json, planningDir);
    expect(result.success).toBe(true);
    expect(result.updated).toContain('status');
    expect(result.updated).toContain('plans_complete');
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('status: "built"');
  });

  it('returns error for invalid JSON', async () => {
    setupTmp();
    writeStateV2();
    const result = await statePatch('not-json', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  it('reports unknown fields in error string', async () => {
    setupTmp();
    writeStateV2();
    const json = JSON.stringify({ status: 'built', bad_field: 'x' });
    const result = await statePatch(json, planningDir);
    expect(result.success).toBe(false);
    // Canonical returns a single error string, not an array
    expect(result.error).toContain('bad_field');
  });

  it('returns error for missing STATE.md', async () => {
    setupTmp();
    const result = await statePatch('{"status":"built"}', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });
});

// ===== stateAdvancePlan =====

describe('stateAdvancePlan', () => {
  it('increments plan counter and updates progress', async () => {
    setupTmp();
    writeStateV2();
    const result = await stateAdvancePlan(planningDir);
    expect(result.success).toBe(true);
    expect(result.previous_plan).toBe(2);
    expect(result.current_plan).toBe(3);
    expect(result.total_plans).toBe(5);
    expect(result.progress_percent).toBe(60);

    // Verify disk
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('plans_complete: 3');
  });

  it('does not exceed total plans', async () => {
    setupTmp();
    // Create a state where plans are already at max
    const atMax = V2_STATE.replace('Plan: 2 of 5', 'Plan: 5 of 5');
    writePlanningFile(planningDir, 'STATE.md', atMax);
    const result = await stateAdvancePlan(planningDir);
    expect(result.success).toBe(true);
    expect(result.current_plan).toBe(5);
    expect(result.progress_percent).toBe(100);
  });

  it('returns error when STATE.md is missing', async () => {
    setupTmp();
    const result = await stateAdvancePlan(planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });

  it('returns error when Plan: N of M not found', async () => {
    setupTmp();
    writePlanningFile(planningDir, 'STATE.md', '---\nversion: 2\n---\n# No plan line');
    const result = await stateAdvancePlan(planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not find Plan:');
  });
});

// ===== stateRecordActivity =====

describe('stateRecordActivity', () => {
  it('writes date-prefixed description to last_activity', async () => {
    setupTmp();
    writeStateV2();
    const result = await stateRecordActivity('Built phase 3', planningDir);
    expect(result.success).toBe(true);
    expect(result.last_activity).toMatch(/^\d{4}-\d{2}-\d{2} Built phase 3$/);

    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Built phase 3');
  });

  it('returns error when STATE.md is missing', async () => {
    setupTmp();
    const result = await stateRecordActivity('test', planningDir);
    expect(result.success).toBe(false);
  });
});

// ===== stateRecordMetric =====

describe('stateRecordMetric', () => {
  it('parses --duration and --plans-completed args', async () => {
    setupTmp();
    writeStateV2();
    // stateRecordMetric calls historyAppend which needs a history dir
    fs.mkdirSync(path.join(planningDir, 'history'), { recursive: true });
    const result = await stateRecordMetric(
      ['--duration', '30m', '--plans-completed', '3'],
      planningDir
    );
    expect(result.success).toBe(true);
    expect(result.duration_minutes).toBe(30);
    expect(result.plans_completed).toBe(3);
  });

  it('handles hour duration', async () => {
    setupTmp();
    writeStateV2();
    fs.mkdirSync(path.join(planningDir, 'history'), { recursive: true });
    const result = await stateRecordMetric(['--duration', '2h'], planningDir);
    expect(result.success).toBe(true);
    expect(result.duration_minutes).toBe(120);
  });
});

// ===== stateCheckProgress =====

describe('stateCheckProgress', () => {
  it('returns zeros for missing phases dir', async () => {
    setupTmp();
    const result = stateCheckProgress(planningDir);
    expect(result.total_plans).toBe(0);
    expect(result.completed_plans).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.phases).toEqual([]);
  });

  it('counts plans and completed summaries', async () => {
    setupTmp();
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), '---\nplan: "01-02"\n---\n');
    fs.writeFileSync(
      path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\n---\nDone'
    );

    const result = stateCheckProgress(planningDir);
    expect(result.total_plans).toBe(2);
    expect(result.completed_plans).toBe(1);
    expect(result.percentage).toBe(50);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].plans).toBe(2);
    expect(result.phases[0].completed).toBe(1);
  });
});

// ===== stateUpdateProgress =====

describe('stateUpdateProgress', () => {
  it('recalculates and writes progress to STATE.md', async () => {
    setupTmp();
    writeStateV2();

    // Create a phase with 2 plans, 1 completed
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), '---\nplan: "01-02"\n---\n');
    fs.writeFileSync(
      path.join(phaseDir, 'SUMMARY-01.md'),
      '---\nstatus: complete\n---\nDone'
    );

    const result = await stateUpdateProgress(planningDir);
    expect(result.success).toBe(true);
    expect(result.total_plans).toBe(2);
    expect(result.completed_plans).toBe(1);
    expect(result.percent).toBe(50);

    // Verify disk
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('progress_percent: 50');
  });

  it('returns error for missing STATE.md', async () => {
    setupTmp();
    const result = await stateUpdateProgress(planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });
});
