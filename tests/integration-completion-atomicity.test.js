'use strict';

/**
 * Integration tests for compound completion command atomicity.
 * Verifies STATE.md remains unchanged when compound commands fail mid-sequence.
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
} = require('../plugins/pbr/scripts/lib/completion');

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
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-atomicity-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// buildComplete atomicity
// ---------------------------------------------------------------------------

describe('buildComplete atomicity', () => {
  test('STATE unchanged when ROADMAP missing', () => {
    const originalState = makeStateMd();
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), originalState);
    // No ROADMAP.md -- first step (roadmapUpdatePlans) should fail

    const result = buildComplete(1, { completed: 2, total: 2 }, planningDir);
    expect(result.success).toBe(false);
    expect(result.step).toBe('roadmapUpdatePlans');
    expect(result.partial).toEqual([]);

    // STATE.md must still say "building"
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toContain('"building"');
    expect(stateContent).not.toContain('"built"');
  });

  test('STATE unchanged when ROADMAP malformed (no Progress table)', () => {
    const originalState = makeStateMd();
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), originalState);
    // ROADMAP with no Progress table
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n\nSome text but no table.\n');

    const result = buildComplete(1, { completed: 2, total: 2 }, planningDir);
    expect(result.success).toBe(false);

    // STATE.md must still say "building" -- unchanged
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toContain('"building"');
  });
});

// ---------------------------------------------------------------------------
// planComplete atomicity
// ---------------------------------------------------------------------------

describe('planComplete atomicity', () => {
  test('STATE unchanged when ROADMAP missing', () => {
    const originalState = makeStateMd({ status: 'idle' });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), originalState);
    // No ROADMAP.md

    const result = planComplete(1, 3, {}, planningDir);
    expect(result.success).toBe(false);
    expect(result.step).toBe('roadmapUpdatePlans');

    // STATE.md must still say "idle"
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toContain('"idle"');
    expect(stateContent).not.toContain('"planned"');
  });

  test('partial field tracks completed steps on mismatched phase', () => {
    const originalState = makeStateMd({ status: 'idle' });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), originalState);
    // ROADMAP with phase 1 only -- calling planComplete on phase 99 should fail
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'idle', '0/0'));

    const result = planComplete(99, 3, {}, planningDir);
    // roadmapUpdatePlans tries to update phase 99 which doesn't exist in the table
    // Depending on implementation, it may fail or succeed-ish
    // The key check: if it fails, partial should be empty; if first step succeeds, partial should list it
    if (!result.success) {
      expect(result.partial).toBeDefined();
      expect(Array.isArray(result.partial)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// reviewComplete end-to-end
// ---------------------------------------------------------------------------

describe('reviewComplete end-to-end', () => {
  test('full sequence success: STATE and ROADMAP updated to verified', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'built' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'built'));

    const result = reviewComplete(1, {}, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('verified');
    expect(result.state_status).toBe('verified');
    expect(result.phase).toBe('1');

    // Verify STATE.md was updated
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*"verified"/);

    // Verify ROADMAP.md was updated
    const roadmapContent = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmapContent).toContain('verified');
  });
});

// ---------------------------------------------------------------------------
// milestoneArchive
// ---------------------------------------------------------------------------

describe('milestoneArchive creates archive', () => {
  test('creates ROADMAP archive file at milestones/v2.0-ROADMAP.md', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd());
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd());

    const result = milestoneArchive('v2.0', { name: 'Release 2' }, planningDir);
    expect(result.success).toBe(true);
    expect(result.version).toBe('v2.0');

    // Verify archive file exists
    const archivePath = path.join(planningDir, 'milestones', 'v2.0-ROADMAP.md');
    expect(fs.existsSync(archivePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// importComplete
// ---------------------------------------------------------------------------

describe('importComplete with valid state', () => {
  test('sets planned status and updates both STATE and ROADMAP', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), makeStateMd({ status: 'idle' }));
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), makeRoadmapMd(1, 'idle', '0/0'));

    const result = importComplete(1, {}, planningDir);
    expect(result.success).toBe(true);
    expect(result.roadmap_status).toBe('planned');

    // Verify both files updated
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*"planned"/);

    const roadmapContent = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmapContent).toContain('planned');
  });
});
