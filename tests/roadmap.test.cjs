/**
 * PBR Tools Tests - Roadmap
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runPbrTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('roadmap get-phase command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts phase section from ROADMAP.md', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Phases

### Phase 1: Foundation
**Goal:** Set up project infrastructure
**Plans:** 2 plans

Some description here.

### Phase 2: API
**Goal:** Build REST API
**Plans:** 3 plans
`
    );

    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'phase should be found');
    assert.strictEqual(output.phase_number, '1', 'phase number correct');
    assert.strictEqual(output.phase_name, 'Foundation', 'phase name extracted');
    assert.strictEqual(output.goal, 'Set up project infrastructure', 'goal extracted');
  });

  test('returns not found for missing phase', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Phase 1: Foundation
**Goal:** Set up project
`
    );

    const result = runPbrTools('roadmap get-phase 5', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'phase should not be found');
  });

  test('handles decimal phase numbers', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 2: Main
**Goal:** Main work

### Phase 2.1: Hotfix
**Goal:** Emergency fix
`
    );

    const result = runPbrTools('roadmap get-phase 2.1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'decimal phase should be found');
    assert.strictEqual(output.phase_name, 'Hotfix', 'phase name correct');
    assert.strictEqual(output.goal, 'Emergency fix', 'goal extracted');
  });

  test('extracts full section content', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Setup
**Goal:** Initialize everything

This phase covers:
- Database setup
- Auth configuration
- CI/CD pipeline

### Phase 2: Build
**Goal:** Build features
`
    );

    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.section.includes('Database setup'), 'section includes description');
    assert.ok(output.section.includes('CI/CD pipeline'), 'section includes all bullets');
    assert.ok(!output.section.includes('Phase 2'), 'section does not include next phase');
  });

  test('handles missing ROADMAP.md gracefully', async () => {
    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'should return not found');
    assert.strictEqual(output.error, 'ROADMAP.md not found', 'should explain why');
  });

  test('accepts ## phase headers (two hashes)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Phase 1: Foundation
**Goal:** Set up project infrastructure
**Plans:** 2 plans

## Phase 2: API
**Goal:** Build REST API
`
    );

    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'phase with ## header should be found');
    assert.strictEqual(output.phase_name, 'Foundation', 'phase name extracted');
    assert.strictEqual(output.goal, 'Set up project infrastructure', 'goal extracted');
  });

  test('detects malformed ROADMAP with summary list but no detail sections', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Phases

- [ ] **Phase 1: Foundation** - Set up project
- [ ] **Phase 2: API** - Build REST API
`
    );

    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'phase should not be found');
    assert.strictEqual(output.error, 'malformed_roadmap', 'should identify malformed roadmap');
    assert.ok(output.message.includes('missing'), 'should explain the issue');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase next-decimal command
// ─────────────────────────────────────────────────────────────────────────────


describe('roadmap analyze command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing ROADMAP.md returns error', async () => {
    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'ROADMAP.md not found');
  });

  test('parses phases with goals and disk status', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Phase 1: Foundation
**Goal:** Set up infrastructure

### Phase 2: Authentication
**Goal:** Add user auth

### Phase 3: Features
**Goal:** Build core features
`
    );

    // Create phase dirs with varying completion
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const p2 = path.join(tmpDir, '.planning', 'phases', '02-authentication');
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p2, '02-01-PLAN.md'), '# Plan');

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 3, 'should find 3 phases');
    assert.strictEqual(output.phases[0].disk_status, 'complete', 'phase 1 complete');
    assert.strictEqual(output.phases[1].disk_status, 'planned', 'phase 2 planned');
    assert.strictEqual(output.phases[2].disk_status, 'no_directory', 'phase 3 no directory');
    assert.strictEqual(output.completed_phases, 1, '1 phase complete');
    assert.strictEqual(output.total_plans, 2, '2 total plans');
    assert.strictEqual(output.total_summaries, 1, '1 total summary');
    assert.strictEqual(output.progress_percent, 50, '50% complete');
    assert.strictEqual(output.current_phase, '2', 'current phase is 2');
  });

  test('extracts goals and dependencies', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Setup
**Goal:** Initialize project
**Depends on:** Nothing

### Phase 2: Build
**Goal:** Build features
**Depends on:** Phase 1
`
    );

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases[0].goal, 'Initialize project');
    assert.strictEqual(output.phases[0].depends_on, 'Nothing');
    assert.strictEqual(output.phases[1].goal, 'Build features');
    assert.strictEqual(output.phases[1].depends_on, 'Phase 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap analyze disk status variants
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap analyze disk status variants', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns researched status for phase dir with only RESEARCH.md', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Exploration
**Goal:** Research the domain
`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-exploration');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-RESEARCH.md'), '# Research notes');

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases[0].disk_status, 'researched', 'disk_status should be researched');
    assert.strictEqual(output.phases[0].has_research, true, 'has_research should be true');
  });

  test('returns discussed status for phase dir with only CONTEXT.md', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Discussion
**Goal:** Gather context
`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-discussion');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-CONTEXT.md'), '# Context notes');

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases[0].disk_status, 'discussed', 'disk_status should be discussed');
    assert.strictEqual(output.phases[0].has_context, true, 'has_context should be true');
  });

  test('returns empty status for phase dir with no recognized files', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Empty
**Goal:** Nothing yet
`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-empty');
    fs.mkdirSync(p1, { recursive: true });

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases[0].disk_status, 'empty', 'disk_status should be empty');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap analyze milestone extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap analyze milestone extraction', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts milestone headings and version numbers', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## v1.0 Test Infrastructure

### Phase 1: Foundation
**Goal:** Set up base

## v1.1 Coverage Hardening

### Phase 2: Coverage
**Goal:** Add coverage
`
    );

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(Array.isArray(output.milestones), 'milestones should be an array');
    assert.strictEqual(output.milestones.length, 2, 'should find 2 milestones');
    assert.strictEqual(output.milestones[0].version, 'v1.0', 'first milestone version');
    assert.ok(output.milestones[0].heading.includes('v1.0'), 'first milestone heading contains v1.0');
    assert.strictEqual(output.milestones[1].version, 'v1.1', 'second milestone version');
    assert.ok(output.milestones[1].heading.includes('v1.1'), 'second milestone heading contains v1.1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap analyze missing phase details
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap analyze missing phase details', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('detects checklist-only phases missing detail sections', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] **Phase 1: Foundation** - Set up project
- [ ] **Phase 2: API** - Build REST API

### Phase 2: API
**Goal:** Build REST API
`
    );

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(Array.isArray(output.missing_phase_details), 'missing_phase_details should be an array');
    assert.ok(output.missing_phase_details.includes('1'), 'phase 1 should be in missing details');
    assert.ok(!output.missing_phase_details.includes('2'), 'phase 2 should not be in missing details');
  });

  test('returns null when all checklist phases have detail sections', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] **Phase 1: Foundation** - Set up project
- [ ] **Phase 2: API** - Build REST API

### Phase 1: Foundation
**Goal:** Set up project

### Phase 2: API
**Goal:** Build REST API
`
    );

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.missing_phase_details, null, 'missing_phase_details should be null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap get-phase success criteria
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap get-phase success criteria', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts success_criteria array from phase section', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Test
**Goal:** Test goal
**Success Criteria** (what must be TRUE):
  1. First criterion
  2. Second criterion
  3. Third criterion

### Phase 2: Other
**Goal:** Other goal
`
    );

    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'phase should be found');
    assert.ok(Array.isArray(output.success_criteria), 'success_criteria should be an array');
    assert.strictEqual(output.success_criteria.length, 3, 'should have 3 criteria');
    assert.ok(output.success_criteria[0].includes('First criterion'), 'first criterion matches');
    assert.ok(output.success_criteria[1].includes('Second criterion'), 'second criterion matches');
    assert.ok(output.success_criteria[2].includes('Third criterion'), 'third criterion matches');
  });

  test('returns empty array when no success criteria present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Simple
**Goal:** No criteria here
`
    );

    const result = runPbrTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'phase should be found');
    assert.ok(Array.isArray(output.success_criteria), 'success_criteria should be an array');
    assert.strictEqual(output.success_criteria.length, 0, 'should have empty criteria');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap update-plan-progress command
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap update-plan-progress command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing phase number returns error', async () => {
    const result = runPbrTools('roadmap update-plan-progress', tmpDir);
    assert.strictEqual(result.success, false, 'should fail without phase number');
    assert.ok(result.error.includes('phase number required'), 'error should mention phase number required');
  });

  test('nonexistent phase returns error', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Test
**Goal:** Test goal
`
    );

    const result = runPbrTools('roadmap update-plan-progress 99', tmpDir);
    assert.strictEqual(result.success, false, 'should fail for nonexistent phase');
    assert.ok(result.error.includes('not found'), 'error should mention not found');
  });

  test('no plans found returns updated false', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Test
**Goal:** Test goal
`
    );

    // Create phase dir with only a context file (no plans)
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-CONTEXT.md'), '# Context');

    const result = runPbrTools('roadmap update-plan-progress 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, false, 'should not update');
    assert.ok(output.reason.includes('No plans'), 'reason should mention no plans');
    assert.strictEqual(output.plan_count, 0, 'plan_count should be 0');
  });

  test('updates progress for partial completion', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Test
**Goal:** Test goal
**Plans:** TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test | v1.0 | 0/2 | Planned | - |
`
    );

    // Create phase dir with 2 plans, 1 summary
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(p1, '01-02-PLAN.md'), '# Plan 2');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary 1');

    const result = runPbrTools('roadmap update-plan-progress 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should update');
    assert.strictEqual(output.plan_count, 2, 'plan_count should be 2');
    assert.strictEqual(output.summary_count, 1, 'summary_count should be 1');
    assert.strictEqual(output.status, 'In Progress', 'status should be In Progress');
    assert.strictEqual(output.complete, false, 'should not be complete');

    // Verify file was actually modified
    const roadmapContent = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmapContent.includes('1/2'), 'roadmap should contain updated plan count');
  });

  test('updates progress and checks checkbox on completion', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] **Phase 1: Test** - description

### Phase 1: Test
**Goal:** Test goal
**Plans:** TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test | v1.0 | 0/1 | Planned | - |
`
    );

    // Create phase dir with 1 plan, 1 summary (complete)
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary 1');

    const result = runPbrTools('roadmap update-plan-progress 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should update');
    assert.strictEqual(output.complete, true, 'should be complete');
    assert.strictEqual(output.status, 'Complete', 'status should be Complete');

    // Verify file was actually modified
    const roadmapContent = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmapContent.includes('[x]'), 'checkbox should be checked');
    assert.ok(roadmapContent.includes('completed'), 'should contain completion date text');
    assert.ok(roadmapContent.includes('1/1'), 'roadmap should contain updated plan count');
  });

  test('missing ROADMAP.md returns updated false', async () => {
    // Create phase dir with plans and summaries but NO ROADMAP.md
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary 1');

    const result = runPbrTools('roadmap update-plan-progress 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, false, 'should not update');
    assert.ok(output.reason.includes('ROADMAP.md not found'), 'reason should mention missing ROADMAP.md');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GSD-aligned format: parseRoadmapMd with new format
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap analyze with GSD-aligned format', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts requirements and success_criteria from phases', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap: Test Project

## Milestone: v1.0 -- Core Features

**Phases:** 1 - 2

### Phase 1: Foundation
**Goal:** Set up project infrastructure
**Requirements:** REQ-F-001, REQ-F-002
**Success Criteria:** All tests pass, CI green

### Phase 2: API
**Goal:** Build REST API
**Requirements:** REQ-F-003
**Success Criteria:** API endpoints respond correctly
`
    );

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases.length, 2, 'should find 2 phases');
    assert.strictEqual(output.phases[0].name, 'Foundation', 'phase 1 name');
    assert.strictEqual(output.phases[0].goal, 'Set up project infrastructure', 'phase 1 goal');
    assert.strictEqual(output.phases[0].requirements, 'REQ-F-001, REQ-F-002', 'phase 1 requirements');
    assert.strictEqual(output.phases[0].success_criteria, 'All tests pass, CI green', 'phase 1 success_criteria');
    assert.strictEqual(output.phases[1].requirements, 'REQ-F-003', 'phase 2 requirements');
  });

  test('details-wrapped completed milestone does not break parsing', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

<details>
<summary>

## Milestone: v1.0 -- COMPLETED

</summary>

**Phases:** 1 - 1

### Phase 1: Foundation
**Goal:** Set up base

</details>

## Milestone: v2.0

**Phases:** 2 - 2

### Phase 2: Build
**Goal:** Build features
**Requirements:** REQ-002
**Success Criteria:** Features work
`
    );

    const result = runPbrTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.phases.length >= 2, 'should find at least 2 phases');
    const phase1 = output.phases.find(p => p.number === 1);
    const phase2 = output.phases.find(p => p.number === 2);
    assert.ok(phase1, 'phase 1 from collapsed milestone should be found');
    assert.ok(phase2, 'phase 2 from active milestone should be found');
    assert.strictEqual(phase2.goal, 'Build features', 'active phase goal extracted');
    assert.strictEqual(phase2.requirements, 'REQ-002', 'active phase requirements extracted');
  });

  test('update-plan-progress works with Milestone column in progress table', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1

### Phase 1: Test
**Goal:** Test goal

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Test | v1.0 | 0/2 | Planned | - |
`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(p1, '01-02-PLAN.md'), '# Plan 2');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary 1');

    const result = runPbrTools('roadmap update-plan-progress 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true, 'should succeed');
    assert.strictEqual(output.plan_count, 2, 'plan_count should be 2');
    assert.strictEqual(output.summary_count, 1, 'summary_count should be 1');

    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('1/2'), 'roadmap should contain updated plan count');
  });

  test('update-plan-progress works without Milestone column (backward compat)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Test
**Goal:** Test goal

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test | 0/1 | Planned | - |
`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary 1');

    const result = runPbrTools('roadmap update-plan-progress 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.success, true, 'should succeed');
    assert.strictEqual(output.complete, true, 'should be complete');

    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('1/1'), 'roadmap should contain updated plan count');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase add command
// ─────────────────────────────────────────────────────────────────────────────

