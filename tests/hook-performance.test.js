const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// CI environments may be slower; 500ms budget applies to production usage.
// Windows CI runners are especially slow (cold Node.js startup, antivirus).
// Tests use a generous threshold to avoid flaky CI failures.
const PERFORMANCE_BUDGET_MS = process.platform === 'win32' ? 1500 : 800;
const PRODUCTION_TARGET_MS = 500;

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');

/**
 * Measure execution time of a hook script.
 *
 * @param {string} scriptPath - Absolute path to the hook script
 * @param {string} cwd - Working directory for the script
 * @param {string} [stdinData=''] - JSON string to pass via stdin
 * @returns {{ exitCode: number, durationMs: number, output: string }}
 */
function measureHookExecution(scriptPath, cwd, stdinData = '') {
  const start = Date.now();
  let output = '';
  let exitCode = 0;
  try {
    output = execSync(`node "${scriptPath}"`, {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      input: stdinData,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    exitCode = err.status || 1;
    output = (err.stdout || '') + (err.stderr || '');
  }
  const durationMs = Date.now() - start;
  return { exitCode, durationMs, output };
}

describe('hook performance (<500ms production target)', () => {
  let tmpDir;
  let planningDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-perf-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('post-write-dispatch.js exits within budget for non-target file', () => {
    const scriptPath = path.join(HOOKS_DIR, 'post-write-dispatch.js');
    const stdinData = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: '' },
    });
    const { durationMs } = measureHookExecution(scriptPath, tmpDir, stdinData);
    expect(durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('pre-write-dispatch.js exits within budget for non-planning file', () => {
    const scriptPath = path.join(HOOKS_DIR, 'pre-write-dispatch.js');
    const stdinData = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: '' },
    });
    const { durationMs } = measureHookExecution(scriptPath, tmpDir, stdinData);
    expect(durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('pre-bash-dispatch.js exits within budget for benign command', () => {
    const scriptPath = path.join(HOOKS_DIR, 'pre-bash-dispatch.js');
    const stdinData = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
    });
    const { durationMs } = measureHookExecution(scriptPath, tmpDir, stdinData);
    expect(durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('context-budget-check.js exits within budget when no STATE.md', () => {
    const scriptPath = path.join(HOOKS_DIR, 'context-budget-check.js');
    const stdinData = JSON.stringify({
      tool_name: 'Compact',
      tool_input: {},
    });
    const { durationMs } = measureHookExecution(scriptPath, tmpDir, stdinData);
    expect(durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('auto-continue.js exits within budget when not enabled', () => {
    const scriptPath = path.join(HOOKS_DIR, 'auto-continue.js');
    // No config.json in tmpDir, so auto-continue exits immediately
    const { durationMs } = measureHookExecution(scriptPath, tmpDir);
    expect(durationMs).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });
});
