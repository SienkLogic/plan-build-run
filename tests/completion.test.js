'use strict';

/**
 * Tests for plan-build-run/bin/lib/completion.cjs — Compound completion commands.
 *
 * Covers all 5 exported functions: buildComplete, planComplete,
 * reviewComplete, milestoneArchive, importComplete.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  buildComplete,
  planComplete,
  reviewComplete,
  milestoneArchive,
  importComplete
} = require('../plan-build-run/bin/lib/completion.cjs');

// Minimal STATE.md v2 frontmatter fixture
function makeStateMd(overrides = {}) {
  const fields = {
    version: 2,
    current_phase: 1,
    status: 'building',
    plans_complete: 0,
    plans_total: 2,
    progress_percent: 0,
    last_activity: '2026-01-01 init',
    last_command: '/pbr:build',
    blockers: '[]',
    ...overrides
  };
  return [
    '---',
    `version: ${fields.version}`,
    `current_phase: ${fields.current_phase}`,
    `status: "${fields.status}"`,
    `plans_complete: ${fields.plans_complete}`,
    `plans_total: ${fields.plans_total}`,
    `progress_percent: ${fields.progress_percent}`,
    `last_activity: "${fields.last_activity}"`,
    `last_command: "${fields.last_command}"`,
    `blockers: ${fields.blockers}`,
    '---',
    '## Current Position',
    `**Phase:** ${fields.current_phase}`,
    `**Status:** ${fields.status.charAt(0).toUpperCase() + fields.status.slice(1)}`,
  ].join('\n');
}

// Minimal ROADMAP.md with Progress table
function makeRoadmapMd(phaseNum = 1, status = 'building', plans = '0/2') {
  return [
    '# Roadmap',
    '',
    '## Progress',
    '',
    '| Phase | Milestone | Plans Complete | Status | Completed |',
    '|-------|-----------|---------------|--------|-----------|',
    `| ${phaseNum}. Test Phase | v1.0 | ${plans} | ${status} | |`,
  ].join('\n');
}

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-completion-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// buildComplete
// ---------------------------------------------------------------------------

describe('buildComplete', () => {
  test('happy path: 2/2 plans complete sets status to built', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd());
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd());

    const result = buildComplete(1, { completed: 2, total: 2 }, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('built');
    expect(result.plans).toBe('2/2');

    // Verify STATE.md was updated
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*"built"/);

    // Verify ROADMAP.md was updated
    const roadmapContent = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmapContent).toContain('2/2');
  });

  test('partial: 1/2 plans sets status to partial', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd());
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd());

    const result = buildComplete(1, { completed: 1, total: 2 }, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('partial');
    expect(result.plans).toBe('1/2');
  });

  test('missing STATE.md returns success false', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd());
    // No STATE.md

    const result = buildComplete(1, { completed: 2, total: 2 }, planningDir);
    // roadmapUpdatePlans succeeds but statePatch will fail
    // The exact step depends on order — but success should be false
    expect(result.success).toBe(false);
    expect(result.step).toBeTruthy();
    expect(result.partial).toBeDefined();
  });

  test('missing phase number returns error', () => {
    const result = buildComplete(null, { completed: 1, total: 1 }, planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('phase number required');
  });
});

// ---------------------------------------------------------------------------
// planComplete
// ---------------------------------------------------------------------------

describe('planComplete', () => {
  test('happy path: sets status to planned and plans_total', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'idle' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'idle', '0/0'));

    const result = planComplete(1, 3, {}, planningDir);
    expect(result.success).toBe(true);
    expect(result.plans_total).toBe(3);
    expect(result.roadmap_status).toBe('planned');

    // Verify STATE.md has planned status
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*"planned"/);
  });

  test('missing ROADMAP returns error', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd());
    // No ROADMAP.md

    const result = planComplete(1, 3, {}, planningDir);
    expect(result.success).toBe(false);
    expect(result.step).toBe('roadmapUpdatePlans');
  });
});

// ---------------------------------------------------------------------------
// reviewComplete
// ---------------------------------------------------------------------------

describe('reviewComplete', () => {
  test('sets status to verified', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'built' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'built'));

    const result = reviewComplete(1, {}, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('verified');

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*"verified"/);
  });

  test('complete-with-gaps status variant', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'built' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'built'));

    const result = reviewComplete(1, { status: 'complete-with-gaps' }, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('complete-with-gaps');
  });
});

// ---------------------------------------------------------------------------
// milestoneArchive
// ---------------------------------------------------------------------------

describe('milestoneArchive', () => {
  test('creates archive directory with ROADMAP copy', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd());
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd());

    const result = milestoneArchive('v1.0', { name: 'Test Release' }, planningDir);
    expect(result.success).toBe(true);
    expect(result.version).toBe('v1.0');

    // Verify archive was created
    const archivePath = path.join(planningDir, 'milestones', 'v1.0-ROADMAP.md');
    expect(fs.existsSync(archivePath)).toBe(true);
  });

  test('missing version returns error', () => {
    const result = milestoneArchive(null, {}, planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('version required');
  });
});

// ---------------------------------------------------------------------------
// importComplete
// ---------------------------------------------------------------------------

describe('importComplete', () => {
  test('sets status to planned', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'idle' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'idle', '0/0'));

    const result = importComplete(1, {}, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('planned');

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*"planned"/);
  });

  test('custom status "imported"', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'idle' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'idle', '0/0'));

    const result = importComplete(1, { status: 'imported' }, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('imported');
  });
});
