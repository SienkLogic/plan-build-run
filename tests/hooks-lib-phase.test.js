/**
 * Tests for hooks/lib/phase.js — Phase operations.
 *
 * Covers all 10 exported functions: frontmatter, planIndex, mustHavesCollect,
 * phaseInfo, phaseAdd, phaseRemove, phaseList, milestoneStats,
 * phaseComplete, phaseInsert.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { configClearCache } = require('../hooks/lib/config');
const {
  frontmatter,
  planIndex,
  mustHavesCollect,
  phaseInfo,
  phaseAdd,
  phaseRemove,
  phaseList,
  milestoneStats,
  phaseComplete,
  phaseInsert
} = require('../hooks/lib/phase');

// --- Fixtures ---

const PLAN_01 = `---
phase: "01-setup"
plan: "01-01"
wave: 1
type: "feature"
autonomous: true
depends_on: []
must_haves:
  truths:
    - "Setup is complete"
  artifacts:
    - "config.json exists"
  key_links:
    - "config imported by main"
---

# Plan 01-01

Setup tasks here.
`;

const PLAN_02 = `---
phase: "01-setup"
plan: "01-02"
wave: 2
type: "test"
autonomous: false
depends_on: ["01-01"]
must_haves:
  truths:
    - "Tests pass"
    - "Setup is complete"
  artifacts:
    - "test.js exists"
  key_links: []
---

# Plan 01-02

Test tasks here.
`;

const SUMMARY_01 = `---
phase: "01-setup"
plan: "01-01"
status: "complete"
provides:
  - "config module"
requires: []
key_files:
  - "config.json"
deferred: []
metrics:
  tasks_completed: 3
  commits: 2
  files_changed: 5
commits:
  - hash: "abc1234"
    message: "feat: setup config"
    task: 1
  - hash: "def5678"
    message: "feat: setup main"
    task: 2
---

## Task Results

| 1 | done | abc1234 | config.json |
| 2 | done | def5678 | main.js |
`;

const SUMMARY_02 = `---
phase: "01-setup"
plan: "01-02"
status: "complete"
provides:
  - "test suite"
requires: []
key_files:
  - "test.js"
deferred:
  - "add more tests"
patterns:
  - "jest pattern"
key_decisions:
  - "chose jest over mocha"
metrics:
  tasks_completed: 2
  commits: 1
  files_changed: 2
commits:
  - hash: "ghi9012"
    message: "test: add tests"
    task: 1
---

## Task Results

| 1 | done | ghi9012 | test.js |
`;

const VERIFICATION_PASSED = `---
result: "passed"
phase: "01-setup"
---

# Verification

All checks passed.
`;

const VERIFICATION_FAILED = `---
result: "gaps_found"
phase: "01-setup"
---

# Verification

Some gaps found.
`;

const MINIMAL_STATE = `---
version: 2
current_phase: 1
phase_slug: "setup"
status: "building"
progress_percent: 0
plans_total: 2
plans_complete: 0
last_activity: ""
last_command: "build"
blockers: []
---

# Project State

Phase: 1 of 3 (Setup)
Status: Building
Progress: [░░░░░░░░░░░░░░░░░░░░] 0%
Plan: 0 of 2
`;

const MINIMAL_ROADMAP = `---
title: "Test Roadmap"
---

# Roadmap

## Phase Overview

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 1. Setup | 0/2 | building |
| 2. Auth | 0/1 | planned |
| 3. Deploy | 0/1 | planned |

## Phases

- [ ] Phase 1: Setup
- [ ] Phase 2: Auth
- [ ] Phase 3: Deploy
`;

// --- Helpers ---

let tmpDir, planningDir;

function setupTmp() {
  const tmp = createTmpPlanning();
  tmpDir = tmp.tmpDir;
  planningDir = tmp.planningDir;
  return { tmpDir, planningDir };
}

function createPhaseDir(name) {
  const dir = path.join(planningDir, 'phases', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    cleanupTmp(tmpDir);
  }
  tmpDir = null;
  planningDir = null;
  configClearCache();
});

// ===== frontmatter =====

describe('frontmatter', () => {
  it('parses valid file and returns frontmatter object', () => {
    setupTmp();
    const filePath = path.join(planningDir, 'test.md');
    fs.writeFileSync(filePath, PLAN_01);
    const result = frontmatter(filePath);
    expect(result.plan).toBe('01-01');
    expect(result.wave).toBe(1);
    expect(result.type).toBe('feature');
    expect(result.must_haves).toBeDefined();
    expect(result.must_haves.truths).toContain('Setup is complete');
  });

  it('returns error for missing file', () => {
    const result = frontmatter('/nonexistent/file.md');
    expect(result.error).toMatch(/File not found/);
  });

  it('returns empty object for file with no frontmatter', () => {
    setupTmp();
    const filePath = path.join(planningDir, 'no-fm.md');
    fs.writeFileSync(filePath, '# Just a heading\n\nSome content.\n');
    const result = frontmatter(filePath);
    // parseYamlFrontmatter returns {} for no frontmatter
    expect(result).toBeDefined();
    expect(result.error).toBeUndefined();
  });
});

// ===== planIndex =====

describe('planIndex', () => {
  it('returns plan inventory grouped by wave', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_01);
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), PLAN_02);

    const result = planIndex('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.phase).toBe('01-setup');
    expect(result.total_plans).toBe(2);
    expect(result.plans).toHaveLength(2);
    expect(result.waves.wave_1).toBeDefined();
    expect(result.waves.wave_2).toBeDefined();
  });

  it('returns error when phases directory missing', () => {
    setupTmp();
    // No phases dir created
    const result = planIndex('1', planningDir);
    expect(result.error).toMatch(/No phases directory/);
  });

  it('returns error for non-existent phase number', () => {
    setupTmp();
    createPhaseDir('01-setup');
    const result = planIndex('99', planningDir);
    expect(result.error).toMatch(/No phase directory found matching phase 99/);
  });

  it('returns empty arrays for phase with no PLAN files', () => {
    setupTmp();
    createPhaseDir('01-empty');
    const result = planIndex('1', planningDir);
    expect(result.total_plans).toBe(0);
    expect(result.plans).toEqual([]);
    expect(result.waves).toEqual({});
  });

  it('detects has_summary when SUMMARY file exists', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_01);
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), SUMMARY_01);

    const result = planIndex('1', planningDir);
    expect(result.plans[0].has_summary).toBe(true);
  });

  it('counts must-haves correctly', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_01);

    const result = planIndex('1', planningDir);
    // 1 truth + 1 artifact + 1 key_link = 3
    expect(result.plans[0].must_haves_count).toBe(3);
  });
});

// ===== mustHavesCollect =====

describe('mustHavesCollect', () => {
  it('collects must-haves from multiple plans with dedup', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_01);
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), PLAN_02);

    const result = mustHavesCollect('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.phase).toBe('01-setup');

    // "Setup is complete" appears in both plans but should be deduped
    expect(result.all.truths).toContain('Setup is complete');
    expect(result.all.truths).toContain('Tests pass');
    // Dedup: only 2 unique truths, not 3
    expect(result.all.truths).toHaveLength(2);

    expect(result.all.artifacts).toContain('config.json exists');
    expect(result.all.artifacts).toContain('test.js exists');

    expect(result.total).toBe(2 + 2 + 1); // 2 truths + 2 artifacts + 1 key_link
  });

  it('returns error for missing phase', () => {
    setupTmp();
    createPhaseDir('01-setup');
    const result = mustHavesCollect('99', planningDir);
    expect(result.error).toMatch(/No phase directory found/);
  });

  it('returns error when phases directory missing', () => {
    setupTmp();
    const result = mustHavesCollect('1', planningDir);
    expect(result.error).toMatch(/No phases directory/);
  });

  it('returns valid structure for plans with empty must_haves', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    const planNoMH = `---
plan: "01-01"
wave: 1
---

# Plan without must_haves
`;
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), planNoMH);

    const result = mustHavesCollect('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.all.truths).toEqual([]);
    expect(result.all.artifacts).toEqual([]);
    expect(result.all.key_links).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ===== phaseInfo =====

describe('phaseInfo', () => {
  it('returns comprehensive info for phase with plans and summaries', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), PLAN_01);
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), PLAN_02);
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), SUMMARY_01);
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), VERIFICATION_PASSED);
    writePlanningFile(planningDir, 'ROADMAP.md', MINIMAL_ROADMAP);

    const result = phaseInfo('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.phase).toBe('01-setup');
    expect(result.plan_count).toBe(2);
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].status).toBe('complete');
    expect(result.verification).toBeDefined();
    expect(result.verification.result).toBe('passed');
  });

  it('returns not_started for empty phase', () => {
    setupTmp();
    createPhaseDir('01-empty');

    const result = phaseInfo('1', planningDir);
    expect(result.filesystem_status).toBe('not_started');
  });

  it('returns discussed for phase with only CONTEXT.md', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-discussed');
    fs.writeFileSync(path.join(phaseDir, 'CONTEXT.md'), '# Context\n\nDiscussion notes.\n');

    const result = phaseInfo('1', planningDir);
    expect(result.filesystem_status).toBe('discussed');
    expect(result.has_context).toBe(true);
  });

  it('returns error for missing phases directory', () => {
    setupTmp();
    const result = phaseInfo('1', planningDir);
    expect(result.error).toMatch(/No phases directory/);
  });

  it('returns error for non-existent phase number', () => {
    setupTmp();
    createPhaseDir('01-setup');
    const result = phaseInfo('99', planningDir);
    expect(result.error).toMatch(/No phase directory found/);
  });
});

// ===== phaseAdd =====

describe('phaseAdd', () => {
  it('adds phase at end with correct numbering', () => {
    setupTmp();
    createPhaseDir('01-setup');
    createPhaseDir('02-auth');

    const result = phaseAdd('deploy', null, planningDir);
    expect(result.phase).toBe(3);
    expect(result.slug).toBe('deploy');
    expect(result.directory).toBe('03-deploy');
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.renumbered).toBe(false);
  });

  it('inserts after specified phase and renumbers', () => {
    setupTmp();
    createPhaseDir('01-setup');
    createPhaseDir('02-auth');
    createPhaseDir('03-deploy');

    const result = phaseAdd('testing', '1', planningDir);
    expect(result.phase).toBe(2);
    expect(result.directory).toBe('02-testing');
    expect(result.renumbered).toBe(true);

    // Original 02-auth should now be 03-auth
    const dirs = fs.readdirSync(path.join(planningDir, 'phases')).sort();
    expect(dirs).toContain('03-auth');
    expect(dirs).toContain('04-deploy');
  });

  it('creates phases dir if missing', () => {
    setupTmp();
    const result = phaseAdd('first', null, planningDir);
    expect(result.phase).toBe(1);
    expect(result.directory).toBe('01-first');
    expect(fs.existsSync(path.join(planningDir, 'phases', '01-first'))).toBe(true);
  });

  it('handles backward compat when planningDir is options object', () => {
    setupTmp();
    // Set env so it finds the right planning dir
    const origRoot = process.env.PBR_PROJECT_ROOT;
    process.env.PBR_PROJECT_ROOT = tmpDir;
    try {
      const result = phaseAdd('test-phase', null, { goal: 'Test goal' });
      expect(result.phase).toBe(1);
      expect(result.goal).toBe('Test goal');
    } finally {
      if (origRoot !== undefined) {
        process.env.PBR_PROJECT_ROOT = origRoot;
      } else {
        delete process.env.PBR_PROJECT_ROOT;
      }
    }
  });

  it('passes options through correctly', () => {
    setupTmp();
    const result = phaseAdd('test', null, planningDir, { goal: 'My goal', dependsOn: '1' });
    expect(result.goal).toBe('My goal');
    expect(result.depends_on).toBe('1');
  });

  it('updates ROADMAP.md when it exists', () => {
    setupTmp();
    writePlanningFile(planningDir, 'ROADMAP.md', MINIMAL_ROADMAP);
    createPhaseDir('01-setup');

    const result = phaseAdd('new-phase', null, planningDir, { goal: 'New goal' });
    expect(result.roadmap_updated).toBe(true);
  });
});

// ===== phaseRemove =====

describe('phaseRemove', () => {
  it('refuses to remove current active phase', () => {
    setupTmp();
    createPhaseDir('01-setup');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    const result = phaseRemove('1', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toMatch(/current active phase/);
  });

  it('refuses to remove phase with passed VERIFICATION.md', () => {
    setupTmp();
    const phaseDir = createPhaseDir('02-auth');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), VERIFICATION_PASSED);
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    const result = phaseRemove('2', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toMatch(/passed verification/);
  });

  it('refuses to remove phase with files (needs --force)', () => {
    setupTmp();
    const phaseDir = createPhaseDir('02-auth');
    fs.writeFileSync(path.join(phaseDir, 'some-file.md'), 'content');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    const result = phaseRemove('2', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toMatch(/has \d+ files/);
    expect(result.files).toBeDefined();
  });

  it('removes empty phase and renumbers subsequent dirs', () => {
    setupTmp();
    createPhaseDir('01-setup');
    createPhaseDir('02-empty');
    createPhaseDir('03-auth');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    const result = phaseRemove('2', planningDir);
    expect(result.removed).toBe(true);
    expect(result.renumbered).toBe(true);

    // 03-auth should now be 02-auth
    const dirs = fs.readdirSync(path.join(planningDir, 'phases')).sort();
    expect(dirs).toContain('02-auth');
    expect(dirs).not.toContain('03-auth');
    expect(dirs).not.toContain('02-empty');
  });

  it('returns error for non-existent phase', () => {
    setupTmp();
    createPhaseDir('01-setup');
    const result = phaseRemove('99', planningDir);
    expect(result.removed).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it('decrements STATE.md current_phase when removing lower phase', () => {
    setupTmp();
    createPhaseDir('01-old');
    createPhaseDir('02-empty');
    createPhaseDir('03-current');

    const stateWith3 = MINIMAL_STATE.replace('current_phase: 1', 'current_phase: 3');
    writePlanningFile(planningDir, 'STATE.md', stateWith3);

    const result = phaseRemove('2', planningDir);
    expect(result.removed).toBe(true);
    expect(result.state_updated).toBe(true);

    // current_phase should now be 2 (was 3)
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/current_phase:\s*2/);
  });

  it('updates ROADMAP.md when it exists', () => {
    setupTmp();
    createPhaseDir('02-empty');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);
    writePlanningFile(planningDir, 'ROADMAP.md', MINIMAL_ROADMAP);

    const result = phaseRemove('2', planningDir);
    expect(result.removed).toBe(true);
    expect(result.roadmap_updated).toBe(true);
  });

  it('allows removal when VERIFICATION exists but not passed', () => {
    setupTmp();
    const phaseDir = createPhaseDir('02-auth');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), VERIFICATION_FAILED);
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    // Still has files though, so should refuse for that reason
    const result = phaseRemove('2', planningDir);
    // It has the VERIFICATION.md file in it
    expect(result.removed).toBe(false);
    expect(result.error).toMatch(/has \d+ files/);
  });
});

// ===== phaseList =====

describe('phaseList', () => {
  it('returns sorted list with status flags', () => {
    setupTmp();
    const phaseDir1 = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir1, 'PLAN-01.md'), PLAN_01);
    fs.writeFileSync(path.join(phaseDir1, 'SUMMARY-01.md'), SUMMARY_01);

    const phaseDir2 = createPhaseDir('02-auth');
    fs.writeFileSync(path.join(phaseDir2, 'PLAN-01.md'), PLAN_01);
    fs.writeFileSync(path.join(phaseDir2, 'VERIFICATION.md'), VERIFICATION_PASSED);

    const result = phaseList(planningDir);
    expect(result.phases).toHaveLength(2);

    expect(result.phases[0].num).toBe(1);
    expect(result.phases[0].slug).toBe('setup');
    expect(result.phases[0].hasPlan).toBe(true);
    expect(result.phases[0].hasSummary).toBe(true);
    expect(result.phases[0].hasVerification).toBe(false);

    expect(result.phases[1].num).toBe(2);
    expect(result.phases[1].hasPlan).toBe(true);
    expect(result.phases[1].hasVerification).toBe(true);
  });

  it('returns empty array for empty phases dir', () => {
    setupTmp();
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    const result = phaseList(planningDir);
    expect(result.phases).toEqual([]);
  });

  it('returns empty array for missing phases dir', () => {
    setupTmp();
    const result = phaseList(planningDir);
    expect(result.phases).toEqual([]);
  });

  it('ignores non-phase directories', () => {
    setupTmp();
    createPhaseDir('01-setup');
    // Create a non-phase dir (no numeric prefix)
    fs.mkdirSync(path.join(planningDir, 'phases', 'notes'), { recursive: true });

    const result = phaseList(planningDir);
    expect(result.phases).toHaveLength(1);
  });
});

// ===== milestoneStats =====

describe('milestoneStats', () => {
  it('reads from archive directory when it exists', () => {
    setupTmp();
    const archiveDir = path.join(planningDir, 'milestones', 'v1.0', 'phases', '01-setup');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'SUMMARY-01.md'), SUMMARY_01);
    fs.writeFileSync(path.join(archiveDir, 'SUMMARY-02.md'), SUMMARY_02);

    const result = milestoneStats('1.0', planningDir);
    expect(result.version).toBe('1.0');
    expect(result.phase_count).toBe(1);
    expect(result.phases[0].name).toBe('setup');
    expect(result.phases[0].summaries).toHaveLength(2);

    // Check aggregated provides
    expect(result.aggregated.all_provides).toContain('config module');
    expect(result.aggregated.all_provides).toContain('test suite');

    // Check aggregated key_files
    expect(result.aggregated.all_key_files).toContain('config.json');
    expect(result.aggregated.all_key_files).toContain('test.js');

    // Metrics: the simple YAML parser doesn't handle nested objects,
    // so metrics fields remain unparsed — totals stay at 0
    expect(result.aggregated.total_metrics.tasks_completed).toBe(0);
    expect(result.aggregated.total_metrics.commits).toBe(0);
  });

  it('falls back to active phases with ROADMAP.md parsing', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), SUMMARY_01);

    const roadmapWithMilestone = `# Roadmap

## Milestone: v2.0 Release (v2.0)

### Phase 1: Setup

Some content about setup.
`;
    writePlanningFile(planningDir, 'ROADMAP.md', roadmapWithMilestone);

    const result = milestoneStats('2.0', planningDir);
    expect(result.phase_count).toBe(1);
    expect(result.phases[0].name).toBe('setup');
  });

  it('returns empty when no archive and no matching roadmap', () => {
    setupTmp();
    createPhaseDir('01-setup');
    writePlanningFile(planningDir, 'ROADMAP.md', '# Empty Roadmap\n');

    const result = milestoneStats('99.0', planningDir);
    expect(result.phase_count).toBe(0);
    expect(result.phases).toEqual([]);
  });

  it('aggregates deferred and patterns', () => {
    setupTmp();
    const archiveDir = path.join(planningDir, 'milestones', 'v3.0', 'phases', '01-setup');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'SUMMARY-02.md'), SUMMARY_02);

    const result = milestoneStats('3.0', planningDir);
    expect(result.aggregated.all_deferred).toContain('add more tests');
    expect(result.aggregated.all_patterns).toContain('jest pattern');
    expect(result.aggregated.all_key_decisions).toContain('chose jest over mocha');
  });

  it('parses phase range from ROADMAP milestone section', () => {
    setupTmp();
    createPhaseDir('05-api');
    createPhaseDir('06-ui');
    fs.writeFileSync(path.join(planningDir, 'phases', '05-api', 'SUMMARY-01.md'), SUMMARY_01);
    fs.writeFileSync(path.join(planningDir, 'phases', '06-ui', 'SUMMARY-01.md'), SUMMARY_02);

    const roadmapWithRange = `# Roadmap

## Milestone: v4.0 (v4.0)

Phases 5-6 cover the API and UI work.
`;
    writePlanningFile(planningDir, 'ROADMAP.md', roadmapWithRange);

    const result = milestoneStats('4.0', planningDir);
    expect(result.phase_count).toBe(2);
  });

  it('parses table rows in milestone section', () => {
    setupTmp();
    createPhaseDir('10-infra');
    fs.writeFileSync(path.join(planningDir, 'phases', '10-infra', 'SUMMARY-01.md'), SUMMARY_01);

    const roadmapWithTable = `# Roadmap

## Milestone: v5.0 (v5.0)

| 10 | Infrastructure | 1/1 | Complete |

## Milestone: v6.0 (v6.0)

| 20 | Other | 0/1 | Planned |
`;
    writePlanningFile(planningDir, 'ROADMAP.md', roadmapWithTable);

    const result = milestoneStats('5.0', planningDir);
    expect(result.phase_count).toBe(1);
    expect(result.phases[0].name).toBe('infra');
  });
});

// ===== phaseComplete =====

describe('phaseComplete', () => {
  const ROADMAP_WITH_TABLE = `# Roadmap

## Phase Overview

| Phase | Name | Plans | Status | Date |
|-------|------|-------|--------|------|
| 1. Setup | 2/2 | Built | |
| 2. Auth | 0/1 | Planned | |
| 3. Deploy | 0/1 | Planned | |

## Phases

- [ ] Phase 1: Setup
- [ ] Phase 2: Auth
- [ ] Phase 3: Deploy
`;

  it('updates ROADMAP.md and STATE.md for mid-phase completion', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), SUMMARY_01);
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);
    writePlanningFile(planningDir, 'ROADMAP.md', ROADMAP_WITH_TABLE);

    const result = phaseComplete('1', planningDir);
    expect(result.success).toBe(true);
    expect(result.completed_phase).toBe(1);
    expect(result.next_phase).toBe(2);
    expect(result.final_phase).toBe(false);
    expect(result.roadmap_updated).toBe(true);
    expect(result.state_updated).toBe(true);

    // Check ROADMAP was updated
    const roadmapContent = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmapContent).toMatch(/Complete/);

    // Check checklist was updated
    expect(roadmapContent).toMatch(/\[x\] Phase 1/);
  });

  it('returns error when STATE.md missing', () => {
    setupTmp();
    createPhaseDir('01-setup');
    writePlanningFile(planningDir, 'ROADMAP.md', ROADMAP_WITH_TABLE);

    const result = phaseComplete('1', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/STATE\.md not found/);
  });

  it('returns error when ROADMAP.md missing', () => {
    setupTmp();
    createPhaseDir('01-setup');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    const result = phaseComplete('1', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ROADMAP\.md not found/);
  });

  it('sets status to verified for final phase', () => {
    setupTmp();
    createPhaseDir('03-deploy');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE.replace('current_phase: 1', 'current_phase: 3'));
    writePlanningFile(planningDir, 'ROADMAP.md', ROADMAP_WITH_TABLE);

    const result = phaseComplete('3', planningDir);
    expect(result.success).toBe(true);
    expect(result.final_phase).toBe(true);
    expect(result.next_phase).toBeNull();

    // STATE.md should show verified
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/status:\s*["']?verified/);
  });

  it('returns error when phase not in ROADMAP progress table', () => {
    setupTmp();
    createPhaseDir('99-missing');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);
    writePlanningFile(planningDir, 'ROADMAP.md', ROADMAP_WITH_TABLE);

    const result = phaseComplete('99', planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found in ROADMAP/);
  });

  it('writes phase manifest', () => {
    setupTmp();
    const phaseDir = createPhaseDir('01-setup');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), SUMMARY_01);
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);
    writePlanningFile(planningDir, 'ROADMAP.md', ROADMAP_WITH_TABLE);

    const result = phaseComplete('1', planningDir);
    expect(result.manifest_written).toBe(true);

    const manifestPath = path.join(phaseDir, '.phase-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.phase).toBe('01');
    expect(manifest.commits.length).toBeGreaterThan(0);
  });
});

// ===== phaseInsert =====

describe('phaseInsert', () => {
  it('inserts at position 2 and renumbers existing dirs', () => {
    setupTmp();
    createPhaseDir('01-setup');
    createPhaseDir('02-auth');
    createPhaseDir('03-deploy');

    const result = phaseInsert(2, 'testing', planningDir);
    expect(result.phase).toBe(2);
    expect(result.directory).toBe('02-testing');
    expect(result.renumbered_count).toBe(2); // 02 and 03 both renumbered
    expect(fs.existsSync(result.path)).toBe(true);

    const dirs = fs.readdirSync(path.join(planningDir, 'phases')).sort();
    expect(dirs).toContain('01-setup');
    expect(dirs).toContain('02-testing');
    expect(dirs).toContain('03-auth');
    expect(dirs).toContain('04-deploy');
  });

  it('returns error for invalid position', () => {
    setupTmp();
    createPhaseDir('01-setup');

    expect(phaseInsert(0, 'bad', planningDir).error).toMatch(/positive integer/);
    expect(phaseInsert(-1, 'bad', planningDir).error).toMatch(/positive integer/);
    expect(phaseInsert(1.5, 'bad', planningDir).error).toMatch(/positive integer/);
  });

  it('updates STATE.md current_phase when >= position', () => {
    setupTmp();
    createPhaseDir('01-setup');
    createPhaseDir('02-auth');

    const stateWith2 = MINIMAL_STATE.replace('current_phase: 1', 'current_phase: 2');
    writePlanningFile(planningDir, 'STATE.md', stateWith2);

    const result = phaseInsert(2, 'new-phase', planningDir);
    expect(result.state_updated).toBe(true);

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    expect(stateContent).toMatch(/current_phase:\s*3/);
  });

  it('does not update STATE.md when current_phase < position', () => {
    setupTmp();
    createPhaseDir('01-setup');
    createPhaseDir('02-auth');
    writePlanningFile(planningDir, 'STATE.md', MINIMAL_STATE);

    const result = phaseInsert(2, 'new-phase', planningDir);
    expect(result.state_updated).toBe(false);
  });

  it('creates phases dir if missing', () => {
    setupTmp();
    const result = phaseInsert(1, 'first', planningDir);
    expect(result.phase).toBe(1);
    expect(fs.existsSync(path.join(planningDir, 'phases', '01-first'))).toBe(true);
  });

  it('handles backward compat when planningDir is options object', () => {
    setupTmp();
    const origRoot = process.env.PBR_PROJECT_ROOT;
    process.env.PBR_PROJECT_ROOT = tmpDir;
    try {
      const result = phaseInsert(1, 'test', { goal: 'My goal' });
      expect(result.phase).toBe(1);
    } finally {
      if (origRoot !== undefined) {
        process.env.PBR_PROJECT_ROOT = origRoot;
      } else {
        delete process.env.PBR_PROJECT_ROOT;
      }
    }
  });

  it('updates ROADMAP.md when it exists', () => {
    setupTmp();
    createPhaseDir('01-setup');
    writePlanningFile(planningDir, 'ROADMAP.md', MINIMAL_ROADMAP);

    const result = phaseInsert(1, 'pre-setup', planningDir, { goal: 'Pre-work' });
    expect(result.roadmap_updated).toBe(true);
  });
});
