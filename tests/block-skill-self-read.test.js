const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'block-skill-self-read.js');

describe('block-skill-self-read.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(stdinData = '') {
    try {
      return execSync(`node "${SCRIPT}"`, {
        cwd: tmpDir,
        encoding: 'utf8',
        timeout: 5000,
        input: stdinData,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      // Script may exit with code 0 but execSync can still throw on some platforms
      return e.stdout || '';
    }
  }

  function writeActiveSkill(name) {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), name);
  }

  test('blocks when active-skill matches Read file_path', async () => {
    writeActiveSkill('build');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/some/path/plugins/pbr/skills/build/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('build');
    expect(parsed.reason).toContain('self-read blocked');
  });

  test('allows when active-skill does not match Read file_path', async () => {
    writeActiveSkill('build');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/some/path/plugins/pbr/agents/executor.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('allow');
  });

  test('allows when .active-skill file is missing', async () => {
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/some/path/plugins/pbr/skills/build/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('allow');
  });

  test('allows when reading a different skill SKILL.md', async () => {
    writeActiveSkill('build');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/some/path/plugins/pbr/skills/plan/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('allow');
  });

  test('allows when .active-skill is empty', async () => {
    writeActiveSkill('');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/some/path/plugins/pbr/skills/build/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('allow');
  });

  test('handles Windows-style backslash paths', async () => {
    writeActiveSkill('review');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: 'D:\\Repos\\plan-build-run\\plugins\\pbr\\skills\\review\\SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
  });

  test('blocks when autonomous skill reads its own SKILL.md', async () => {
    writeActiveSkill('autonomous');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/path/plugins/pbr/skills/autonomous/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('autonomous');
  });

  test('blocks when audit skill reads its own SKILL.md', async () => {
    writeActiveSkill('audit');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/path/plugins/pbr/skills/audit/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
  });

  test('allows when build skill reads autonomous SKILL.md (different skill)', async () => {
    writeActiveSkill('build');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/path/plugins/pbr/skills/autonomous/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('allow');
  });

  test('case-insensitive matching on SKILL.md', async () => {
    writeActiveSkill('Build');
    const input = JSON.stringify({
      cwd: tmpDir,
      tool_input: { file_path: '/path/skills/Build/SKILL.md' }
    });
    const output = run(input);
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
  });
});
