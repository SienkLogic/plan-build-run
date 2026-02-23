const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'auto-continue.js');

describe('auto-continue.js', () => {
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
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 5000,
      input: stdinData,
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

  test('reads signal file and outputs block decision with next command', () => {
    writeConfig();
    writeSignal('/pbr:build 3');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('/pbr:build 3');
  });

  test('exits silently when stop_hook_active is true (prevents infinite loops)', () => {
    writeConfig();
    writeSignal('/pbr:build 3');

    const output = run(JSON.stringify({ stop_hook_active: true }));
    expect(output).toBe('');

    // Signal file should NOT be consumed
    const signalPath = path.join(planningDir, '.auto-next');
    expect(fs.existsSync(signalPath)).toBe(true);
  });

  test('deletes signal file after reading (one-shot)', () => {
    writeConfig();
    writeSignal('/pbr:review 2');

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
    writeSignal('/pbr:plan 4');

    run();

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('auto-continue');
    expect(entry.decision).toBe('continue');
    expect(entry.next).toBe('/pbr:plan 4');
  });

  test('does not crash when .planning dir is missing', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    // No config.json exists since we deleted .planning — script should exit silently
    const output = run();
    expect(output).toBe('');
  });

  describe('session length guard', () => {
    test('increments continue count on each continue', () => {
      writeConfig();
      writeSignal('/pbr:build 1');
      run();
      const countPath = path.join(planningDir, '.continue-count');
      expect(fs.readFileSync(countPath, 'utf8').trim()).toBe('1');

      // Second continue
      writeSignal('/pbr:build 2');
      run();
      expect(fs.readFileSync(countPath, 'utf8').trim()).toBe('2');
    });

    test('advisory warning appears after 3 continues', () => {
      writeConfig();
      const countPath = path.join(planningDir, '.continue-count');
      // Set count to 3 so next increment = 4 (> 3)
      fs.writeFileSync(countPath, '3');
      writeSignal('/pbr:build 4');
      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('Advisory');
      expect(parsed.reason).toContain('4 consecutive continues');
    });

    test('no advisory at exactly 3 continues', () => {
      writeConfig();
      const countPath = path.join(planningDir, '.continue-count');
      fs.writeFileSync(countPath, '2');
      writeSignal('/pbr:build 3');
      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).not.toContain('Advisory');
    });

    test('hard stop (no block output) after 6 continues', () => {
      writeConfig();
      const countPath = path.join(planningDir, '.continue-count');
      fs.writeFileSync(countPath, '6');
      writeSignal('/pbr:build 7');
      const output = run();
      // Should NOT output block decision — just exit silently
      expect(output).toBe('');
      // Count should be 7
      expect(fs.readFileSync(countPath, 'utf8').trim()).toBe('7');
    });

    test('count resets when no signal file present', () => {
      writeConfig();
      const countPath = path.join(planningDir, '.continue-count');
      fs.writeFileSync(countPath, '5');
      // No signal file — normal stop
      run();
      expect(fs.existsSync(countPath)).toBe(false);
    });
  });

  describe('pending todos reminder', () => {
    test('pending todos reminder fires when .auto-next absent but pending/ has items', () => {
      writeConfig();
      // Create .planning/todos/pending/ with a pending todo file
      const pendingDir = path.join(planningDir, 'todos', 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, 'fix-header.md'), '---\ntitle: Fix header\n---\n');

      // .auto-next must NOT exist
      const signalPath = path.join(planningDir, '.auto-next');
      expect(fs.existsSync(signalPath)).toBe(false);

      // Run the script — reminder is logged to hooks.jsonl
      try {
        execSync(`node "${SCRIPT}"`, {
          cwd: tmpDir,
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) { /* ignore exit code */ }
      // Read hook log to verify pending-todos was logged
      const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const pendingEntry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'pending-todos');
      expect(pendingEntry).toBeDefined();
      expect(pendingEntry.count).toBe(1);
    });

    test('no pending todos reminder when pending/ dir is empty', () => {
      writeConfig();
      // Create empty pending/ dir
      const pendingDir = path.join(planningDir, 'todos', 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });

      run();

      const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entries = lines.map(l => JSON.parse(l));
      // Should not have a pending-todos entry
      const pendingEntry = entries.find(e => e.decision === 'pending-todos');
      expect(pendingEntry).toBeUndefined();
    });

    test('no pending todos reminder when pending/ dir does not exist', () => {
      writeConfig();
      // Do NOT create todos/pending/ dir

      run();

      const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entries = lines.map(l => JSON.parse(l));
      const pendingEntry = entries.find(e => e.decision === 'pending-todos');
      expect(pendingEntry).toBeUndefined();
    });
  });
});
