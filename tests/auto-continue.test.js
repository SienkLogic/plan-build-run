const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'auto-continue.js');

describe('auto-continue.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run() {
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  function writeConfig(overrides = {}) {
    const config = {
      features: { auto_continue: true },
      ...overrides,
    };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
  }

  function writeSignal(content) {
    fs.writeFileSync(path.join(planningDir, '.auto-next'), content);
  }

  test('exits silently when no config.json exists', () => {
    const output = run();
    expect(output).toBe('');
  });

  test('exits silently when auto_continue is false', () => {
    writeConfig({ features: { auto_continue: false } });
    const output = run();
    expect(output).toBe('');
  });

  test('exits silently when auto_continue feature missing', () => {
    writeConfig({ features: {} });
    const output = run();
    expect(output).toBe('');
  });

  test('exits with no-signal log when no .auto-next file', () => {
    writeConfig();
    const output = run();
    expect(output).toBe('');

    // Check hook log
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('auto-continue');
    expect(entry.decision).toBe('no-signal');
  });

  test('reads signal file and outputs next command', () => {
    writeConfig();
    writeSignal('/dev:build 3');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.command).toBe('/dev:build 3');
    expect(parsed.message).toContain('/dev:build 3');
  });

  test('deletes signal file after reading (one-shot)', () => {
    writeConfig();
    writeSignal('/dev:review 2');

    run();

    const signalPath = path.join(planningDir, '.auto-next');
    expect(fs.existsSync(signalPath)).toBe(false);
  });

  test('handles empty signal file gracefully', () => {
    writeConfig();
    writeSignal('');

    const output = run();
    expect(output).toBe('');

    // Should log empty-signal
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.decision).toBe('empty-signal');
  });

  test('handles whitespace-only signal file', () => {
    writeConfig();
    writeSignal('   \n  ');

    const output = run();
    expect(output).toBe('');
  });

  test('logs continue decision with next command', () => {
    writeConfig();
    writeSignal('/dev:plan 4');

    run();

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('auto-continue');
    expect(entry.decision).toBe('continue');
    expect(entry.next).toBe('/dev:plan 4');
  });

  test('does not crash when .planning dir is missing', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    // No config.json exists since we deleted .planning — script should exit silently
    const output = run();
    expect(output).toBe('');
  });
});
