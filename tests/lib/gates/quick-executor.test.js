const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkQuickExecutorGate } = require('../../../plugins/pbr/scripts/lib/gates/quick-executor');

function makeData(subagentType) {
  return { tool_input: { description: 'Run executor', subagent_type: subagentType } };
}

describe('checkQuickExecutorGate', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PBR_PROJECT_ROOT;
  });

  test('returns null for non-executor agents', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const result = checkQuickExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result).toBeNull();
  });

  test('returns null when no .active-skill file', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const result = checkQuickExecutorGate(makeData('pbr:executor'));
    expect(result).toBeNull();
  });

  test('returns null when active skill is not quick', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = checkQuickExecutorGate(makeData('pbr:executor'));
    expect(result).toBeNull();
  });

  test('blocks when active skill is quick but no quick/ dir', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const result = checkQuickExecutorGate(makeData('pbr:executor'));
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('does not exist');
  });

  test('blocks when quick/ dir exists but no PLAN.md', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    const taskDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const result = checkQuickExecutorGate(makeData('pbr:executor'));
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('no PLAN.md found');
  });

  test('returns null when quick task has a non-empty PLAN.md', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    const taskDir = path.join(planningDir, 'quick', '001-task');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    fs.writeFileSync(path.join(taskDir, 'PLAN.md'), '# Plan content');
    const result = checkQuickExecutorGate(makeData('pbr:executor'));
    expect(result).toBeNull();
  });
});
