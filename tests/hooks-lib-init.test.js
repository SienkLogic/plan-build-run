/**
 * Tests for hooks/lib/init.js — 7 compound init functions.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { configClearCache } = require('../hooks/lib/config');
const {
  initExecutePhase,
  initPlanPhase,
  initQuick,
  initVerifyWork,
  initResume,
  initProgress,
  initStateBundle
} = require('../hooks/lib/init');

let tmpDir, planningDir;

beforeEach(() => {
  configClearCache();
});

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
  configClearCache();
});

function setupBasicProject() {
  ({ tmpDir, planningDir } = createTmpPlanning());
  writePlanningFile(planningDir, 'STATE.md', [
    '---',
    'version: 2',
    'current_phase: 1',
    'phase_slug: "setup"',
    'status: "building"',
    'plans_total: 2',
    'plans_complete: 1',
    'last_activity: "2026-03-19"',
    '---',
    '',
    '# Project State',
    '',
    'Phase: 1 of 3 (Setup)',
    'Status: Building'
  ].join('\n'));

  writePlanningFile(planningDir, 'ROADMAP.md', [
    '---',
    'project: "TestProject"',
    '---',
    '',
    '## Milestone: v1.0',
    '',
    '### Phase 1: Setup'
  ].join('\n'));

  writePlanningFile(planningDir, 'config.json', JSON.stringify({
    project_name: 'TestProject',
    depth: 'standard',
    mode: 'interactive',
    models: { executor: 'sonnet', verifier: 'sonnet', planner: 'sonnet' }
  }));

  // Create phase directory with plan
  const phaseDir = path.join(planningDir, 'phases', '01-setup');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
    '---',
    'phase: "01-setup"',
    'plan: "01-01"',
    'wave: 1',
    'must_haves:',
    '  truths:',
    '    - "Tests pass"',
    '---',
    '',
    '## Tasks',
    '',
    '<task id="T1">',
    '<name>Do stuff</name>',
    '</task>'
  ].join('\n'));

  return phaseDir;
}

describe('initExecutePhase', () => {
  it('returns error when .planning does not exist', () => {
    const result = initExecutePhase('1', '/nonexistent/.planning');
    expect(result.error).toBeTruthy();
  });

  it('returns phase and plan info for valid setup', () => {
    setupBasicProject();
    const result = initExecutePhase('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.phase).toBeDefined();
    expect(result.phase.num).toBe('1');
    expect(result.plans).toBeDefined();
    expect(result.config).toBeDefined();
    expect(result.executor_model).toBe('sonnet');
  });

  it('accepts model override', () => {
    setupBasicProject();
    const result = initExecutePhase('1', planningDir, 'opus');
    expect(result.executor_model).toBe('opus');
    expect(result.verifier_model).toBe('opus');
  });
});

describe('initPlanPhase', () => {
  it('returns error when .planning does not exist', () => {
    const result = initPlanPhase('1', '/nonexistent/.planning');
    expect(result.error).toBeTruthy();
  });

  it('returns config and phase info for valid setup', () => {
    setupBasicProject();
    const result = initPlanPhase('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.config).toBeDefined();
    expect(result.phase).toBeDefined();
    expect(result.researcher_model).toBe('sonnet');
    expect(result.workflow).toBeDefined();
  });
});

describe('initQuick', () => {
  it('returns next task number and slug', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const result = initQuick('Fix the login bug', planningDir);
    expect(result.next_task_number).toBe('001');
    expect(result.slug).toContain('fix');
    expect(result.dir).toContain('001-');
  });

  it('increments number when existing quick tasks exist', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const quickDir = path.join(planningDir, 'quick', '005-old-task');
    fs.mkdirSync(quickDir, { recursive: true });

    const result = initQuick('New task', planningDir);
    expect(result.next_task_number).toBe('006');
  });
});

describe('initVerifyWork', () => {
  it('returns error for nonexistent phase', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');
    writePlanningFile(planningDir, 'STATE.md', '---\nstatus: building\n---\n');

    const result = initVerifyWork('99', planningDir);
    expect(result.error).toBeTruthy();
  });

  it('returns phase and summaries for valid phase', () => {
    setupBasicProject();
    const result = initVerifyWork('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.phase).toBeDefined();
    expect(result.verifier_model).toBe('sonnet');
  });
});

describe('initResume', () => {
  it('returns error when .planning does not exist', () => {
    const result = initResume('/nonexistent/.planning');
    expect(result.error).toBeTruthy();
  });

  it('returns state and signal files for valid project', () => {
    setupBasicProject();
    const result = initResume(planningDir);
    expect(result.error).toBeUndefined();
    expect(result.state).toBeDefined();
    expect(result).toHaveProperty('auto_next');
    expect(result).toHaveProperty('continue_here');
    expect(result).toHaveProperty('active_skill');
  });
});

describe('initProgress', () => {
  it('returns error when .planning does not exist', () => {
    const result = initProgress('/nonexistent/.planning');
    expect(result.error).toBeTruthy();
  });

  it('returns progress info for valid project', () => {
    setupBasicProject();
    const result = initProgress(planningDir);
    expect(result.error).toBeUndefined();
    expect(result).toHaveProperty('current_phase');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('percentage');
  });
});

describe('initStateBundle', () => {
  it('returns error when .planning does not exist', () => {
    const result = initStateBundle('1', '/nonexistent/.planning');
    expect(result.error).toBeTruthy();
  });

  it('returns full state bundle for valid phase', () => {
    setupBasicProject();
    const result = initStateBundle('1', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.state).toBeDefined();
    expect(result.config_summary).toBeDefined();
    expect(result.phase).toBeDefined();
    expect(result.plans).toBeDefined();
    expect(result.waves).toBeDefined();
    expect(result.prior_summaries).toBeDefined();
    expect(result.git).toBeDefined();
    expect(result).toHaveProperty('has_project_context');
    expect(result).toHaveProperty('has_phase_context');
  });

  it('returns error for nonexistent phase', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');
    writePlanningFile(planningDir, 'STATE.md', '---\nstatus: building\n---\n');

    const result = initStateBundle('99', planningDir);
    expect(result.error).toBeTruthy();
  });
});
