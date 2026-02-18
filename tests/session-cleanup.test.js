const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'session-cleanup.js');

describe('session-cleanup.js', () => {
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

  function run(stdinData = '{}') {
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      input: stdinData,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  test('exits silently when no .planning directory', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const output = run();
    expect(output).toBe('');
  });

  test('removes .auto-next file', () => {
    const filePath = path.join(planningDir, '.auto-next');
    fs.writeFileSync(filePath, '/pbr:build 3');

    run();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes .active-operation file', () => {
    const filePath = path.join(planningDir, '.active-operation');
    fs.writeFileSync(filePath, 'build');

    run();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes .active-skill file', () => {
    const filePath = path.join(planningDir, '.active-skill');
    fs.writeFileSync(filePath, 'plan');

    run();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes all three signal files at once', () => {
    fs.writeFileSync(path.join(planningDir, '.auto-next'), 'cmd');
    fs.writeFileSync(path.join(planningDir, '.active-operation'), 'op');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'sk');

    run();

    expect(fs.existsSync(path.join(planningDir, '.auto-next'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.active-operation'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.active-skill'))).toBe(false);
  });

  test('logs cleaned decision when files were removed', () => {
    fs.writeFileSync(path.join(planningDir, '.auto-next'), 'cmd');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'sk');

    run();

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('session-cleanup');
    expect(entry.event).toBe('SessionEnd');
    expect(entry.decision).toBe('cleaned');
    expect(entry.removed).toContain('.auto-next');
    expect(entry.removed).toContain('.active-skill');
  });

  test('logs nothing decision when no files to remove', () => {
    run();

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.decision).toBe('nothing');
    expect(entry.removed).toEqual([]);
  });

  test('passes stdin reason to log entry', () => {
    const stdinData = JSON.stringify({ reason: 'user_quit' });
    run(stdinData);

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.reason).toBe('user_quit');
  });

  test('handles invalid JSON stdin gracefully', () => {
    const output = run('not json at all');
    // Should not crash
    expect(output).toBe('');
  });

  test('handles empty stdin gracefully', () => {
    const output = run('');
    expect(output).toBe('');
  });
});
