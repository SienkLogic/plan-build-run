'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Will be created in Task 1 GREEN phase
const { checkPlanValidationGate } = require('../plugins/pbr/scripts/lib/gates/plan-validation');

describe('checkPlanValidationGate', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-val-gate-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'phases', '01-test-phase'), { recursive: true });

    // Write STATE.md with current phase
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\ncurrent_phase: 1\n---\nPhase: 1\n');

    // Write .active-skill as 'build'
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');

    // Write config.json with standard depth
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'standard' }));

    // Write a PLAN file so the gate doesn't skip (empty dirs are allowed through)
    fs.writeFileSync(path.join(planningDir, 'phases', '01-test-phase', 'PLAN-01.md'), '---\nplan: 01\n---\n');

    // Set project root so the gate finds .planning
    process.env.PBR_PROJECT_ROOT = tmpDir;
  });

  afterEach(() => {
    delete process.env.PBR_PROJECT_ROOT;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns null when active skill is not build', async () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });

  test('returns null when subagent_type is not pbr:executor', async () => {
    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:planner' }
    });
    expect(result).toBeNull();
  });

  test('blocks when .plan-check.json is missing (depth: standard)', async () => {
    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('.plan-check.json');
  });

  test('blocks when .plan-check.json has status: issues_found', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test-phase');
    fs.writeFileSync(path.join(phaseDir, '.plan-check.json'), JSON.stringify({
      status: 'issues_found',
      dimensions_checked: 9,
      blockers: 2,
      warnings: 1,
      timestamp: new Date().toISOString()
    }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('issues');
    expect(result.reason).toContain('blockers');
  });

  test('returns null (allows) when .plan-check.json has status: passed', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test-phase');
    fs.writeFileSync(path.join(phaseDir, '.plan-check.json'), JSON.stringify({
      status: 'passed',
      dimensions_checked: 9,
      blockers: 0,
      warnings: 0,
      timestamp: new Date().toISOString()
    }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });

  test('returns advisory warning (not block) when depth is quick and .plan-check.json missing', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'quick' }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).not.toBeNull();
    expect(result.block).toBeUndefined();
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('quick');
  });

  test('returns null when .inline-active signal file exists', async () => {
    fs.writeFileSync(path.join(planningDir, '.inline-active'), '');

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });

  test('blocks when requirements_coverage has uncovered items (depth: standard)', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test-phase');
    fs.writeFileSync(path.join(phaseDir, '.plan-check.json'), JSON.stringify({
      status: 'passed',
      dimensions_checked: 9,
      blockers: 0,
      warnings: 0,
      timestamp: new Date().toISOString(),
      requirements_coverage: {
        total: 3,
        covered: 2,
        uncovered: ['REQ-X'],
        coverage_percent: 67
      }
    }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('REQ-X');
    expect(result.reason).toContain('implements');
  });

  test('returns warning when requirements_coverage has uncovered items (depth: quick)', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ depth: 'quick' }));
    const phaseDir = path.join(planningDir, 'phases', '01-test-phase');
    fs.writeFileSync(path.join(phaseDir, '.plan-check.json'), JSON.stringify({
      status: 'passed',
      dimensions_checked: 9,
      blockers: 0,
      warnings: 0,
      timestamp: new Date().toISOString(),
      requirements_coverage: {
        total: 3,
        covered: 2,
        uncovered: ['REQ-X'],
        coverage_percent: 67
      }
    }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).not.toBeNull();
    expect(result.block).toBeUndefined();
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('REQ-X');
  });

  test('allows when requirements_coverage has zero uncovered items', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test-phase');
    fs.writeFileSync(path.join(phaseDir, '.plan-check.json'), JSON.stringify({
      status: 'passed',
      dimensions_checked: 9,
      blockers: 0,
      warnings: 0,
      timestamp: new Date().toISOString(),
      requirements_coverage: {
        total: 3,
        covered: 3,
        uncovered: [],
        coverage_percent: 100
      }
    }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });

  test('allows when requirements_coverage section is absent (backward compat)', async () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test-phase');
    fs.writeFileSync(path.join(phaseDir, '.plan-check.json'), JSON.stringify({
      status: 'passed',
      dimensions_checked: 9,
      blockers: 0,
      warnings: 0,
      timestamp: new Date().toISOString()
    }));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });

  test('returns null on unexpected errors (fail open)', async () => {
    // Remove STATE.md so readCurrentPhase returns null
    fs.unlinkSync(path.join(planningDir, 'STATE.md'));

    const result = checkPlanValidationGate({
      tool_input: { subagent_type: 'pbr:executor' }
    });
    expect(result).toBeNull();
  });
});
