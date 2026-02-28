const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  checkDebuggerAdvisory,
  checkCheckpointManifest,
  checkActiveSkillIntegrity
} = require('../../../plugins/pbr/scripts/lib/gates/advisories');

describe('checkDebuggerAdvisory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-dbg-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PBR_PROJECT_ROOT;
  });

  test('returns null for non-debugger agents', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toBeNull();
  });

  test('returns null when active skill is not debug', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
    expect(result).toBeNull();
  });

  test('returns advisory when active skill is debug and debug/ dir missing', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'debug');
    const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
    expect(result).toContain('Debugger advisory');
    expect(result).toContain('.planning/debug/');
  });

  test('returns null when debug/ dir exists', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'debug'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'debug');
    const result = checkDebuggerAdvisory({ tool_input: { subagent_type: 'pbr:debugger' } });
    expect(result).toBeNull();
  });
});

describe('checkCheckpointManifest', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-cm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PBR_PROJECT_ROOT;
  });

  test('returns null for non-executor agents', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result).toBeNull();
  });

  test('returns null when active skill is not build', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toBeNull();
  });

  test('warns when manifest is missing from phase dir', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Test)\n');
    const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toContain('checkpoint-manifest');
  });

  test('returns null when manifest exists', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\nPhase: 1 of 3 (Test)\n');
    fs.writeFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), '{}');
    const result = checkCheckpointManifest({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toBeNull();
  });
});

describe('checkActiveSkillIntegrity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-asi-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PBR_PROJECT_ROOT;
  });

  test('returns null for non-pbr agents', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'custom:agent' } });
    expect(result).toBeNull();
  });

  test('warns when pbr agent spawns without .active-skill', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toContain('active-skill');
  });

  test('returns null when .active-skill exists', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(result).toBeNull();
  });

  test('returns null when no .planning dir exists', () => {
    process.env.PBR_PROJECT_ROOT = tmpDir;
    const result = checkActiveSkillIntegrity({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(result).toBeNull();
  });
});
