const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('event-logger.js', () => {
  let tmpDir;
  let planningDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getLogger() {
    return require('../plugins/dev/scripts/event-logger');
  }

  function getLogPath() {
    return path.join(planningDir, 'logs', 'events.jsonl');
  }

  test('creates valid JSONL entry with ts, cat, event, and details', () => {
    const { logEvent } = getLogger();
    logEvent('workflow', 'phase-start', { phase: 3, name: 'API' });

    const logPath = getLogPath();
    expect(fs.existsSync(logPath)).toBe(true);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.cat).toBe('workflow');
    expect(entry.event).toBe('phase-start');
    expect(entry.phase).toBe(3);
    expect(entry.name).toBe('API');
    expect(entry.ts).toBeDefined();
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
  });

  test('appends to existing log', () => {
    const { logEvent } = getLogger();
    logEvent('workflow', 'event-1');
    logEvent('agent', 'event-2');

    const logPath = getLogPath();
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    expect(entry1.cat).toBe('workflow');
    expect(entry2.cat).toBe('agent');
  });

  test('rotates at 1000 entries', () => {
    const { logEvent } = getLogger();

    for (let i = 0; i < 1001; i++) {
      logEvent('test', `entry-${i}`);
    }

    const logPath = getLogPath();
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1000);

    // First entry should be entry-1 (entry-0 was rotated out)
    const first = JSON.parse(lines[0]);
    expect(first.event).toBe('entry-1');

    // Last entry should be entry-1000
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.event).toBe('entry-1000');
  });

  test('missing .planning dir is no-op', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });

    const { logEvent } = getLogger();
    expect(() => logEvent('test', 'event')).not.toThrow();

    // No file or directory should be created
    expect(fs.existsSync(path.join(tmpDir, '.planning'))).toBe(false);
  });

  test('auto-creates logs directory', () => {
    // planningDir exists but logs/ does not
    expect(fs.existsSync(path.join(planningDir, 'logs'))).toBe(false);

    const { logEvent } = getLogger();
    logEvent('workflow', 'init');

    expect(fs.existsSync(path.join(planningDir, 'logs'))).toBe(true);
    expect(fs.existsSync(getLogPath())).toBe(true);

    const lines = fs.readFileSync(getLogPath(), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.event).toBe('init');
  });

  test('CLI logs event and exits 0', () => {
    const script = path.resolve(__dirname, '..', 'plugins', 'dev', 'scripts', 'event-logger.js');
    const jsonArg = '{"phase":1}';
    const result = execSync(
      `node "${script}" workflow test ${jsonArg}`,
      { cwd: tmpDir, encoding: 'utf8', shell: true }
    );

    const output = JSON.parse(result);
    expect(output.logged).toBe(true);
    expect(output.category).toBe('workflow');
    expect(output.event).toBe('test');

    // Verify the file was written
    const logPath = getLogPath();
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.cat).toBe('workflow');
  });

  test('CLI exits 1 with no args', () => {
    const script = path.resolve(__dirname, '..', 'plugins', 'dev', 'scripts', 'event-logger.js');
    let exitCode = 0;
    try {
      execSync(`node "${script}"`, { cwd: tmpDir, encoding: 'utf8' });
    } catch (e) {
      exitCode = e.status;
    }
    expect(exitCode).toBe(1);
  });
});
