const { checkAgentStateWrite, BLOCKED_AGENTS } = require('../plugins/pbr/scripts/check-agent-state-write');
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-casw-')));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('check-agent-state-write.js', () => {
  const origCwd = process.cwd();
  let tmpDir;

  afterEach(() => {
    process.chdir(origCwd);
    if (tmpDir) cleanup(tmpDir);
    tmpDir = null;
  });

  test('blocks STATE.md write when active agent is pbr:executor', () => {
    let planningDir;
    ({ tmpDir, planningDir } = makeTmpDir());
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
    process.chdir(tmpDir);

    const result = checkAgentStateWrite({
      tool_input: { file_path: path.join(tmpDir, '.planning', 'STATE.md') }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('pbr:executor');
  });

  test('blocks STATE.md write when active agent is pbr:verifier', () => {
    let planningDir;
    ({ tmpDir, planningDir } = makeTmpDir());
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:verifier');
    process.chdir(tmpDir);

    const result = checkAgentStateWrite({
      tool_input: { file_path: path.join(tmpDir, '.planning', 'STATE.md') }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
    expect(result.output.decision).toBe('block');
  });

  test('allows STATE.md write when active agent is pbr:general', () => {
    let planningDir;
    ({ tmpDir, planningDir } = makeTmpDir());
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:general');
    process.chdir(tmpDir);

    const result = checkAgentStateWrite({
      tool_input: { file_path: path.join(tmpDir, '.planning', 'STATE.md') }
    });
    expect(result).toBeNull();
  });

  test('allows STATE.md write when no .active-agent file', () => {
    ({ tmpDir } = makeTmpDir());
    process.chdir(tmpDir);

    const result = checkAgentStateWrite({
      tool_input: { file_path: path.join(tmpDir, '.planning', 'STATE.md') }
    });
    expect(result).toBeNull();
  });

  test('allows non-STATE.md write with active agent', () => {
    let planningDir;
    ({ tmpDir, planningDir } = makeTmpDir());
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
    process.chdir(tmpDir);

    const result = checkAgentStateWrite({
      tool_input: { file_path: path.join(tmpDir, '.planning', 'ROADMAP.md') }
    });
    expect(result).toBeNull();
  });

  test('detects STATE.md with Windows backslash paths', () => {
    let planningDir;
    ({ tmpDir, planningDir } = makeTmpDir());
    fs.writeFileSync(path.join(planningDir, '.active-agent'), 'pbr:executor');
    process.chdir(tmpDir);

    const result = checkAgentStateWrite({
      tool_input: { file_path: tmpDir + '\\.planning\\STATE.md' }
    });
    expect(result).not.toBeNull();
    expect(result.exitCode).toBe(2);
  });

  test('BLOCKED_AGENTS contains all expected agents', () => {
    expect(BLOCKED_AGENTS).toContain('pbr:executor');
    expect(BLOCKED_AGENTS).toContain('pbr:planner');
    expect(BLOCKED_AGENTS).toContain('pbr:verifier');
    expect(BLOCKED_AGENTS).toContain('pbr:researcher');
    expect(BLOCKED_AGENTS).toContain('pbr:audit');
    expect(BLOCKED_AGENTS).not.toContain('pbr:general');
  });

  test('returns null for empty tool_input', () => {
    const result = checkAgentStateWrite({ tool_input: {} });
    expect(result).toBeNull();
  });
});
