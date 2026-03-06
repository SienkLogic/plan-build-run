/**
 * Parity tests for context-bridge.js handleHttp.
 * Confirms HTTP mode (handleHttp) produces equivalent output to command mode (CLI).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'context-bridge.js');
const { handleHttp, loadBridge } = require(SCRIPT);

describe('context-bridge.js handleHttp parity', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cb-http-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Run the script via CLI (command mode) */
  function runCLI(stdinData = {}) {
    const input = JSON.stringify(stdinData);
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /** Run via handleHttp (HTTP mode) */
  function runHTTP(stdinData = {}) {
    const reqBody = { event: 'PostToolUse', tool: 'Write', data: stdinData, planningDir };
    return handleHttp(reqBody, {});
  }

  // --- Null / silent cases ---

  test('HTTP returns null when planningDir does not exist', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const reqBody = { event: 'PostToolUse', tool: 'Write', data: {}, planningDir };
    const result = handleHttp(reqBody, {});
    expect(result).toBeNull();
  });

  test('HTTP returns null for PEAK tier (same as CLI producing empty output)', () => {
    const cliOut = runCLI({ context_percent: 10 });
    const httpOut = runHTTP({ context_percent: 10 });
    expect(cliOut).toBe('');
    expect(httpOut).toBeNull();
  });

  test('HTTP returns null for GOOD tier', () => {
    const cliOut = runCLI({ context_percent: 40 });
    const httpOut = runHTTP({ context_percent: 40 });
    expect(cliOut).toBe('');
    expect(httpOut).toBeNull();
  });

  // --- Warning parity ---

  test('HTTP and CLI both warn for DEGRADING tier', () => {
    const cliOut = runCLI({ context_percent: 55 });
    const cliParsed = JSON.parse(cliOut);

    // Reset bridge so HTTP also starts fresh
    const bridgePath = path.join(planningDir, '.context-budget.json');
    if (fs.existsSync(bridgePath)) fs.unlinkSync(bridgePath);

    const httpOut = runHTTP({ context_percent: 55 });

    expect(cliParsed.additionalContext).toContain('DEGRADING');
    expect(cliParsed.additionalContext).toContain('55%');

    expect(httpOut).not.toBeNull();
    expect(httpOut.additionalContext).toContain('DEGRADING');
    expect(httpOut.additionalContext).toContain('55%');
  });

  test('HTTP and CLI both warn for POOR tier', () => {
    const cliOut = runCLI({ context_percent: 75 });
    const cliParsed = JSON.parse(cliOut);

    const bridgePath = path.join(planningDir, '.context-budget.json');
    if (fs.existsSync(bridgePath)) fs.unlinkSync(bridgePath);

    const httpOut = runHTTP({ context_percent: 75 });

    expect(cliParsed.additionalContext).toContain('POOR');
    expect(httpOut).not.toBeNull();
    expect(httpOut.additionalContext).toContain('POOR');
  });

  test('HTTP and CLI both warn for CRITICAL tier with STOP', () => {
    const cliOut = runCLI({ context_percent: 90 });
    const cliParsed = JSON.parse(cliOut);

    const bridgePath = path.join(planningDir, '.context-budget.json');
    if (fs.existsSync(bridgePath)) fs.unlinkSync(bridgePath);

    const httpOut = runHTTP({ context_percent: 90 });

    expect(cliParsed.additionalContext).toContain('CRITICAL');
    expect(cliParsed.additionalContext).toContain('STOP');

    expect(httpOut).not.toBeNull();
    expect(httpOut.additionalContext).toContain('CRITICAL');
    expect(httpOut.additionalContext).toContain('STOP');
  });

  // --- Debounce parity ---

  test('HTTP suppresses repeated same-tier warnings (debounce)', () => {
    // First call: escalation to DEGRADING — should warn
    const r1 = runHTTP({ context_percent: 55 });
    expect(r1).not.toBeNull();
    expect(r1.additionalContext).toContain('DEGRADING');

    // Calls 2-5: same tier — should be suppressed
    for (let i = 0; i < 4; i++) {
      const r = runHTTP({ context_percent: 56 + i });
      expect(r).toBeNull();
    }

    // Call 6: debounce interval reached — should warn again
    const r6 = runHTTP({ context_percent: 60 });
    expect(r6).not.toBeNull();
    expect(r6.additionalContext).toContain('DEGRADING');
  });

  test('HTTP bypasses debounce on tier escalation', () => {
    // Escalate to DEGRADING
    const r1 = runHTTP({ context_percent: 55 });
    expect(r1).not.toBeNull();

    // Immediately escalate to POOR — debounce should be bypassed
    const r2 = runHTTP({ context_percent: 75 });
    expect(r2).not.toBeNull();
    expect(r2.additionalContext).toContain('POOR');
  });

  // --- Bridge file is updated in HTTP mode ---

  test('HTTP updates bridge file after call', () => {
    runHTTP({ context_percent: 40 });
    const bridgePath = path.join(planningDir, '.context-budget.json');
    expect(fs.existsSync(bridgePath)).toBe(true);
    const bridge = loadBridge(bridgePath);
    expect(bridge.tool_calls).toBe(1);
    expect(bridge.estimated_percent).toBe(40);
  });

  test('HTTP increments tool_calls across multiple calls', () => {
    runHTTP({});
    runHTTP({});
    runHTTP({});
    const bridgePath = path.join(planningDir, '.context-budget.json');
    const bridge = loadBridge(bridgePath);
    expect(bridge.tool_calls).toBe(3);
  });

  // --- handleHttp does not call process.exit ---

  test('handleHttp does not call process.exit', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    try {
      runHTTP({ context_percent: 90 });
      // No error = process.exit was not called
    } finally {
      exitSpy.mockRestore();
    }
  });

  // --- handleHttp return shape ---

  test('handleHttp returns object with additionalContext string when warning fires', () => {
    const result = runHTTP({ context_percent: 55 });
    expect(result).toHaveProperty('additionalContext');
    expect(typeof result.additionalContext).toBe('string');
  });

  test('handleHttp returns null (not undefined) when no warning', () => {
    const result = runHTTP({ context_percent: 10 });
    expect(result).toBeNull();
  });

  // --- heuristic fallback ---

  test('HTTP uses heuristic estimation when no context_percent provided', () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    // 480000 chars / 800000 = 60% → DEGRADING
    fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 480000, reads: 50, files: [] }));

    const result = runHTTP({});
    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('DEGRADING');
    expect(result.additionalContext).toContain('heuristic');
  });
});
