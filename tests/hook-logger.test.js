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

  test('creates valid JSONL entry with required fields', () => {
    const { logHook } = getLogger();
    logHook('test-hook', 'PreToolUse', 'allow');

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
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

  test('appends to existing log file', () => {
    const { logHook } = getLogger();
    logHook('hook-1', 'Event1', 'allow');
    logHook('hook-2', 'Event2', 'deny');

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    expect(entry1.hook).toBe('hook-1');
    expect(entry2.hook).toBe('hook-2');
  });

  test('rotates at 200 entries', () => {
    const { logHook } = getLogger();

    // Write 201 entries
    for (let i = 0; i < 201; i++) {
      logHook(`hook-${i}`, 'Event', 'allow');
    }

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(200);

    // First entry should be hook-1 (hook-0 was rotated out)
    const first = JSON.parse(lines[0]);
    expect(first.hook).toBe('hook-1');

    // Last entry should be hook-200
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.hook).toBe('hook-200');
  });

  test('gracefully handles missing .planning directory', () => {
    // Remove the .planning dir
    fs.rmSync(planningDir, { recursive: true, force: true });

    const { logHook } = getLogger();
    // Should not throw
    expect(() => logHook('test', 'Event', 'allow')).not.toThrow();

    // And no log file should be created
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl'))).toBe(false);
  });

  test('includes extra details in entry', () => {
    const { logHook } = getLogger();
    logHook('test-hook', 'PostToolUse', 'warn', {
      phase: '3',
      stateStatus: 'built',
      roadmapStatus: 'planned'
    });

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.phase).toBe('3');
    expect(entry.stateStatus).toBe('built');
    expect(entry.roadmapStatus).toBe('planned');
  });

  test('migrates old .hook-log to new logs/hooks.jsonl location', () => {
    // Create old-style log file with some content
    const oldPath = path.join(planningDir, '.hook-log');
    const oldContent = '{"ts":"2025-01-01T00:00:00.000Z","hook":"old-hook","event":"PreToolUse","decision":"allow"}\n';
    fs.writeFileSync(oldPath, oldContent, 'utf8');

    const { logHook } = getLogger();
    logHook('new-hook', 'PostToolUse', 'allow');

    const newPath = path.join(planningDir, 'logs', 'hooks.jsonl');

    // Old file should be gone
    expect(fs.existsSync(oldPath)).toBe(false);

    // New file should exist with migrated + new content
    expect(fs.existsSync(newPath)).toBe(true);
    const lines = fs.readFileSync(newPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);

    // First line should be the migrated entry
    const migrated = JSON.parse(lines[0]);
    expect(migrated.hook).toBe('old-hook');

    // Second line should be the new entry
    const newEntry = JSON.parse(lines[1]);
    expect(newEntry.hook).toBe('new-hook');
  });

  test('includes duration_ms when startTime is provided', () => {
    const { logHook } = getLogger();
    const startTime = Date.now() - 42;
    logHook('timed-hook', 'PreToolUse', 'allow', {}, startTime);

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
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

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.hook).toBe('no-time-hook');
    expect(entry.extra).toBe('data');
    expect(entry.duration_ms).toBeUndefined();
  });

  test('omits duration_ms when startTime is invalid', () => {
    const { logHook } = getLogger();
    logHook('bad-time-hook', 'PreToolUse', 'allow', {}, -1);

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.duration_ms).toBeUndefined();
  });

  test('omits duration_ms when startTime is not a number', () => {
    const { logHook } = getLogger();
    logHook('string-time-hook', 'PreToolUse', 'allow', {}, 'not-a-number');

    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);

    expect(entry.duration_ms).toBeUndefined();
  });

  test('handles empty existing log file', () => {
    const logsDir = path.join(planningDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'hooks.jsonl'), '');

    const { logHook } = getLogger();
    logHook('after-empty', 'PreToolUse', 'allow');

    const lines = fs.readFileSync(path.join(logsDir, 'hooks.jsonl'), 'utf8').trim().split('\n');
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

    // hooks.jsonl should be written inside it
    const logPath = path.join(logsDir, 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.hook).toBe('auto-create-test');
  });
});
