/**
 * Hook spawn integration tests.
 *
 * Tests hook scripts by spawning them as child processes with
 * simulated stdin JSON, then verifying exit codes and stdout output.
 * This catches issues that unit tests miss: stdin/stdout piping,
 * exit code semantics, and JSON output format.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPTS_DIR = path.resolve(__dirname, '..', 'plugins', 'dev', 'scripts');

/**
 * Spawn a hook script with stdin data and capture results.
 * @param {string} scriptName - Script filename (e.g., 'validate-commit.js')
 * @param {object|string} stdinData - Data to pipe as stdin (object will be JSON.stringified)
 * @param {object} opts - Options: { cwd, args, timeout }
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
function spawnHook(scriptName, stdinData, opts = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const args = opts.args ? [scriptPath, ...opts.args] : [scriptPath];
    const child = spawn(process.execPath, args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts.timeout || 10000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('close', (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ exitCode: -1, stdout, stderr: err.message });
    });

    // Write stdin and close
    const input = typeof stdinData === 'string' ? stdinData : JSON.stringify(stdinData);
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * Create a temporary directory with minimal .planning/ structure.
 */
function createTmpProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-spawn-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\nversion: 2\ncurrent_phase: 1\ntotal_phases: 3\nstatus: "building"\nprogress_percent: 10\n---\n# Project State\nPhase: 1 of 3\nStatus: building\n');
  return tmpDir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* ok */ }
}

// ─────────────────────────────────────────────────
// validate-commit.js
// ─────────────────────────────────────────────────
describe('validate-commit.js (spawn)', () => {
  test('exits 0 for valid commit format', async () => {
    const result = await spawnHook('validate-commit.js', {
      tool_input: { command: 'git commit -m "feat(01-01): add user auth"' }
    });
    expect(result.exitCode).toBe(0);
  });

  test('exits 2 for invalid commit format', async () => {
    const result = await spawnHook('validate-commit.js', {
      tool_input: { command: 'git commit -m "bad commit message"' }
    });
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('Invalid commit message format');
  });

  test('exits 2 for AI co-author line', async () => {
    const result = await spawnHook('validate-commit.js', {
      tool_input: { command: 'git commit -m "feat(01-01): add auth\n\nCo-Authored-By: Claude <noreply@anthropic.com>"' }
    });
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('AI co-author');
  });

  test('exits 0 for non-commit bash commands', async () => {
    const result = await spawnHook('validate-commit.js', {
      tool_input: { command: 'npm test' }
    });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for merge commits', async () => {
    const result = await spawnHook('validate-commit.js', {
      tool_input: { command: 'git commit -m "Merge branch \'feature\' into main"' }
    });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for docs(planning) commits', async () => {
    const result = await spawnHook('validate-commit.js', {
      tool_input: { command: 'git commit -m "docs(planning): update roadmap"' }
    });
    expect(result.exitCode).toBe(0);
  });
});

// ─────────────────────────────────────────────────
// check-dangerous-commands.js
// ─────────────────────────────────────────────────
describe('check-dangerous-commands.js (spawn)', () => {
  test('exits 0 for safe commands', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: 'npm test' }
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  test('exits 2 for rm -rf .planning', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: 'rm -rf .planning' }
    });
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('.planning');
  });

  test('exits 2 for git reset --hard', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: 'git reset --hard HEAD~3' }
    });
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
  });

  test('exits 2 for git push --force main', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: 'git push --force origin main' }
    });
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
  });

  test('exits 2 for git clean -fd', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: 'git clean -fd' }
    });
    expect(result.exitCode).toBe(2);
  });

  test('exits 0 with warning for git checkout -- .', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: 'git checkout -- . ' }
    });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.additionalContext).toContain('Warning');
  });

  test('exits 0 for empty command', async () => {
    const result = await spawnHook('check-dangerous-commands.js', {
      tool_input: { command: '' }
    });
    expect(result.exitCode).toBe(0);
  });
});

