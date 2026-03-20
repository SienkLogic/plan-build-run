const fs = require('fs');
const path = require('path');
const os = require('os');

describe('hook-logger.js', () => {
  let tmpDir;
  let planningDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    // Re-require to pick up new cwd
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getLogger() {
    return require('../plugins/pbr/scripts/hook-logger');
  }

  function getDatedLogPath(planDir) {
    const { getLogFilename } = require('../plugins/pbr/scripts/hook-logger');
    return path.join(planDir, 'logs', getLogFilename());
  }

  test('creates valid JSONL entry with required fields', () => {
    const { logHook } = getLogger();
    logHook('test-hook', 'PreToolUse', 'allow');

    const logPath = getDatedLogPath(planningDir);
    expect(fs.existsSync(logPath)).toBe(true);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.hook).toBe('test-hook');
    expect(entry.event).toBe('PreToolUse');
    expect(entry.decision).toBe('allow');
    expect(entry.ts).toBeDefined();
    // Verify ts is ISO format
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
  });

  test('appends to existing log file (file grows by one line per call)', () => {
    const { logHook } = getLogger();
    logHook('hook-1', 'Event1', 'allow');
    logHook('hook-2', 'Event2', 'deny');

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    expect(entry1.hook).toBe('hook-1');
    expect(entry2.hook).toBe('hook-2');
  });

  test('concurrent appends both preserved', () => {
    const { logHook } = getLogger();
    // Call logHook twice rapidly -- both entries must be present
    logHook('concurrent-1', 'Event', 'allow');
    logHook('concurrent-2', 'Event', 'allow');

    const logPath = getDatedLogPath(planningDir);
    const content = fs.readFileSync(logPath, 'utf8').trim();
    const lines = content.split('\n');
    expect(lines).toHaveLength(2);

    const hooks = lines.map(l => JSON.parse(l).hook);
    expect(hooks).toContain('concurrent-1');
    expect(hooks).toContain('concurrent-2');
  });

  test('no rotation — daily files accumulate all entries', () => {
    // With dated daily files there is no per-file entry cap.
    // Writing 250 entries should all be retained.
    const { logHook } = getLogger();
    for (let i = 0; i < 250; i++) {
      logHook(`seed-${i}`, 'Event', 'allow');
    }

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(250);

    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.hook).toBe('seed-249');
  });

  test('gracefully handles missing .planning directory in cwd', () => {
    // Remove the .planning dir from tmpDir
    fs.rmSync(planningDir, { recursive: true, force: true });

    const { logHook } = getLogger();
    // Should not throw -- resolveProjectRoot walks up and may find an ancestor's .planning/
    // or falls back to cwd where it auto-creates .planning/logs/
    expect(() => logHook('test', 'Event', 'allow')).not.toThrow();
  });

  test('includes extra details in entry', () => {
    const { logHook } = getLogger();
    logHook('test-hook', 'PostToolUse', 'warn', {
      phase: '3',
      stateStatus: 'built',
      roadmapStatus: 'planned'
    });

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.phase).toBe('3');
    expect(entry.stateStatus).toBe('built');
    expect(entry.roadmapStatus).toBe('planned');
  });

  test('removes legacy .hook-log file on first write', () => {
    // The very old .hook-log format is cleaned up on first write (not migrated).
    const oldPath = path.join(planningDir, '.hook-log');
    fs.writeFileSync(oldPath, '{"ts":"2025-01-01T00:00:00.000Z","hook":"old-hook"}\n', 'utf8');

    const { logHook } = getLogger();
    logHook('new-hook', 'PostToolUse', 'allow');

    // Old file should be gone
    expect(fs.existsSync(oldPath)).toBe(false);

    // Today's dated log should exist with only the new entry
    const logPath = getDatedLogPath(planningDir);
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).hook).toBe('new-hook');
  });

  test('includes duration_ms when startTime is provided', () => {
    const { logHook } = getLogger();
    const startTime = Date.now() - 42;
    logHook('timed-hook', 'PreToolUse', 'allow', {}, startTime);

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.hook).toBe('timed-hook');
    expect(typeof entry.duration_ms).toBe('number');
    expect(entry.duration_ms).toBeGreaterThanOrEqual(42);
    expect(entry.duration_ms).toBeLessThan(5000); // sanity bound
  });

  test('omits duration_ms when startTime is not provided', () => {
    const { logHook } = getLogger();
    logHook('no-time-hook', 'PreToolUse', 'allow', { extra: 'data' });

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.hook).toBe('no-time-hook');
    expect(entry.extra).toBe('data');
    expect(entry.duration_ms).toBeUndefined();
  });

  test('omits duration_ms when startTime is invalid', () => {
    const { logHook } = getLogger();
    logHook('bad-time-hook', 'PreToolUse', 'allow', {}, -1);

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.duration_ms).toBeUndefined();
  });

  test('omits duration_ms when startTime is not a number', () => {
    const { logHook } = getLogger();
    logHook('string-time-hook', 'PreToolUse', 'allow', {}, 'not-a-number');

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.duration_ms).toBeUndefined();
  });

  test('handles empty existing dated log file', () => {
    const { logHook, getLogFilename } = getLogger();
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    // Pre-create an empty dated log file
    fs.writeFileSync(path.join(logsDir, getLogFilename()), '');

    logHook('after-empty', 'PreToolUse', 'allow');

    const lines = fs.readFileSync(getDatedLogPath(planningDir), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.hook).toBe('after-empty');
  });

  test('auto-creates logs/ directory when only .planning/ exists', () => {
    // .planning/ exists from beforeEach but logs/ does not
    const logsDir = path.join(planningDir, 'logs');
    expect(fs.existsSync(logsDir)).toBe(false);

    const { logHook } = getLogger();
    logHook('auto-create-test', 'PreToolUse', 'allow');

    // logs/ directory should now exist
    expect(fs.existsSync(logsDir)).toBe(true);

    // Today's dated log should be written inside it
    const logPath = getDatedLogPath(planningDir);
    expect(fs.existsSync(logPath)).toBe(true);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.hook).toBe('auto-create-test');
  });

  test('includes sessionId when passed in details', () => {
    const { logHook } = getLogger();
    logHook('test-hook', 'PostToolUse', 'allow', {
      sessionId: 'sess-123',
      tool: 'Write'
    });

    const logPath = getDatedLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.sessionId).toBe('sess-123');
    expect(entry.source).toBe('test-hook');
    expect(entry.tool).toBe('Write');
  });

  test('uses appendFileSync not readFile for writing', () => {
    // Verify the implementation uses append-only pattern
    const loggerSource = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'hook-logger.js'),
      'utf8'
    );
    // Should use appendFileSync
    expect(loggerSource).toContain('appendFileSync');
    // Should NOT use readFileSync inside logHook (only rotateLog may read)
    // Check that logHook function body does not contain readFileSync
    const logHookMatch = loggerSource.match(/function logHook\b[\s\S]*?^}/m);
    if (logHookMatch) {
      expect(logHookMatch[0]).not.toContain('readFileSync');
    }
  });
});
