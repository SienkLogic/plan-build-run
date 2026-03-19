/**
 * Tests for hooks/lib/state.js — STATE.md operations.
 *
 * Covers all 13 exported functions: parseStateMd, updateLegacyStateField,
 * updateFrontmatterField, syncBodyLine, buildProgressBar, stateLoad,
 * stateCheckProgress, stateUpdate, statePatch, stateAdvancePlan,
 * stateRecordMetric, stateRecordActivity, stateUpdateProgress.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { configClearCache } = require('../hooks/lib/config');
const {
  parseStateMd,
  updateLegacyStateField,
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
} = require('../hooks/lib/state');

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

## Phase Overview

| Phase | Name | Goal | Plans | Status |
|-------|------|------|-------|--------|
| 1 | Setup | Initialize | 0/1 | planned |
| 2 | Auth | Build auth | 1/2 | building |
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

afterEach(() => {
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
  it('parses v2 frontmatter format', () => {
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

  it('parses legacy v1 format', () => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseStateMd(V1_STATE);
    expect(result.format).toBe('legacy');
    expect(result.current_phase).toBe(2);
    expect(result.phase_name).toBe('Authentication');
    expect(result.status).toBe('built');
    expect(result.progress).toBe(33);
  });

  it('handles CRLF content identically to LF', () => {
    const crlfContent = V2_STATE.replace(/\n/g, '\r\n');
    const lfResult = parseStateMd(V2_STATE);
    const crlfResult = parseStateMd(crlfContent);
    expect(crlfResult.current_phase).toBe(lfResult.current_phase);
    expect(crlfResult.status).toBe(lfResult.status);
    expect(crlfResult.progress).toBe(lfResult.progress);
    expect(crlfResult.format).toBe('frontmatter');
  });

  it('returns nulls for empty content', () => {
    const result = parseStateMd('');
    expect(result.current_phase).toBeNull();
    expect(result.phase_name).toBeNull();
    expect(result.status).toBeNull();
    expect(result.progress).toBeNull();
  });

  it('returns nulls for minimal content without markers', () => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseStateMd('# Just a heading\nSome text');
    expect(result.format).toBe('legacy');
    expect(result.current_phase).toBeNull();
    expect(result.status).toBeNull();
  });

  it('extracts phase_name from phase_slug in v2', () => {
    const content = `---\ncurrent_phase: 1\nphase_slug: "my-cool-phase"\n---\n`;
    const result = parseStateMd(content);
    expect(result.phase_name).toBe('my-cool-phase');
  });
});

// ===== updateFrontmatterField =====

describe('updateFrontmatterField', () => {
  it('updates an existing field', () => {
    const result = updateFrontmatterField(V2_STATE, 'status', 'built');
    expect(result).toContain('status: "built"');
    expect(result).not.toContain('status: "building"');
  });

  it('adds a new field not yet present', () => {
    const result = updateFrontmatterField(V2_STATE, 'new_field', 'hello');
    expect(result).toContain('new_field: "hello"');
  });

  it('keeps integer values unquoted', () => {
    const result = updateFrontmatterField(V2_STATE, 'current_phase', 5);
    expect(result).toContain('current_phase: 5');
    expect(result).not.toContain('current_phase: "5"');
  });

  it('quotes string values', () => {
    const result = updateFrontmatterField(V2_STATE, 'status', 'verified');
    expect(result).toContain('status: "verified"');
  });

  it('returns content unchanged if no frontmatter delimiters', () => {
    const plain = '# No frontmatter here\nJust text.';
    const result = updateFrontmatterField(plain, 'status', 'built');
    expect(result).toBe(plain);
  });

  it('preserves body content after frontmatter', () => {
    const result = updateFrontmatterField(V2_STATE, 'status', 'built');
    expect(result).toContain('# Project State');
    expect(result).toContain('Phase: 3 of 8');
  });
});

// ===== updateLegacyStateField =====

describe('updateLegacyStateField', () => {
  it('updates current_phase number', () => {
    const result = updateLegacyStateField(V1_STATE, 'current_phase', 4);
    expect(result).toContain('Phase: 4 of 6');
  });

  it('replaces existing Status line', () => {
    const result = updateLegacyStateField(V1_STATE, 'status', 'verified');
    expect(result).toContain('Status: verified');
    expect(result).not.toContain('Status: built');
  });

  it('inserts Status after Phase line when missing', () => {
    const noStatus = '# State\nPhase: 1 of 3\nPlan: 1 of 2';
    const result = updateLegacyStateField(noStatus, 'status', 'building');
    const lines = result.split('\n');
    const phaseIdx = lines.findIndex(l => l.includes('Phase:'));
    expect(lines[phaseIdx + 1]).toBe('Status: building');
  });

  it('appends Status when no Phase line exists', () => {
    const bare = '# State\nSome content';
    const result = updateLegacyStateField(bare, 'status', 'building');
    expect(result).toContain('Status: building');
  });

  it('updates plans_complete number', () => {
    const result = updateLegacyStateField(V1_STATE, 'plans_complete', 2);
    expect(result).toContain('Plan: 2 of 2');
  });

  it('replaces existing Last Activity line', () => {
    const withActivity = '# State\nLast Activity: old\nDone.';
    const result = updateLegacyStateField(withActivity, 'last_activity', 'new stuff');
    expect(result).toContain('Last Activity: new stuff');
    expect(result).not.toContain('Last Activity: old');
  });

  it('inserts Last Activity after Status when missing', () => {
    const noActivity = '# State\nStatus: built\nDone.';
    const result = updateLegacyStateField(noActivity, 'last_activity', 'today');
    const lines = result.split('\n');
    const statusIdx = lines.findIndex(l => l.includes('Status:'));
    expect(lines[statusIdx + 1]).toBe('Last Activity: today');
  });

  it('appends Last Activity when no Status line exists', () => {
    const bare = '# State';
    const result = updateLegacyStateField(bare, 'last_activity', 'now');
    expect(result).toContain('Last Activity: now');
  });

  it('handles CRLF input', () => {
    const crlf = V1_STATE.replace(/\n/g, '\r\n');
    const result = updateLegacyStateField(crlf, 'status', 'verified');
    expect(result).toContain('Status: verified');
  });
});

// ===== syncBodyLine =====

describe('syncBodyLine', () => {
  it('syncs status with title case and underscore removal', () => {
    const result = syncBodyLine(V2_STATE, 'status', 'needs_fixes');
    expect(result).toContain('Status: Needs Fixes');
  });

  it('syncs plans_complete', () => {
    const result = syncBodyLine(V2_STATE, 'plans_complete', 4);
    expect(result).toContain('Plan: 4 of 5');
  });

  it('syncs plans_total', () => {
    const result = syncBodyLine(V2_STATE, 'plans_total', 10);
    expect(result).toContain('Plan: 2 of 10');
  });

  it('syncs progress_percent with progress bar', () => {
    const result = syncBodyLine(V2_STATE, 'progress_percent', 75);
    expect(result).toMatch(/Progress:.*75%/);
    expect(result).toContain('███████████████');
  });

  it('returns content unchanged for NaN progress_percent', () => {
    const result = syncBodyLine(V2_STATE, 'progress_percent', 'abc');
    expect(result).toBe(V2_STATE);
  });

  it('syncs last_activity', () => {
    const result = syncBodyLine(V2_STATE, 'last_activity', '2026-03-19 new activity');
    expect(result).toContain('Last activity: 2026-03-19 new activity');
  });

  it('syncs current_phase number', () => {
    const result = syncBodyLine(V2_STATE, 'current_phase', 7);
    expect(result).toContain('Phase: 7 of 8');
  });

  it('syncs phase_slug with parenthesized name', () => {
    const result = syncBodyLine(V2_STATE, 'phase_slug', 'new-phase');
    expect(result).toContain('(New Phase)');
  });

  it('syncs phase_slug with dashed name format', () => {
    const dashed = V2_STATE.replace('(Auth System)', '-- Auth System');
    const result = syncBodyLine(dashed, 'phase_slug', 'new-phase');
    expect(result).toContain('-- New Phase');
  });

  it('returns content unchanged for unknown field', () => {
    const result = syncBodyLine(V2_STATE, 'unknown_field', 'value');
    expect(result).toBe(V2_STATE);
  });
});

// ===== buildProgressBar =====

describe('buildProgressBar', () => {
  it('builds 0% bar', () => {
    const bar = buildProgressBar(0);
    expect(bar).toBe('[░░░░░░░░░░░░░░░░░░░░] 0%');
  });

  it('builds 50% bar', () => {
    const bar = buildProgressBar(50);
    expect(bar).toBe('[██████████░░░░░░░░░░] 50%');
  });

  it('builds 100% bar', () => {
    const bar = buildProgressBar(100);
    expect(bar).toBe('[████████████████████] 100%');
  });

  it('handles 25% bar', () => {
    const bar = buildProgressBar(25);
    expect(bar).toContain('25%');
    expect(bar).toContain('█████');
  });
});

// ===== stateLoad =====

describe('stateLoad', () => {
  it('returns exists:false for missing .planning dir', () => {
    const nonexistent = path.join(os.tmpdir(), 'pbr-nonexistent-' + Date.now());
    const result = stateLoad(nonexistent);
    expect(result.exists).toBe(false);
    expect(result.config).toBeNull();
    expect(result.state).toBeNull();
  });

  it('loads populated state from temp directory', () => {
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

  it('returns _error for malformed config.json', () => {
    setupTmp();
    writeStateV2();
    writePlanningFile(planningDir, 'config.json', 'not json{{{');

    const result = stateLoad(planningDir);
    expect(result.exists).toBe(true);
    expect(result.config._error).toBe('Failed to parse config.json');
  });

  it('handles missing STATE.md gracefully', () => {
    setupTmp();
    const result = stateLoad(planningDir);
    expect(result.exists).toBe(true);
    expect(result.state).toBeNull();
  });

  it('handles missing ROADMAP.md gracefully', () => {
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
  it('updates a valid field in v2 format', () => {
    setupTmp();
    writeStateV2();
    const result = stateUpdate('status', 'built', planningDir);
    expect(result.success).toBe(true);
    expect(result.field).toBe('status');
    expect(result.value).toBe('built');
    // Verify written to disk
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('status: "built"');
  });

  it('rejects invalid field', () => {
    setupTmp();
    writeStateV2();
    const result = stateUpdate('invalid_field', 'val', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid field');
  });

  it('returns error for missing STATE.md', () => {
    setupTmp();
    const result = stateUpdate('status', 'built', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });

  it('auto-timestamps last_activity with value "now"', () => {
    setupTmp();
    writeStateV2();
    const result = stateUpdate('last_activity', 'now', planningDir);
    expect(result.success).toBe(true);
    // Value should be a timestamp, not literally "now"
    expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('updates legacy format fields', () => {
    setupTmp();
    writeStateV1();
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = stateUpdate('status', 'verified', planningDir);
    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Status: verified');
  });

  it('syncs body line after frontmatter update', () => {
    setupTmp();
    writeStateV2();
    stateUpdate('status', 'needs_fixes', planningDir);
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Status: Needs Fixes');
  });
});

// ===== statePatch =====

describe('statePatch', () => {
  it('updates multiple fields at once', () => {
    setupTmp();
    writeStateV2();
    const json = JSON.stringify({ status: 'built', plans_complete: '4' });
    const result = statePatch(json, planningDir);
    expect(result.success).toBe(true);
    expect(result.updated).toContain('status');
    expect(result.updated).toContain('plans_complete');
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('status: "built"');
  });

  it('returns error for invalid JSON', () => {
    setupTmp();
    writeStateV2();
    const result = statePatch('not-json', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid JSON');
  });

  it('reports unknown fields in errors array', () => {
    setupTmp();
    writeStateV2();
    const json = JSON.stringify({ status: 'built', bad_field: 'x' });
    const result = statePatch(json, planningDir);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Unknown field: bad_field');
    expect(result.updated).toContain('status');
  });

  it('returns error for missing STATE.md', () => {
    setupTmp();
    const result = statePatch('{"status":"built"}', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });
});

// ===== stateAdvancePlan =====

describe('stateAdvancePlan', () => {
  it('increments plan counter and updates progress', () => {
    setupTmp();
    writeStateV2();
    const result = stateAdvancePlan(planningDir);
    expect(result.success).toBe(true);
    expect(result.previous_plan).toBe(2);
    expect(result.current_plan).toBe(3);
    expect(result.total_plans).toBe(5);
    expect(result.progress_percent).toBe(60);

    // Verify disk
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('plans_complete: 3');
  });

  it('does not exceed total plans', () => {
    setupTmp();
    // Create a state where plans are already at max
    const atMax = V2_STATE.replace('Plan: 2 of 5', 'Plan: 5 of 5');
    writePlanningFile(planningDir, 'STATE.md', atMax);
    const result = stateAdvancePlan(planningDir);
    expect(result.success).toBe(true);
    expect(result.current_plan).toBe(5);
    expect(result.progress_percent).toBe(100);
  });

  it('returns error when STATE.md is missing', () => {
    setupTmp();
    const result = stateAdvancePlan(planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });

  it('returns error when Plan: N of M not found', () => {
    setupTmp();
    writePlanningFile(planningDir, 'STATE.md', '---\nversion: 2\n---\n# No plan line');
    const result = stateAdvancePlan(planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not find Plan:');
  });
});

// ===== stateRecordActivity =====

describe('stateRecordActivity', () => {
  it('writes date-prefixed description to last_activity', () => {
    setupTmp();
    writeStateV2();
    const result = stateRecordActivity('Built phase 3', planningDir);
    expect(result.success).toBe(true);
    expect(result.last_activity).toMatch(/^\d{4}-\d{2}-\d{2} Built phase 3$/);

    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('Built phase 3');
  });

  it('returns error when STATE.md is missing', () => {
    setupTmp();
    const result = stateRecordActivity('test', planningDir);
    expect(result.success).toBe(false);
  });
});

// ===== stateRecordMetric =====

describe('stateRecordMetric', () => {
  it('parses --duration and --plans-completed args', () => {
    setupTmp();
    writeStateV2();
    // stateRecordMetric calls historyAppend which needs a history dir
    fs.mkdirSync(path.join(planningDir, 'history'), { recursive: true });
    const result = stateRecordMetric(
      ['--duration', '30m', '--plans-completed', '3'],
      planningDir
    );
    expect(result.success).toBe(true);
    expect(result.duration_minutes).toBe(30);
    expect(result.plans_completed).toBe(3);
  });

  it('handles hour duration', () => {
    setupTmp();
    writeStateV2();
    fs.mkdirSync(path.join(planningDir, 'history'), { recursive: true });
    const result = stateRecordMetric(['--duration', '2h'], planningDir);
    expect(result.success).toBe(true);
    expect(result.duration_minutes).toBe(120);
  });
});

// ===== stateCheckProgress =====

describe('stateCheckProgress', () => {
  it('returns zeros for missing phases dir', () => {
    setupTmp();
    const result = stateCheckProgress(planningDir);
    expect(result.total_plans).toBe(0);
    expect(result.completed_plans).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.phases).toEqual([]);
  });

  it('counts plans and completed summaries', () => {
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
  it('recalculates and writes progress to STATE.md', () => {
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

    const result = stateUpdateProgress(planningDir);
    expect(result.success).toBe(true);
    expect(result.total_plans).toBe(2);
    expect(result.completed_plans).toBe(1);
    expect(result.percent).toBe(50);

    // Verify disk
    const content = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(content).toContain('progress_percent: 50');
  });

  it('returns error for missing STATE.md', () => {
    setupTmp();
    const result = stateUpdateProgress(planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toBe('STATE.md not found');
  });
});
