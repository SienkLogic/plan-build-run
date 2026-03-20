const fs = require('fs');
const path = require('path');
const os = require('os');

// Load the gate module directly from the source
const { checkUserConfirmationGate } = require('../plugins/pbr/scripts/lib/gates/user-confirmation');

describe('user-confirmation-gate', () => {
  let tmpDir;
  let planningDir;
  const origRoot = process.env.PBR_PROJECT_ROOT;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-user-conf-gate-')));
    planningDir = path.join(tmpDir, '.planning');
    process.env.PBR_PROJECT_ROOT = tmpDir;
  });

  afterEach(() => {
    process.env.PBR_PROJECT_ROOT = origRoot || '';
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(gatesConfig) {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ gates: { user_confirmation: gatesConfig } })
    );
  }

  function writeActiveSkill(skill) {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), skill);
  }

  function writeSignalFile() {
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, '.user-gate-passed'),
      JSON.stringify({ timestamp: new Date().toISOString(), operation: 'test' })
    );
  }

  function makeData(description) {
    return { tool_input: { subagent_type: 'pbr:general', description } };
  }

  test('returns null when no .planning dir exists', () => {
    process.env.PBR_PROJECT_ROOT = path.join(tmpDir, 'nonexistent');
    const result = checkUserConfirmationGate(makeData('complete milestone'));
    expect(result).toBeNull();
  });

  test('returns null when operation is not gated', () => {
    writeConfig({
      milestone_complete: { requires: 'askuser', blocking: true }
    });
    writeActiveSkill('build');
    const result = checkUserConfirmationGate(makeData('Run executor'));
    expect(result).toBeNull();
  });

  test('blocks when gated operation lacks signal file', () => {
    writeConfig({
      milestone_complete: { requires: 'askuser', blocking: true }
    });
    writeActiveSkill('milestone');
    const result = checkUserConfirmationGate(makeData('complete milestone'));
    expect(result.block).toBe(true);
    expect(result.reason).toContain('milestone_complete');
  });

  test('passes when signal file exists', () => {
    writeConfig({
      milestone_complete: { requires: 'askuser', blocking: true }
    });
    writeActiveSkill('milestone');
    writeSignalFile();
    const result = checkUserConfirmationGate(makeData('complete milestone'));
    expect(result).toBeNull();
  });

  test('returns warning for non-blocking gate', () => {
    writeConfig({
      phase_skip: { requires: 'askuser', blocking: false }
    });
    writeActiveSkill('build');
    const result = checkUserConfirmationGate(makeData('skip phase 3'));
    expect(result).toEqual({
      block: false,
      warning: expect.stringContaining('phase_skip')
    });
  });
});
