/**
 * Tests for phaseComplete — marks a phase as complete in ROADMAP.md and STATE.md.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { phaseComplete } = require('../plugins/pbr/scripts/lib/phase');
const { parseYamlFrontmatter } = require('../plugins/pbr/scripts/lib/yaml');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-phase-complete-'));
}

function writeFixture(dir, relativePath, content) {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

const ROADMAP_3PHASES = `# Roadmap

## Progress

| Phase | Plans Complete | Status |
|-------|---------------|--------|
| 88. Compound State CLI | 2/2 | Built |
| 89. Core Agent CLI | 0/0 | Not Started |
| 90. Supporting Agent CLI | 0/0 | Not Started |
`;

const STATE_PHASE88 = `---
version: 2
current_phase: 88
phase_slug: "compound-state-cli"
status: "built"
plans_complete: 2
plans_total: 2
progress_percent: 20
last_activity: "2026-03-06 Built all plans"
---
# Project State
Phase: 88 of 97 (Compound State Cli)
Status: Built
Plan: 2 of 2
Progress: [████░░░░░░░░░░░░░░░░] 20%
Last activity: 2026-03-06 Built all plans
`;

describe('phaseComplete', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = makeTempDir();
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('happy path: advance from phase 88 to 89', async () => {
    writeFixture(tmpDir, 'ROADMAP.md', ROADMAP_3PHASES);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);
    // Create phase directories for progress calculation
    writeFixture(tmpDir, 'phases/88-compound-state-cli/PLAN-01.md', '---\nplan: "88-01"\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/SUMMARY-88-01.md', '---\nstatus: complete\n---\n');

    const result = await phaseComplete('88', tmpDir);

    expect(result.success).toBe(true);
    expect(result.completed_phase).toBe(88);
    expect(result.next_phase).toBe(89);
    expect(result.next_slug).toContain('core-agent-cli');
    expect(result.roadmap_updated).toBe(true);
    expect(result.state_updated).toBe(true);
    expect(result.final_phase).toBe(false);

    // Verify ROADMAP.md updated
    const roadmap = fs.readFileSync(path.join(tmpDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toMatch(/88\.\s+Compound State CLI.*Complete/);
    const today = new Date().toISOString().slice(0, 10);
    expect(roadmap).toContain(today);

    // Verify STATE.md frontmatter
    const state = fs.readFileSync(path.join(tmpDir, 'STATE.md'), 'utf8');
    const fm = parseYamlFrontmatter(state);
    expect(fm.current_phase).toBe(89);
    expect(fm.status).toBe('planned');
    // plans_complete is recalculated by stateUpdateProgress from filesystem
    // so it reflects actual completed summaries across all phases
  });

  test('final phase in milestone: sets status to verified', async () => {
    const singlePhaseRoadmap = `# Roadmap

## Progress

| Phase | Plans Complete | Status |
|-------|---------------|--------|
| 88. Compound State CLI | 2/2 | Built |
`;
    writeFixture(tmpDir, 'ROADMAP.md', singlePhaseRoadmap);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);
    writeFixture(tmpDir, 'phases/88-compound-state-cli/PLAN-01.md', '---\nplan: "88-01"\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/SUMMARY-88-01.md', '---\nstatus: complete\n---\n');

    const result = await phaseComplete('88', tmpDir);

    expect(result.success).toBe(true);
    expect(result.final_phase).toBe(true);
    expect(result.next_phase).toBeNull();
    expect(result.next_slug).toBeNull();

    // STATE.md should have status verified, current_phase still 88
    const state = fs.readFileSync(path.join(tmpDir, 'STATE.md'), 'utf8');
    const fm = parseYamlFrontmatter(state);
    expect(fm.status).toBe('verified');
    expect(fm.current_phase).toBe(88);
  });

  test('missing STATE.md returns error', async () => {
    writeFixture(tmpDir, 'ROADMAP.md', ROADMAP_3PHASES);

    const result = await phaseComplete('88', tmpDir);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/STATE\.md not found/);
  });

  test('missing ROADMAP.md returns error', async () => {
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);

    const result = await phaseComplete('88', tmpDir);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ROADMAP\.md not found/);
  });

  test('phase not found in progress table returns error', async () => {
    writeFixture(tmpDir, 'ROADMAP.md', ROADMAP_3PHASES);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);

    const result = await phaseComplete('99', tmpDir);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Phase 99 not found/);
  });

  test('phase checklist is updated from [ ] to [x]', async () => {
    const roadmapWithChecklist = `# Roadmap

## Phase Checklist

- [ ] Phase 88: Compound State CLI
- [ ] Phase 89: Core Agent CLI

## Progress

| Phase | Plans Complete | Status |
|-------|---------------|--------|
| 88. Compound State CLI | 2/2 | Built |
| 89. Core Agent CLI | 0/0 | Not Started |
`;
    writeFixture(tmpDir, 'ROADMAP.md', roadmapWithChecklist);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);
    writeFixture(tmpDir, 'phases/88-compound-state-cli/PLAN-01.md', '---\nplan: "88-01"\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/SUMMARY-88-01.md', '---\nstatus: complete\n---\n');

    const result = await phaseComplete('88', tmpDir);
    expect(result.success).toBe(true);

    const roadmap = fs.readFileSync(path.join(tmpDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toMatch(/- \[x\] Phase 88:/);
    expect(roadmap).toMatch(/- \[ \] Phase 89:/);
  });

  test('cross-file consistency: STATE.md frontmatter matches body', async () => {
    writeFixture(tmpDir, 'ROADMAP.md', ROADMAP_3PHASES);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);
    writeFixture(tmpDir, 'phases/88-compound-state-cli/PLAN-01.md', '---\nplan: "88-01"\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/SUMMARY-88-01.md', '---\nstatus: complete\n---\n');

    await phaseComplete('88', tmpDir);

    const state = fs.readFileSync(path.join(tmpDir, 'STATE.md'), 'utf8');
    const fm = parseYamlFrontmatter(state);

    // Frontmatter says 89
    expect(fm.current_phase).toBe(89);
    expect(fm.status).toBe('planned');

    // Body lines should also reflect the updates
    expect(state).toMatch(/^Phase:\s*89/m);
    expect(state).toMatch(/^Status:\s*Planned/m);
    // Plan line is recalculated by stateUpdateProgress from filesystem
    expect(state).toMatch(/^Plan:\s*\d+\s+of\s+\d+/m);
  });

  test('returns verification_missing: true when VERIFICATION.md absent', async () => {
    writeFixture(tmpDir, 'ROADMAP.md', ROADMAP_3PHASES);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);
    writeFixture(tmpDir, 'phases/88-compound-state-cli/PLAN-01.md', '---\nplan: "88-01"\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/SUMMARY-88-01.md', '---\nstatus: complete\n---\n');

    const result = await phaseComplete('88', tmpDir);

    expect(result.success).toBe(true);
    expect(result.verification_missing).toBe(true);
  });

  test('returns verification_missing: false when VERIFICATION.md exists', async () => {
    writeFixture(tmpDir, 'ROADMAP.md', ROADMAP_3PHASES);
    writeFixture(tmpDir, 'STATE.md', STATE_PHASE88);
    writeFixture(tmpDir, 'phases/88-compound-state-cli/PLAN-01.md', '---\nplan: "88-01"\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/SUMMARY-88-01.md', '---\nstatus: complete\n---\n');
    writeFixture(tmpDir, 'phases/88-compound-state-cli/VERIFICATION.md', '---\nstatus: passed\n---\n');

    const result = await phaseComplete('88', tmpDir);

    expect(result.success).toBe(true);
    expect(result.verification_missing).toBe(false);
  });
});
