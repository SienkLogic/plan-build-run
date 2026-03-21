/**
 * Tests for lib/compound.js — Compound CLI commands.
 *
 * Uses temporary directories (never mutates fixtures).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  compoundInitPhase,
  compoundCompletePhase,
  compoundInitMilestone
} = require('../plugins/pbr/scripts/lib/compound');
const { parseYamlFrontmatter } = require('../plugins/pbr/scripts/lib/core');

function createTestPlanning() {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-compound-')));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  // Write minimal STATE.md
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
    '---',
    'version: 2',
    'current_phase: 1',
    'phase_slug: "setup"',
    'status: planned',
    'plans_total: 0',
    'plans_complete: 0',
    'progress_percent: 0',
    'last_activity: "test"',
    '---',
    '',
    '# Project State',
    '',
    'Phase: 1 of 2 (Setup)',
    'Status: Planned',
    'Progress: [░░░░░░░░░░░░░░░░░░░░] 0%',
    ''
  ].join('\n'));
  // Write minimal ROADMAP.md with progress table
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), [
    '# Roadmap',
    '',
    '## Progress',
    '',
    '| Phase | Plans Complete | Status |',
    '|-------|---------------|--------|',
    '| 1. Setup | 0/0 | Planned |',
    '| 2. Build | 0/0 | Planned |',
    ''
  ].join('\n'));
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('compoundInitPhase', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTestPlanning());
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates phase directory and returns success', () => {
    const result = compoundInitPhase(5, 'my-feature', planningDir, { goal: 'Build feature X' });
    expect(result.success).toBe(true);
    expect(result.phase).toBe(5);
    expect(result.slug).toBe('my-feature');
    expect(result.directory).toMatch(/my-feature/);
    // Directory should exist on disk
    const phaseDir = path.join(planningDir, 'phases', result.directory);
    expect(fs.existsSync(phaseDir)).toBe(true);
  });

  test('updates STATE.md with new phase info', () => {
    compoundInitPhase(5, 'my-feature', planningDir);
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const fm = parseYamlFrontmatter(stateContent);
    expect(String(fm.current_phase)).toBe('5');
    expect(fm.status).toBe('planned');
    expect(fm.phase_slug).toBe('my-feature');
  });

  test('returns already_exists when phase directory exists', () => {
    // Create phase dir first
    fs.mkdirSync(path.join(planningDir, 'phases', '05-my-feature'), { recursive: true });
    const result = compoundInitPhase(5, 'existing-feature', planningDir);
    expect(result.success).toBe(true);
    expect(result.already_exists).toBe(true);
    expect(result.directory).toMatch(/05-/);
  });

  test('returns error when .planning/ does not exist', () => {
    const badDir = path.join(tmpDir, 'nonexistent');
    const result = compoundInitPhase(5, 'test', badDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  test('state_updated is true on success', () => {
    const result = compoundInitPhase(5, 'my-feature', planningDir);
    expect(result.state_updated).toBe(true);
  });
});

describe('compoundCompletePhase', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTestPlanning());
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('fails when no SUMMARY.md exists', () => {
    // Create phase dir without SUMMARY
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'phases', '01-setup', 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    const result = compoundCompletePhase(1, planningDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SUMMARY/);
  });

  test('succeeds when SUMMARY.md exists and returns summaries_found', () => {
    // Create phase dir with SUMMARY
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '---\nstatus: complete\n---\n');

    const result = compoundCompletePhase(1, planningDir);
    expect(result.success).toBe(true);
    expect(result.summaries_found).toBe(1);
  });

  test('advances STATE.md to next phase', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '---\nstatus: complete\n---\n');

    compoundCompletePhase(1, planningDir);

    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const fm = parseYamlFrontmatter(stateContent);
    // Should advance to phase 2
    expect(String(fm.current_phase)).toBe('2');
  });

  test('updates ROADMAP.md progress table', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '---\nstatus: complete\n---\n');

    compoundCompletePhase(1, planningDir);

    const roadmap = fs.readFileSync(path.join(planningDir, 'ROADMAP.md'), 'utf8');
    expect(roadmap).toMatch(/Complete/);
  });

  test('returns error when .planning/ does not exist', () => {
    const badDir = path.join(tmpDir, 'nonexistent');
    const result = compoundCompletePhase(1, badDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });
});

describe('compoundInitMilestone', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTestPlanning());
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates milestone archive directory structure', () => {
    const result = compoundInitMilestone('v20.0', planningDir, { name: 'Next Release' });
    expect(result.success).toBe(true);
    expect(result.version).toBe('v20.0');
    // Check directories exist
    expect(fs.existsSync(path.join(planningDir, 'milestones', 'v20.0'))).toBe(true);
    expect(fs.existsSync(path.join(planningDir, 'milestones', 'v20.0', 'phases'))).toBe(true);
  });

  test('copies ROADMAP.md to archive', () => {
    const result = compoundInitMilestone('v20.0', planningDir);
    expect(result.roadmap_backed_up).toBe(true);
    const archivedRoadmap = fs.readFileSync(path.join(planningDir, 'milestones', 'v20.0', 'ROADMAP.md'), 'utf8');
    expect(archivedRoadmap).toContain('# Roadmap');
  });

  test('copies REQUIREMENTS.md when it exists', () => {
    fs.writeFileSync(path.join(planningDir, 'REQUIREMENTS.md'), '# Requirements\n\n- REQ-001\n');
    const result = compoundInitMilestone('v20.0', planningDir);
    expect(result.requirements_backed_up).toBe(true);
    const archivedReqs = fs.readFileSync(path.join(planningDir, 'milestones', 'v20.0', 'REQUIREMENTS.md'), 'utf8');
    expect(archivedReqs).toContain('REQ-001');
  });

  test('requirements_backed_up is false when REQUIREMENTS.md does not exist', () => {
    const result = compoundInitMilestone('v20.0', planningDir);
    expect(result.requirements_backed_up).toBe(false);
  });

  test('updates STATE.md with last_milestone_version', () => {
    compoundInitMilestone('v20.0', planningDir);
    const stateContent = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
    const fm = parseYamlFrontmatter(stateContent);
    expect(fm.last_milestone_version).toBe('v20.0');
  });

  test('returns error when .planning/ does not exist', () => {
    const badDir = path.join(tmpDir, 'nonexistent');
    const result = compoundInitMilestone('v20.0', badDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  test('state_updated is true on success', () => {
    const result = compoundInitMilestone('v20.0', planningDir);
    expect(result.state_updated).toBe(true);
  });
});
