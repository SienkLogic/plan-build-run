const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkBuildExecutorGate } = require('../../../plugins/pbr/scripts/lib/gates/build-executor');

function makeData(subagentType) {
  return { tool_input: { description: 'Run executor', subagent_type: subagentType } };
}

describe('checkBuildExecutorGate', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PBR_PROJECT_ROOT;
  });

  test('returns null for non-executor agents', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result).toBeNull();
  });

  test('returns null when active skill is not build', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    const result = checkBuildExecutorGate(makeData('pbr:executor'));
    expect(result).toBeNull();
  });

  test('returns null when no .active-skill file', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const result = checkBuildExecutorGate(makeData('pbr:executor'));
    expect(result).toBeNull();
  });

  test('blocks when PLAN.md missing from phase dir', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Setup)\n');
    const result = checkBuildExecutorGate(makeData('pbr:executor'));
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('no PLAN.md found');
  });

  test('returns null when PLAN.md exists in phase dir', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Setup)\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '# Plan\n<task>do stuff</task>');
    const result = checkBuildExecutorGate(makeData('pbr:executor'));
    expect(result).toBeNull();
  });

  test('blocks when phases/ dir missing', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Setup)\n');
    const result = checkBuildExecutorGate(makeData('pbr:executor'));
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('phases/ directory does not exist');
  });
});
