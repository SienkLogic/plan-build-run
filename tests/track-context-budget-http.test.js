/**
 * Parity tests for track-context-budget.js handleHttp.
 * Confirms HTTP mode (handleHttp) produces equivalent output to command mode (CLI).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'track-context-budget.js');
const { handleHttp, processEvent } = require(SCRIPT);

describe('track-context-budget.js handleHttp parity', () => {
  let tmpDir;
  let planningDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-tcb-http-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Run the script via CLI (command mode) and return parsed output or '' */
  function runCLI(toolInput = {}, toolOutput = '', env = {}) {
    const input = JSON.stringify({ tool_input: toolInput, tool_output: toolOutput });
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      input,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
  }

  /** Run via handleHttp (HTTP mode) */
  function runHTTP(toolInput = {}, toolOutput = '') {
    const data = { tool_input: toolInput, tool_output: toolOutput };
    const reqBody = { event: 'PostToolUse', tool: 'Read', data, planningDir };
    return handleHttp(reqBody, {});
  }

  function readTracker() {
    const trackerPath = path.join(planningDir, '.context-tracker');
    if (!fs.existsSync(trackerPath)) return null;
    return JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  }

  // --- Null / silent cases ---

  test('HTTP returns null when no file_path (parity: CLI returns empty string)', async () => {
    const cliOut = runCLI({});
    const httpOut = runHTTP({});
    expect(cliOut).toBe('');
    expect(httpOut).toBeNull();
  });

  test('HTTP returns null when planningDir missing', async () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const reqBody = { event: 'PostToolUse', tool: 'Read', data: { tool_input: { file_path: '/a.js' } }, planningDir };
    const result = handleHttp(reqBody, {});
    expect(result).toBeNull();
  });

  test('HTTP returns null for small read below all thresholds', async () => {
    const cliOut = runCLI({ file_path: '/small.js' }, 'tiny');
    const httpOut = runHTTP({ file_path: '/small.js' }, 'tiny');
    expect(cliOut).toBe('');
    expect(httpOut).toBeNull();
  });

  // --- Tracker state is updated in HTTP mode ---

  test('HTTP updates tracker file on first read', async () => {
    runHTTP({ file_path: '/a.js' }, 'hello world');
    const tracker = readTracker();
    expect(tracker).not.toBeNull();
    expect(tracker.reads).toBe(1);
    expect(tracker.files).toContain('/a.js');
  });

  test('HTTP accumulates reads across multiple calls', async () => {
    runHTTP({ file_path: '/a.js' }, 'aaa');
    runHTTP({ file_path: '/b.js' }, 'bbb');
    runHTTP({ file_path: '/c.js' }, 'ccc');
    const tracker = readTracker();
    expect(tracker.reads).toBe(3);
    expect(tracker.files).toHaveLength(3);
  });

  // --- Warning parity ---

  test('HTTP and CLI both warn on unique-file milestone (10 files)', async () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    const files = Array.from({ length: 9 }, (_, i) => `/file${i}.js`);
    const seedState = { skill: '', reads: 9, total_chars: 1000, files };

    // CLI run
    fs.writeFileSync(trackerPath, JSON.stringify(seedState));
    const cliOut = runCLI({ file_path: '/file9.js' }, 'content');
    const cliParsed = JSON.parse(cliOut);

    // HTTP run (re-seed)
    fs.writeFileSync(trackerPath, JSON.stringify(seedState));
    const httpOut = runHTTP({ file_path: '/file9.js' }, 'content');

    expect(cliParsed.additionalContext).toContain('Context Budget Warning');
    expect(cliParsed.additionalContext).toContain('10 unique files read');

    expect(httpOut).not.toBeNull();
    expect(httpOut.additionalContext).toContain('Context Budget Warning');
    expect(httpOut.additionalContext).toContain('10 unique files read');
  });

  test('HTTP and CLI both warn on char milestone (50k chars)', async () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    const seedState = { skill: '', reads: 5, total_chars: 49500, files: ['/a.js'] };
    const bigContent = 'x'.repeat(600);

    // CLI
    fs.writeFileSync(trackerPath, JSON.stringify(seedState));
    const cliOut = runCLI({ file_path: '/big.js' }, bigContent);
    const cliParsed = JSON.parse(cliOut);

    // HTTP (re-seed)
    fs.writeFileSync(trackerPath, JSON.stringify(seedState));
    const httpOut = runHTTP({ file_path: '/big.js' }, bigContent);

    expect(cliParsed.additionalContext).toContain('chars read');
    expect(httpOut).not.toBeNull();
    expect(httpOut.additionalContext).toContain('chars read');
  });

  test('HTTP and CLI both warn for large single-file read (>5k chars)', async () => {
    const largeContent = 'x'.repeat(6000);

    const cliOut = runCLI({ file_path: '/huge.js' }, largeContent);
    const cliParsed = JSON.parse(cliOut);

    const httpOut = runHTTP({ file_path: '/huge.js' }, largeContent);

    expect(cliParsed.additionalContext).toContain('large read');
    expect(cliParsed.additionalContext).toContain('huge.js');

    expect(httpOut).not.toBeNull();
    expect(httpOut.additionalContext).toContain('large read');
    expect(httpOut.additionalContext).toContain('huge.js');
  });

  test('HTTP and CLI both produce no warning past milestone without crossing', async () => {
    const trackerPath = path.join(planningDir, '.context-tracker');
    // 10 files already — adding file 11 does NOT cross next milestone (20)
    const files = Array.from({ length: 10 }, (_, i) => `/file${i}.js`);
    const seedState = { skill: '', reads: 10, total_chars: 1000, files };

    fs.writeFileSync(trackerPath, JSON.stringify(seedState));
    const cliOut = runCLI({ file_path: '/file10.js' }, 'small');

    fs.writeFileSync(trackerPath, JSON.stringify(seedState));
    const httpOut = runHTTP({ file_path: '/file10.js' }, 'small');

    expect(cliOut).toBe('');
    expect(httpOut).toBeNull();
  });

  // --- Skill reset parity ---

  test('HTTP resets tracker on skill change (same as CLI)', async () => {
    const skillPath = path.join(planningDir, '.active-skill');
    const trackerPath = path.join(planningDir, '.context-tracker');

    fs.writeFileSync(skillPath, 'build');
    fs.writeFileSync(trackerPath, JSON.stringify({
      skill: 'plan', reads: 10, total_chars: 25000, files: ['/old.js']
    }));

    runHTTP({ file_path: '/new.js' }, 'content');

    const tracker = readTracker();
    expect(tracker.skill).toBe('build');
    expect(tracker.reads).toBe(1);
    expect(tracker.files).toEqual(['/new.js']);
  });

  // --- handleHttp returns correct shape ---

  test('handleHttp returns object with additionalContext string when warning fires', async () => {
    const largeContent = 'x'.repeat(6000);
    const result = runHTTP({ file_path: '/huge.js' }, largeContent);
    expect(result).toHaveProperty('additionalContext');
    expect(typeof result.additionalContext).toBe('string');
  });

  test('handleHttp does not call process.exit', async () => {
    // If handleHttp called process.exit, this test would crash
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    try {
      runHTTP({ file_path: '/small.js' }, 'tiny');
      // No error = process.exit was not called
    } finally {
      exitSpy.mockRestore();
    }
  });

  // --- processEvent direct unit tests ---

  describe('processEvent', () => {
    test('returns null for missing file_path', async () => {
      expect(processEvent({}, planningDir, {})).toBeNull();
    });

    test('returns null for empty file_path', async () => {
      expect(processEvent({ tool_input: { file_path: '' } }, planningDir, {})).toBeNull();
    });

    test('returns null for plugin root files when pluginRoot set', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      const result = processEvent(
        { tool_input: { file_path: path.join(pluginDir, 'skill.md') } },
        planningDir,
        { pluginRoot: pluginDir }
      );
      expect(result).toBeNull();
    });

    test('tracks files outside pluginRoot', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      const largeContent = 'x'.repeat(6000);
      const result = processEvent(
        { tool_input: { file_path: path.join(tmpDir, 'src', 'app.js') }, tool_output: largeContent },
        planningDir,
        { pluginRoot: pluginDir }
      );
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('large read');
    });
  });
});
