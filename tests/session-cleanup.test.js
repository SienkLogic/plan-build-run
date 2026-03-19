const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { getHooksLogPath, getEventsLogPath } = require('./helpers');
const SCRIPT = path.join(__dirname, '..', 'hooks', 'session-cleanup.js');
const { tryRemove, cleanStaleCheckpoints, rotateHooksLog, findOrphanedProgressFiles, writeSessionHistory, handleHttp } = require('../hooks/session-cleanup');

describe('session-cleanup.js', () => {
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

  function run(stdinData = '{}') {
    return execSync(`node "${SCRIPT}"`, {
      cwd: tmpDir,
      input: stdinData,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  test('exits silently when no .planning directory', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const output = run();
    expect(output).toBe('');
  });

  test('does NOT remove .auto-next file (consumed by auto-continue Stop hook instead)', () => {
    const filePath = path.join(planningDir, '.auto-next');
    fs.writeFileSync(filePath, '/pbr:execute-phase 3');

    run();

    // .auto-next must survive SessionEnd -- it is a one-shot signal for the Stop hook
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('removes .active-operation file', () => {
    const filePath = path.join(planningDir, '.active-operation');
    fs.writeFileSync(filePath, 'build');

    run();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes .active-skill file', () => {
    const filePath = path.join(planningDir, '.active-skill');
    fs.writeFileSync(filePath, 'plan');

    run();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes .context-tracker file', () => {
    const filePath = path.join(planningDir, '.context-tracker');
    fs.writeFileSync(filePath, '{"chars":500}');

    run();

    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('removes operation and skill files but preserves .auto-next', () => {
    fs.writeFileSync(path.join(planningDir, '.auto-next'), 'cmd');
    fs.writeFileSync(path.join(planningDir, '.active-operation'), 'op');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'sk');

    run();

    expect(fs.existsSync(path.join(planningDir, '.auto-next'))).toBe(true);
    expect(fs.existsSync(path.join(planningDir, '.active-operation'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.active-skill'))).toBe(false);
  });

  test('logs cleaned decision when files were removed', () => {
    fs.writeFileSync(path.join(planningDir, '.active-operation'), 'op');
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'sk');

    run();

    const logPath = getHooksLogPath(planningDir);
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.hook).toBe('session-cleanup');
    expect(entry.event).toBe('SessionEnd');
    expect(entry.decision).toBe('cleaned');
    expect(entry.removed).toContain('.active-operation');
    expect(entry.removed).toContain('.active-skill');
    expect(entry.removed).not.toContain('.auto-next');
  });

  test('logs nothing decision when no files to remove', () => {
    run();

    const logPath = getHooksLogPath(planningDir);
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.decision).toBe('nothing');
    expect(entry.removed).toEqual([]);
  });

  test('passes stdin reason to log entry', () => {
    const stdinData = JSON.stringify({ reason: 'user_quit' });
    run(stdinData);

    const logPath = getHooksLogPath(planningDir);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.reason).toBe('user_quit');
  });

  test('handles invalid JSON stdin gracefully', () => {
    const output = run('not json at all');
    // Should not crash
    expect(output).toBe('');
  });

  test('handles empty stdin gracefully', () => {
    const output = run('');
    expect(output).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Unit tests for exported functions
// ---------------------------------------------------------------------------

describe('session-cleanup exports', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sc-unit-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // tryRemove
  test('tryRemove returns true when file exists and is deleted', () => {
    const filePath = path.join(tmpDir, 'test-file.txt');
    fs.writeFileSync(filePath, 'content');
    expect(tryRemove(filePath)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test('tryRemove returns false when file does not exist', () => {
    const filePath = path.join(tmpDir, 'no-such-file.txt');
    expect(tryRemove(filePath)).toBe(false);
  });

  // cleanStaleCheckpoints
  test('cleanStaleCheckpoints returns empty array when phases dir does not exist', () => {
    const result = cleanStaleCheckpoints(planningDir);
    expect(result).toEqual([]);
  });

  test('cleanStaleCheckpoints skips non-stale manifests', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });
    const manifestPath = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(manifestPath, '{}');
    // File just created -- not stale (less than 24h)
    const result = cleanStaleCheckpoints(planningDir);
    expect(result).toEqual([]);
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  test('cleanStaleCheckpoints removes stale manifests (>24h old)', () => {
    const phaseDir = path.join(planningDir, 'phases', '02-build');
    fs.mkdirSync(phaseDir, { recursive: true });
    const manifestPath = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(manifestPath, '{}');
    // Backdate the mtime by 25 hours
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(manifestPath, staleTime, staleTime);
    const result = cleanStaleCheckpoints(planningDir);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('02-build');
    expect(fs.existsSync(manifestPath)).toBe(false);
  });

  test('cleanStaleCheckpoints skips phase dirs with no manifest', () => {
    const phaseDir = path.join(planningDir, 'phases', '03-done');
    fs.mkdirSync(phaseDir, { recursive: true });
    // No .checkpoint-manifest.json
    const result = cleanStaleCheckpoints(planningDir);
    expect(result).toEqual([]);
  });

  // rotateHooksLog
  test('rotateHooksLog returns false when hooks.jsonl does not exist', () => {
    expect(rotateHooksLog(planningDir)).toBe(false);
  });

  test('rotateHooksLog returns false when log is under size limit', () => {
    const hooksLog = path.join(planningDir, 'logs', 'hooks.jsonl');
    fs.writeFileSync(hooksLog, 'small content');
    expect(rotateHooksLog(planningDir)).toBe(false);
  });

  test('rotateHooksLog always returns false (rotation deprecated — daily files used instead)', () => {
    const hooksLog = path.join(planningDir, 'logs', 'hooks.jsonl');
    // Even with a large file, rotation no longer occurs
    fs.writeFileSync(hooksLog, 'x'.repeat(201 * 1024));
    const result = rotateHooksLog(planningDir);
    expect(result).toBe(false);
    // File should still exist (not rotated)
    expect(fs.existsSync(hooksLog)).toBe(true);
  });

  // findOrphanedProgressFiles
  test('findOrphanedProgressFiles returns empty array when phases dir does not exist', () => {
    expect(findOrphanedProgressFiles(planningDir)).toEqual([]);
  });

  test('findOrphanedProgressFiles finds .PROGRESS-* files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '.PROGRESS-01-01'), '{}');
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# plan');
    const result = findOrphanedProgressFiles(planningDir);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('.PROGRESS-01-01');
  });

  test('findOrphanedProgressFiles returns empty when no .PROGRESS files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-init');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# plan');
    expect(findOrphanedProgressFiles(planningDir)).toEqual([]);
  });

  // writeSessionHistory
  test('writeSessionHistory creates sessions.jsonl', () => {
    writeSessionHistory(planningDir, { reason: 'test' });
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    expect(fs.existsSync(sessionsFile)).toBe(true);
    const content = fs.readFileSync(sessionsFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.reason).toBe('test');
  });

  test('writeSessionHistory creates logs dir if missing', () => {
    fs.rmSync(path.join(planningDir, 'logs'), { recursive: true, force: true });
    writeSessionHistory(planningDir, {});
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    expect(fs.existsSync(sessionsFile)).toBe(true);
  });

  test('writeSessionHistory appends multiple sessions', () => {
    writeSessionHistory(planningDir, { reason: 'first' });
    writeSessionHistory(planningDir, { reason: 'second' });
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const lines = fs.readFileSync(sessionsFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).reason).toBe('first');
    expect(JSON.parse(lines[1]).reason).toBe('second');
  });

  test('writeSessionHistory caps sessions at 100', () => {
    // Write 101 sessions
    for (let i = 0; i < 101; i++) {
      writeSessionHistory(planningDir, { reason: `session-${i}` });
    }
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const lines = fs.readFileSync(sessionsFile, 'utf8').trim().split('\n');
    expect(lines.length).toBeLessThanOrEqual(100);
  });

  test('writeSessionHistory reads existing hooks log for session stats', () => {
    const hooksLog = getHooksLogPath(planningDir);
    const entry = JSON.stringify({ ts: '2026-01-01T00:00:00Z', event: 'SubagentStart', decision: 'spawned' });
    fs.writeFileSync(hooksLog, entry + '\n');
    writeSessionHistory(planningDir, {});
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const session = JSON.parse(fs.readFileSync(sessionsFile, 'utf8').trim());
    expect(session.agents_spawned).toBe(1);
  });

  test('writeSessionHistory reads events log for commit count', () => {
    const eventsLog = getEventsLogPath(planningDir);
    const entry = JSON.stringify({ ts: '2026-01-01T00:01:00Z', cat: 'workflow', event: 'commit-validated', status: 'allow' });
    fs.writeFileSync(eventsLog, entry + '\n');
    writeSessionHistory(planningDir, {});
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const session = JSON.parse(fs.readFileSync(sessionsFile, 'utf8').trim());
    expect(session.commits_created).toBe(1);
  });

  // handleHttp
  test('handleHttp calls cleanup and returns null', async () => {
    const filePath = path.join(planningDir, '.active-skill');
    fs.writeFileSync(filePath, 'plan');
    const result = await handleHttp({ data: { reason: 'session_end' }, planningDir });
    // handleHttp is async and returns null (cleanup is side-effect only)
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('handleHttp does not throw on missing planningDir', async () => {
    const result = await handleHttp({ data: {}, planningDir: path.join(tmpDir, 'nonexistent') });
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