// ─────────────────────────────────────────────────
// log-tool-failure.js
// ─────────────────────────────────────────────────
describe('log-tool-failure.js (spawn)', () => {
  let tmpDir;

  beforeAll(() => { tmpDir = createTmpProject(); });
  afterAll(() => { cleanup(tmpDir); });

  test('exits 0 and outputs recovery hints', async () => {
    const result = await spawnHook('log-tool-failure.js', {
      tool_name: 'Bash',
      error: 'Command failed with exit code 1',
      tool_input: { command: 'npm test' }
    }, { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Output wraps additionalContext in hookSpecificOutput
    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput.additionalContext).toBeDefined();
    }
  });

  test('exits 0 for unknown tool failure', async () => {
    const result = await spawnHook('log-tool-failure.js', {
      tool_name: 'UnknownTool',
      error: 'something went wrong'
    }, { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });
});

// ─────────────────────────────────────────────────
// suggest-compact.js
// ─────────────────────────────────────────────────
describe('suggest-compact.js (spawn)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('exits 0 with no output below threshold', async () => {
    const result = await spawnHook('suggest-compact.js', {
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.js' }
    }, { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Below threshold — no additionalContext
    expect(result.stdout).toBe('');
  });

  test('increments counter file on each call', async () => {
    await spawnHook('suggest-compact.js', {
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.js' }
    }, { cwd: tmpDir });
    await spawnHook('suggest-compact.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/test.js' }
    }, { cwd: tmpDir });

    const counterPath = path.join(tmpDir, '.planning', '.compact-counter');
    expect(fs.existsSync(counterPath)).toBe(true);
    const counter = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
    expect(counter.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────
// context-budget-check.js
// ─────────────────────────────────────────────────
describe('context-budget-check.js (spawn)', () => {
  let tmpDir;

  beforeAll(() => { tmpDir = createTmpProject(); });
  afterAll(() => { cleanup(tmpDir); });

  test('exits 0 and preserves state', async () => {
    const result = await spawnHook('context-budget-check.js', '', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Should have updated STATE.md with Session Continuity section
    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf8');
    expect(state).toContain('Session Continuity');
  });

  test('exits 0 when no STATE.md exists', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-empty-'));
    const result = await spawnHook('context-budget-check.js', '', { cwd: emptyDir });
    expect(result.exitCode).toBe(0);
    cleanup(emptyDir);
  });
});

// ─────────────────────────────────────────────────
// auto-continue.js
// ─────────────────────────────────────────────────
describe('auto-continue.js (spawn)', () => {
  test('exits 0 when no .planning directory', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-ac-'));
    const result = await spawnHook('auto-continue.js', '', { cwd: emptyDir });
    expect(result.exitCode).toBe(0);
    cleanup(emptyDir);
  });

  test('exits 0 when .planning exists but no active operation', async () => {
    const tmpDir = createTmpProject();
    const result = await spawnHook('auto-continue.js', '', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    cleanup(tmpDir);
  });
});

// ─────────────────────────────────────────────────
// log-subagent.js
// ─────────────────────────────────────────────────
describe('log-subagent.js (spawn)', () => {
  let tmpDir;

  beforeAll(() => { tmpDir = createTmpProject(); });
  afterAll(() => { cleanup(tmpDir); });

  test('start: exits 0 and may output additionalContext', async () => {
    const result = await spawnHook('log-subagent.js', {
      subagent_type: 'dev:towline-executor',
      description: 'Test execution'
    }, { cwd: tmpDir, args: ['start'] });
    expect(result.exitCode).toBe(0);
  });

  test('stop: exits 0', async () => {
    const result = await spawnHook('log-subagent.js', {
      subagent_type: 'dev:towline-executor'
    }, { cwd: tmpDir, args: ['stop'] });
    expect(result.exitCode).toBe(0);
  });
});

// ─────────────────────────────────────────────────
// session-cleanup.js
// ─────────────────────────────────────────────────
describe('session-cleanup.js (spawn)', () => {
  test('exits 0 when no .planning directory', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-sc-'));
    const result = await spawnHook('session-cleanup.js', '', { cwd: emptyDir });
    expect(result.exitCode).toBe(0);
    cleanup(emptyDir);
  });

  test('exits 0 and cleans up session files', async () => {
    const tmpDir = createTmpProject();
    // Create session artifacts that session-cleanup.js removes
    fs.writeFileSync(path.join(tmpDir, '.planning', '.active-operation'), 'test-op');
    fs.writeFileSync(path.join(tmpDir, '.planning', '.active-skill'), 'test-skill');
    fs.writeFileSync(path.join(tmpDir, '.planning', '.auto-next'), '/dev:build');

    const result = await spawnHook('session-cleanup.js', '', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);

    // Session files should be cleaned up
    expect(fs.existsSync(path.join(tmpDir, '.planning', '.active-operation'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.planning', '.active-skill'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.planning', '.auto-next'))).toBe(false);
    cleanup(tmpDir);
  });
});

// ─────────────────────────────────────────────────
// Edge cases: all scripts
// ─────────────────────────────────────────────────
describe('edge cases (spawn)', () => {
  const stdinScripts = [
    'validate-commit.js',
    'check-dangerous-commands.js',
    'suggest-compact.js'
  ];

  test.each(stdinScripts)('%s exits 0 on empty stdin', async (script) => {
    const result = await spawnHook(script, '');
    expect(result.exitCode).toBe(0);
  });

  test.each(stdinScripts)('%s exits 0 on malformed JSON', async (script) => {
    const result = await spawnHook(script, '{not valid json!!!');
    expect(result.exitCode).toBe(0);
  });

  test.each(stdinScripts)('%s exits 0 on empty object', async (script) => {
    const result = await spawnHook(script, {});
    expect(result.exitCode).toBe(0);
  });
});
