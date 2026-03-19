const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getLogFilename } = require('../hooks/hook-logger');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'auto-continue.js');

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

  test('exits silently when config.json exists but features key is missing entirely', () => {
    // Write config with no features key at all — REQ-F-019 edge case
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' })
    );
    const output = run();
    expect(output).toBe('');
  });

  test('exits silently when config.json is malformed JSON', () => {
    // Write invalid JSON — configLoad should return null, script exits gracefully
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{bad json');
    const output = run();
    expect(output).toBe('');
  });

  test('exits with no-signal log when no .auto-next file', () => {
    writeConfig();
    const output = run();
    expect(output).toBe('');

    // Check hook log
    const logPath = path.join(planningDir, 'logs', getLogFilename());
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('auto-continue');
    expect(entry.decision).toBe('no-signal');
  });

  test('reads signal file and outputs block decision with next command', () => {
    writeConfig();
    writeSignal('/pbr:execute-phase 3');

    const output = run();
    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('/pbr:execute-phase 3');
  });

  test('exits silently when stop_hook_active is true (prevents infinite loops)', () => {
    writeConfig();
    writeSignal('/pbr:execute-phase 3');

    const output = run(JSON.stringify({ stop_hook_active: true }));
    expect(output).toBe('');

    // Signal file should NOT be consumed
    const signalPath = path.join(planningDir, '.auto-next');
    expect(fs.existsSync(signalPath)).toBe(true);
  });

  test('deletes signal file after reading (one-shot)', () => {
    writeConfig();
    writeSignal('/pbr:verify-work 2');

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
    const logPath = path.join(planningDir, 'logs', getLogFilename());
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
    writeSignal('/pbr:plan-phase 4');

    run();

    const logPath = path.join(planningDir, 'logs', getLogFilename());
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('auto-continue');
    expect(entry.decision).toBe('continue');
    expect(entry.next).toBe('/pbr:plan-phase 4');
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
      writeSignal('/pbr:execute-phase 1');
      run();
      const countPath = path.join(planningDir, '.continue-count');
      expect(fs.readFileSync(countPath, 'utf8').trim()).toBe('1');

      // Second continue
      writeSignal('/pbr:execute-phase 2');
      run();
      expect(fs.readFileSync(countPath, 'utf8').trim()).toBe('2');
    });

    test('advisory warning appears after 3 continues', () => {
      writeConfig();
      const countPath = path.join(planningDir, '.continue-count');
      // Set count to 3 so next increment = 4 (> 3)
      fs.writeFileSync(countPath, '3');
      writeSignal('/pbr:execute-phase 4');
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
      writeSignal('/pbr:execute-phase 3');
      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).not.toContain('Advisory');
    });

    test('hard stop (no block output) after 6 continues', () => {
      writeConfig();
      const countPath = path.join(planningDir, '.continue-count');
      fs.writeFileSync(countPath, '6');
      writeSignal('/pbr:execute-phase 7');
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

  describe('session phase-limit cycling', () => {
    function writeTracker(data) {
      fs.writeFileSync(path.join(planningDir, '.session-tracker'), JSON.stringify(data));
    }

    function runWithEnv(stdinData = '', envOverrides = {}) {
      return execSync(`node "${SCRIPT}"`, {
        cwd: tmpDir,
        encoding: 'utf8',
        timeout: 5000,
        input: stdinData,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...envOverrides },
      });
    }

    test('triggers cycle when phases_completed >= session_phase_limit', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 3 });
      writeTracker({ phases_completed: 3, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:pause-work');

      // Signal file should exist with /pbr:pause-work content
      const signalPath = path.join(planningDir, '.auto-next');
      expect(fs.existsSync(signalPath)).toBe(true);
      expect(fs.readFileSync(signalPath, 'utf8')).toBe('/pbr:pause-work');
    });

    test('no cycle when session_phase_limit is 0 (disabled)', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 0 });
      writeTracker({ phases_completed: 10, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      expect(output).toBe('');
    });

    test('no cycle when phases_completed < limit', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 3 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      expect(output).toBe('');
    });

    test('no cycle when tracker file missing', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 3 });
      // Do NOT write .session-tracker

      const output = run();
      expect(output).toBe('');
    });

    test('uses default limit of 3 when session_phase_limit not in config', () => {
      writeConfig({ features: { auto_continue: true } });
      writeTracker({ phases_completed: 3, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:pause-work');
    });

    test('TMUX branch logs cycle-tmux', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = runWithEnv('', { TMUX: '/tmp/tmux-1000/default,12345,0' });
      const parsed = JSON.parse(output);
      expect(parsed.reason).toContain('TMUX auto-cycle');

      // Check hook log for cycle-tmux decision
      const logPath = path.join(planningDir, 'logs', getLogFilename());
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'cycle-tmux');
      expect(entry).toBeDefined();
    });

    test('session_cycling tmux config overrides env detection', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2, session_cycling: 'tmux' });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      // No TMUX env var, but config says tmux
      const env = { ...process.env, TMUX: '' };
      delete env.TMUX;
      const output = runWithEnv('', env);
      const parsed = JSON.parse(output);
      expect(parsed.reason).toContain('TMUX auto-cycle');
    });

    test('non-TMUX defaults to compact cycling mode', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      // Explicitly unset TMUX
      const env = { ...process.env, TMUX: '' };
      delete env.TMUX;
      const output = runWithEnv('', env);
      const parsed = JSON.parse(output);
      expect(parsed.reason).toContain('/compact');
      expect(parsed.reason).toContain('/pbr:pause-work');
      expect(parsed.reason).toContain('/pbr:resume-work');

      // Check hook log for cycle-compact decision
      const logPath = path.join(planningDir, 'logs', getLogFilename());
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'cycle-compact');
      expect(entry).toBeDefined();
    });

    test('session_cycling manual shows checkpoint banner', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2, session_cycling: 'manual' });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const env = { ...process.env, TMUX: '' };
      delete env.TMUX;
      const output = runWithEnv('', env);
      const parsed = JSON.parse(output);
      expect(parsed.reason).toContain('SESSION CHECKPOINT');

      const logPath = path.join(planningDir, 'logs', getLogFilename());
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'cycle-banner');
      expect(entry).toBeDefined();
    });

    test('stop_hook_active prevents cycling even when limit reached', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2 });
      writeTracker({ phases_completed: 5, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run(JSON.stringify({ stop_hook_active: true }));
      expect(output).toBe('');
    });

    test('normal auto-continue works when under limit', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 5 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });
      writeSignal('/pbr:execute-phase 3');

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:execute-phase 3');
      // Should NOT contain cycle-related text
      expect(parsed.reason).not.toContain('SESSION CHECKPOINT');
      expect(parsed.reason).not.toContain('TMUX auto-cycle');
    });
  });

  describe('phase boundary clear enforcement', () => {
    function writeBoundarySignal(phaseNum) {
      fs.writeFileSync(path.join(planningDir, '.phase-boundary-pending'), String(phaseNum));
    }

    test('blocks auto-continue when enforce mode and .phase-boundary-pending exists', () => {
      writeConfig({
        features: { auto_continue: true },
        workflow: { phase_boundary_clear: 'enforce' },
      });
      writeBoundarySignal(3);
      writeSignal('/pbr:plan-phase 4');

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('Phase boundary clear is enforced');
      expect(parsed.reason).toContain('/clear');

      // .phase-boundary-pending should be deleted (one-shot)
      expect(fs.existsSync(path.join(planningDir, '.phase-boundary-pending'))).toBe(false);
      // .auto-next should also be deleted (enforce overrides auto-continue)
      expect(fs.existsSync(path.join(planningDir, '.auto-next'))).toBe(false);
    });

    test('logs phase-boundary-enforce in hook log', () => {
      writeConfig({
        features: { auto_continue: true },
        workflow: { phase_boundary_clear: 'enforce' },
      });
      writeBoundarySignal(2);

      run();

      const logPath = path.join(planningDir, 'logs', getLogFilename());
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'phase-boundary-enforce');
      expect(entry).toBeDefined();
    });

    test('recommend mode cleans up signal file but does not block', () => {
      writeConfig({
        features: { auto_continue: true },
        workflow: { phase_boundary_clear: 'recommend' },
      });
      writeBoundarySignal(3);
      writeSignal('/pbr:plan-phase 4');

      const output = run();
      const parsed = JSON.parse(output);
      // Should proceed with normal auto-continue (not block for phase boundary)
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:plan-phase 4');
      expect(parsed.reason).not.toContain('Phase boundary clear is enforced');

      // Signal file should be cleaned up
      expect(fs.existsSync(path.join(planningDir, '.phase-boundary-pending'))).toBe(false);

      // Hook log should show phase-boundary-recommend
      const logPath = path.join(planningDir, 'logs', getLogFilename());
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entry = lines.map(l => JSON.parse(l)).find(e => e.decision === 'phase-boundary-recommend');
      expect(entry).toBeDefined();
    });

    test('off mode cleans up stale signal file', () => {
      writeConfig({
        features: { auto_continue: true },
        workflow: { phase_boundary_clear: 'off' },
      });
      writeBoundarySignal(3);
      writeSignal('/pbr:plan-phase 4');

      const output = run();
      const parsed = JSON.parse(output);
      // Should proceed normally
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:plan-phase 4');

      // Signal file should be cleaned up
      expect(fs.existsSync(path.join(planningDir, '.phase-boundary-pending'))).toBe(false);
    });

    test('no behavior change when no .phase-boundary-pending file exists', () => {
      writeConfig({
        features: { auto_continue: true },
        workflow: { phase_boundary_clear: 'enforce' },
      });
      writeSignal('/pbr:plan-phase 4');

      const output = run();
      const parsed = JSON.parse(output);
      // Normal auto-continue — no boundary file means no enforcement
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:plan-phase 4');
    });

    test('missing workflow config defaults to off (backward compat)', () => {
      writeConfig({
        features: { auto_continue: true },
      });
      writeBoundarySignal(3);
      writeSignal('/pbr:plan-phase 4');

      const output = run();
      const parsed = JSON.parse(output);
      // Should proceed normally — default is 'off'
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:plan-phase 4');

      // Signal file should be cleaned up
      expect(fs.existsSync(path.join(planningDir, '.phase-boundary-pending'))).toBe(false);
    });
  });

  describe('config flag migration (_auto_chain_active)', () => {
    test('reads next command from workflow._auto_chain_active config flag', () => {
      const config = {
        features: { auto_continue: true },
        workflow: { _auto_chain_active: '/pbr:execute-phase 5' },
      };
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
      // Do NOT create .auto-next signal file

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:execute-phase 5');
    });

    test('clears _auto_chain_active flag after reading', () => {
      const config = {
        features: { auto_continue: true },
        workflow: { _auto_chain_active: '/pbr:build-phase 3' },
      };
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));

      run();

      // Re-read config and verify flag is cleared
      const updated = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
      expect(updated.workflow._auto_chain_active).toBeFalsy();
    });

    test('backward compat: reads .auto-next signal file when config flag absent', () => {
      writeConfig();
      writeSignal('/pbr:execute-phase 3');

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:execute-phase 3');
    });

    test('config flag takes priority over .auto-next signal file', () => {
      const config = {
        features: { auto_continue: true },
        workflow: { _auto_chain_active: '/pbr:build-phase 7' },
      };
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
      // Also create .auto-next (should be ignored in favor of config flag)
      writeSignal('/pbr:execute-phase 1');

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:build-phase 7');
    });
  });

  describe('signal file creation', () => {
    function writeTracker(data) {
      fs.writeFileSync(path.join(planningDir, '.session-tracker'), JSON.stringify(data));
    }

    test('.auto-next file is written with correct command when phase limit triggers', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      run();

      const signalPath = path.join(planningDir, '.auto-next');
      expect(fs.existsSync(signalPath)).toBe(true);
      expect(fs.readFileSync(signalPath, 'utf8')).toBe('/pbr:pause-work');
    });

    test('.auto-next file is NOT written when stop_hook_active is set', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      run(JSON.stringify({ stop_hook_active: true }));

      const signalPath = path.join(planningDir, '.auto-next');
      expect(fs.existsSync(signalPath)).toBe(false);
    });

    test('.auto-next file is NOT written when auto_continue is disabled', () => {
      writeConfig({ features: { auto_continue: false }, session_phase_limit: 2 });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      run();

      const signalPath = path.join(planningDir, '.auto-next');
      expect(fs.existsSync(signalPath)).toBe(false);
    });
  });

  describe('session cycling edge cases', () => {
    function writeTracker(data) {
      fs.writeFileSync(path.join(planningDir, '.session-tracker'), JSON.stringify(data));
    }

    function runWithEnv(stdinData = '', envOverrides = {}) {
      return execSync(`node "${SCRIPT}"`, {
        cwd: tmpDir,
        encoding: 'utf8',
        timeout: 5000,
        input: stdinData,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...envOverrides },
      });
    }

    test('compact-first cycling suggests /compact before session end', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 2, session_cycling: 'compact-first' });
      writeTracker({ phases_completed: 2, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const env = { ...process.env, TMUX: '' };
      delete env.TMUX;
      const output = runWithEnv('', env);
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('COMPACT-FIRST');
      expect(parsed.reason).toContain('/compact');
      expect(parsed.reason).toContain('/pbr:pause-work');
    });

    test('session_phase_limit = 0 does not trigger cycling', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 0 });
      writeTracker({ phases_completed: 100, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      // Should exit silently — no cycling, no signal file
      expect(output).toBe('');
    });

    test('session_phase_limit = 1 triggers cycling after first phase', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 1 });
      writeTracker({ phases_completed: 1, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:pause-work');
    });

    test('default phase limit scales with context_window_tokens (1M = 8)', () => {
      writeConfig({ features: { auto_continue: true }, context_window_tokens: 1000000 });
      // phases_completed = 7 (under 8 limit for 1M)
      writeTracker({ phases_completed: 7, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      // Should NOT trigger cycling — under limit
      expect(output).toBe('');
    });

    test('default phase limit at 500k is 6', () => {
      writeConfig({ features: { auto_continue: true }, context_window_tokens: 500000 });
      writeTracker({ phases_completed: 6, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() });

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.decision).toBe('block');
      expect(parsed.reason).toContain('/pbr:pause-work');
    });
  });

  describe('config fallback paths', () => {
    test('exits silently when config.json is missing (no features)', () => {
      // No config.json at all
      const output = run();
      expect(output).toBe('');
    });

    test('exits silently when config.json has invalid JSON', () => {
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{{not valid json}}');
      const output = run();
      expect(output).toBe('');
    });

    test('exits silently when features.auto_continue is explicitly false', () => {
      writeConfig({ features: { auto_continue: false } });
      writeSignal('/pbr:execute-phase 3');

      const output = run();
      expect(output).toBe('');
      // Signal file should NOT be consumed
      expect(fs.existsSync(path.join(planningDir, '.auto-next'))).toBe(true);
    });

    test('exits silently when features object is empty', () => {
      writeConfig({ features: {} });
      writeSignal('/pbr:execute-phase 3');

      const output = run();
      expect(output).toBe('');
    });
  });

  describe('output format', () => {
    test('Stop hook output uses { decision: "block", reason: string } format', () => {
      writeConfig();
      writeSignal('/pbr:execute-phase 3');

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('decision', 'block');
      expect(parsed).toHaveProperty('reason');
      expect(typeof parsed.reason).toBe('string');
    });

    test('reason string contains the next command to execute', () => {
      writeConfig();
      writeSignal('/pbr:verify-work 5');

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed.reason).toContain('/pbr:verify-work 5');
    });

    test('output is empty when no auto-continue action needed', () => {
      writeConfig();
      // No signal file, no config flag
      const output = run();
      expect(output).toBe('');
    });

    test('phase-limit cycling output uses { decision: "block", reason: string } format', () => {
      writeConfig({ features: { auto_continue: true }, session_phase_limit: 1 });
      fs.writeFileSync(path.join(planningDir, '.session-tracker'),
        JSON.stringify({ phases_completed: 1, session_start: new Date().toISOString(), last_phase_completed: new Date().toISOString() }));

      const output = run();
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('decision', 'block');
      expect(parsed).toHaveProperty('reason');
      expect(typeof parsed.reason).toBe('string');
    });
  });

  describe('session-cleanup config flag clearing', () => {
    test('session-cleanup clears stale _auto_chain_active flag', () => {
      const config = {
        features: { auto_continue: true },
        workflow: { _auto_chain_active: '/pbr:stale-command' },
      };
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config));
      fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });

      // Run session-cleanup
      const cleanupScript = path.join(__dirname, '..', 'hooks', 'session-cleanup.js');
      try {
        execSync(`node "${cleanupScript}"`, {
          cwd: tmpDir,
          encoding: 'utf8',
          timeout: 5000,
          input: JSON.stringify({ reason: 'test' }),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (_e) { /* may exit non-zero */ }

      const updated = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
      expect(updated.workflow._auto_chain_active).toBeFalsy();
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
      const logPath = path.join(planningDir, 'logs', getLogFilename());
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

      const logPath = path.join(planningDir, 'logs', getLogFilename());
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

      const logPath = path.join(planningDir, 'logs', getLogFilename());
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      const entries = lines.map(l => JSON.parse(l));
      const pendingEntry = entries.find(e => e.decision === 'pending-todos');
      expect(pendingEntry).toBeUndefined();
    });
  });
});
