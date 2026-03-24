/**
 * Tests for tests/helpers.js shared test utilities.
 */

const fs = require('fs');
const path = require('path');
const {
  createTmpPlanning,
  cleanupTmp,
  createRunner,
  writePlanningFile,
  readLastLogEntry,
  getHooksLogPath,
  getEventsLogPath,
} = require('./helpers');
const { getLogFilename: getHooksFilename } = require('../plugins/pbr/scripts/hook-logger');
const { getLogFilename: getEventsFilename } = require('../plugins/pbr/scripts/event-logger');

describe('createTmpPlanning', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanupTmp(tmpDir);
  });

  test('returns tmpDir and planningDir that exist on disk', async () => {
    const result = createTmpPlanning();
    tmpDir = result.tmpDir;
    expect(fs.existsSync(result.tmpDir)).toBe(true);
    expect(fs.existsSync(result.planningDir)).toBe(true);
  });

  test('planningDir is tmpDir/.planning', async () => {
    const result = createTmpPlanning();
    tmpDir = result.tmpDir;
    expect(result.planningDir).toBe(path.join(result.tmpDir, '.planning'));
  });

  test('.planning/logs/ directory exists', async () => {
    const result = createTmpPlanning();
    tmpDir = result.tmpDir;
    expect(fs.existsSync(path.join(result.planningDir, 'logs'))).toBe(true);
  });

  test('custom prefix works', async () => {
    const result = createTmpPlanning('custom-prefix-');
    tmpDir = result.tmpDir;
    expect(path.basename(result.tmpDir)).toMatch(/^custom-prefix-/);
  });
});

describe('cleanupTmp', () => {
  test('removes the directory created by createTmpPlanning', async () => {
    const { tmpDir } = createTmpPlanning();
    expect(fs.existsSync(tmpDir)).toBe(true);
    cleanupTmp(tmpDir);
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  test('does not throw on already-deleted directory', async () => {
    const { tmpDir } = createTmpPlanning();
    cleanupTmp(tmpDir);
    expect(() => cleanupTmp(tmpDir)).not.toThrow();
  });
});

describe('createRunner', () => {
  test('returns a function', async () => {
    const run = createRunner('nonexistent.js');
    expect(typeof run).toBe('function');
  });

  test('running a simple script returns { exitCode: 0, output }', () => {
    const scriptPath = path.join(__dirname, '..', 'node_modules', '.cache', '_test-echo.js');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, 'process.stdout.write(JSON.stringify({ok:true}))');

    try {
      const run = createRunner(scriptPath);
      const result = run();
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('{"ok":true}');
    } finally {
      fs.unlinkSync(scriptPath);
    }
  });

  test('script that exits non-zero returns { exitCode: 1, output }', () => {
    const scriptPath = path.join(__dirname, '..', 'node_modules', '.cache', '_test-fail.js');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, 'process.stdout.write("err"); process.exit(1);');

    try {
      const run = createRunner(scriptPath);
      const result = run();
      expect(result.exitCode).toBe(1);
      expect(result.output).toBe('err');
    } finally {
      fs.unlinkSync(scriptPath);
    }
  });

  test('object stdinData is auto-stringified to JSON', async () => {
    const scriptPath = path.join(__dirname, '..', 'node_modules', '.cache', '_test-stdin.js');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, `
      let data = '';
      process.stdin.on('data', c => data += c);
      process.stdin.on('end', () => { process.stdout.write(data); });
    `);

    try {
      const run = createRunner(scriptPath);
      const result = run({ hello: 'world' });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.output)).toEqual({ hello: 'world' });
    } finally {
      fs.unlinkSync(scriptPath);
    }
  });

  test('opts.cwd sets the working directory', async () => {
    const scriptPath = path.join(__dirname, '..', 'node_modules', '.cache', '_test-cwd.js');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, 'process.stdout.write(process.cwd())');

    const { tmpDir } = createTmpPlanning();
    try {
      const run = createRunner(scriptPath);
      const result = run(undefined, { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      // Normalize paths for comparison (macOS /var -> /private/var symlink)
      expect(fs.realpathSync(result.output.trim())).toBe(fs.realpathSync(tmpDir));
    } finally {
      fs.unlinkSync(scriptPath);
      cleanupTmp(tmpDir);
    }
  });

  test('works with a real hook script (check-dangerous-commands)', async () => {
    const scriptPath = path.resolve(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-dangerous-commands.js');
    const run = createRunner(scriptPath);
    const result = run({ tool_input: { command: 'echo hi' } });
    expect(result.exitCode).toBe(0);
  });
});

describe('writePlanningFile', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    const result = createTmpPlanning();
    tmpDir = result.tmpDir;
    planningDir = result.planningDir;
  });

  afterEach(() => {
    cleanupTmp(tmpDir);
  });

  test('writes file at planningDir/filename', async () => {
    writePlanningFile(planningDir, 'test.md', '# Test');
    expect(fs.readFileSync(path.join(planningDir, 'test.md'), 'utf8')).toBe('# Test');
  });

  test('writes file with intermediate dirs', async () => {
    writePlanningFile(planningDir, path.join('sub', 'dir', 'file.md'), 'nested content');
    expect(
      fs.readFileSync(path.join(planningDir, 'sub', 'dir', 'file.md'), 'utf8')
    ).toBe('nested content');
  });
});

describe('readLastLogEntry', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    const result = createTmpPlanning();
    tmpDir = result.tmpDir;
    planningDir = result.planningDir;
  });

  afterEach(() => {
    cleanupTmp(tmpDir);
  });

  test('returns null when no log file exists', async () => {
    expect(readLastLogEntry(planningDir)).toBeNull();
  });

  test('returns parsed JSON of last line when log file exists', async () => {
    const logPath = path.join(planningDir, 'logs', getHooksFilename());
    const entries = [
      JSON.stringify({ event: 'first', ts: 1 }),
      JSON.stringify({ event: 'last', ts: 2 }),
    ];
    fs.writeFileSync(logPath, entries.join('\n') + '\n');

    const result = readLastLogEntry(planningDir);
    expect(result).toEqual({ event: 'last', ts: 2 });
  });
});

describe('getHooksLogPath / getEventsLogPath', () => {
  test('getHooksLogPath returns path with dated hooks filename', async () => {
    const p = getHooksLogPath('/fake/.planning');
    expect(p).toContain('logs');
    expect(p).toMatch(/hooks-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  test('getEventsLogPath returns path with dated events filename', async () => {
    const p = getEventsLogPath('/fake/.planning');
    expect(p).toContain('logs');
    expect(p).toMatch(/events-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  test('paths include planningDir/logs/ prefix', async () => {
    const planningDir = path.join('some', 'project', '.planning');
    const hooksPath = getHooksLogPath(planningDir);
    const eventsPath = getEventsLogPath(planningDir);
    expect(hooksPath).toBe(path.join(planningDir, 'logs', getHooksFilename()));
    expect(eventsPath).toBe(path.join(planningDir, 'logs', getEventsFilename()));
  });
});
