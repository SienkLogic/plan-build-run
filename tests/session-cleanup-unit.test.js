'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { getHooksLogPath, getEventsLogPath } = require('./helpers');
const {
  writeSessionHistory,
  tryRemove,
  cleanStaleCheckpoints,
  rotateHooksLog,
  findOrphanedProgressFiles,
  extractSessionLearnings,
  handleHttp,
} = require('../hooks/session-cleanup');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sc-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tryRemove', () => {
  test('removes existing file and returns true', () => {
    const fp = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(fp, 'data');
    expect(tryRemove(fp)).toBe(true);
    expect(fs.existsSync(fp)).toBe(false);
  });

  test('returns false for non-existent file', () => {
    expect(tryRemove(path.join(tmpDir, 'nope.txt'))).toBe(false);
  });
});

describe('cleanStaleCheckpoints', () => {
  test('returns empty array when no phases dir', () => {
    expect(cleanStaleCheckpoints(planningDir)).toEqual([]);
  });

  test('does not remove fresh checkpoints', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    const manifest = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(manifest, '{}');
    expect(cleanStaleCheckpoints(planningDir)).toEqual([]);
    expect(fs.existsSync(manifest)).toBe(true);
  });

  test('removes stale checkpoints (>24h old)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    const manifest = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(manifest, '{}');
    // Make it old
    const oldTime = Date.now() - (25 * 60 * 60 * 1000);
    fs.utimesSync(manifest, new Date(oldTime), new Date(oldTime));
    const removed = cleanStaleCheckpoints(planningDir);
    expect(removed.length).toBe(1);
    expect(fs.existsSync(manifest)).toBe(false);
  });
});

describe('rotateHooksLog', () => {
  test('returns false when hooks.jsonl does not exist', () => {
    expect(rotateHooksLog(planningDir)).toBe(false);
  });

  test('returns false when hooks.jsonl is small', () => {
    fs.writeFileSync(path.join(planningDir, 'logs', 'hooks.jsonl'), 'small data');
    expect(rotateHooksLog(planningDir)).toBe(false);
  });

  test('always returns false (rotation deprecated — daily files used instead)', () => {
    const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
    fs.writeFileSync(logPath, 'x'.repeat(201 * 1024));
    expect(rotateHooksLog(planningDir)).toBe(false);
    // File is NOT rotated — daily files handle retention instead
    expect(fs.existsSync(logPath)).toBe(true);
  });
});

describe('findOrphanedProgressFiles', () => {
  test('returns empty array when no phases dir', () => {
    expect(findOrphanedProgressFiles(planningDir)).toEqual([]);
  });

  test('returns empty array when no progress files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), 'plan');
    expect(findOrphanedProgressFiles(planningDir)).toEqual([]);
  });

  test('finds .PROGRESS-* files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '.PROGRESS-01-01'), '{}');
    const orphans = findOrphanedProgressFiles(planningDir);
    expect(orphans.length).toBe(1);
    expect(orphans[0]).toContain('.PROGRESS-01-01');
  });
});

describe('writeSessionHistory', () => {
  test('writes session entry to sessions.jsonl', () => {
    writeSessionHistory(planningDir, { reason: 'user stopped' });
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    expect(fs.existsSync(sessionsFile)).toBe(true);
    const content = fs.readFileSync(sessionsFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.reason).toBe('user stopped');
    expect(entry.end).toBeDefined();
  });

  test('appends multiple sessions', () => {
    writeSessionHistory(planningDir, { reason: 'first' });
    writeSessionHistory(planningDir, { reason: 'second' });
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const lines = fs.readFileSync(sessionsFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
  });

  test('counts agents from today\'s hooks log', () => {
    const hooksLog = getHooksLogPath(planningDir);
    const entry = JSON.stringify({ ts: new Date().toISOString(), event: 'SubagentStart', decision: 'spawned', hook: 'test' });
    fs.writeFileSync(hooksLog, entry + '\n');
    writeSessionHistory(planningDir, {});
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const content = fs.readFileSync(sessionsFile, 'utf8').trim();
    const session = JSON.parse(content);
    expect(session.agents_spawned).toBe(1);
  });

  test('counts commits from today\'s events log', () => {
    const eventsLog = getEventsLogPath(planningDir);
    const entry = JSON.stringify({ ts: new Date().toISOString(), cat: 'workflow', event: 'commit-validated', status: 'allow' });
    fs.writeFileSync(eventsLog, entry + '\n');
    writeSessionHistory(planningDir, {});
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    const content = fs.readFileSync(sessionsFile, 'utf8').trim();
    const session = JSON.parse(content);
    expect(session.commits_created).toBe(1);
  });

  test('creates logs dir if missing', () => {
    fs.rmSync(path.join(planningDir, 'logs'), { recursive: true, force: true });
    writeSessionHistory(planningDir, {});
    expect(fs.existsSync(path.join(planningDir, 'logs', 'sessions.jsonl'))).toBe(true);
  });
});

describe('extractSessionLearnings', () => {
  test('does not write when no interesting events', () => {
    extractSessionLearnings(planningDir, 'test-session');
    const learningsFile = path.join(planningDir, 'logs', 'session-learnings.jsonl');
    expect(fs.existsSync(learningsFile)).toBe(false);
  });

  test('writes when blocks are found in hooks log', () => {
    const hooksLog = getHooksLogPath(planningDir);
    const entry = JSON.stringify({ ts: new Date().toISOString(), hook: 'validate-commit', event: 'PreToolUse', decision: 'block', reason: 'bad format' });
    fs.writeFileSync(hooksLog, entry + '\n');
    extractSessionLearnings(planningDir, 'test-session');
    const learningsFile = path.join(planningDir, 'logs', 'session-learnings.jsonl');
    expect(fs.existsSync(learningsFile)).toBe(true);
    const content = fs.readFileSync(learningsFile, 'utf8').trim();
    const learning = JSON.parse(content);
    expect(learning.gates_triggered.length).toBeGreaterThan(0);
  });

  test('extracts agent failures from subagent output warnings', () => {
    const hooksLog = getHooksLogPath(planningDir);
    const entry = JSON.stringify({ ts: new Date().toISOString(), hook: 'check-subagent-output', event: 'PostToolUse', decision: 'warning', agent_type: 'pbr:executor', expected: 'SUMMARY.md' });
    fs.writeFileSync(hooksLog, entry + '\n');
    extractSessionLearnings(planningDir, 'test-session');
    const learningsFile = path.join(planningDir, 'logs', 'session-learnings.jsonl');
    const content = fs.readFileSync(learningsFile, 'utf8').trim();
    const learning = JSON.parse(content);
    expect(learning.agent_failures.length).toBe(1);
  });

  test('counts phase completions from events', () => {
    const eventsLog = getEventsLogPath(planningDir);
    const entry = JSON.stringify({ ts: new Date().toISOString(), cat: 'workflow', event: 'phase-complete' });
    fs.writeFileSync(eventsLog, entry + '\n');
    extractSessionLearnings(planningDir, 'test-session');
    const learningsFile = path.join(planningDir, 'logs', 'session-learnings.jsonl');
    const content = fs.readFileSync(learningsFile, 'utf8').trim();
    const learning = JSON.parse(content);
    expect(learning.phases_completed).toBe(1);
  });

  test('counts compaction events', () => {
    const eventsLog = getEventsLogPath(planningDir);
    const entry = JSON.stringify({ ts: new Date().toISOString(), cat: 'system', event: 'compaction' });
    fs.writeFileSync(eventsLog, entry + '\n');
    extractSessionLearnings(planningDir, 'test-session');
    const learningsFile = path.join(planningDir, 'logs', 'session-learnings.jsonl');
    const content = fs.readFileSync(learningsFile, 'utf8').trim();
    const learning = JSON.parse(content);
    expect(learning.context_events).toContain('compaction');
  });
});

describe('handleHttp', () => {
  test('returns null when planningDir is missing', () => {
    expect(handleHttp({ data: {} })).toBeNull();
  });

  test('returns null when planningDir does not exist', () => {
    expect(handleHttp({ planningDir: '/nonexistent', data: {} })).toBeNull();
  });

  test('cleans up session artifacts', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
    fs.writeFileSync(path.join(planningDir, '.active-operation'), 'test');
    fs.writeFileSync(path.join(planningDir, '.session.json'), '{}');
    const result = handleHttp({ planningDir, data: { reason: 'test' } });
    expect(result).toBeNull();
    expect(fs.existsSync(path.join(planningDir, '.active-skill'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.active-operation'))).toBe(false);
    expect(fs.existsSync(path.join(planningDir, '.session.json'))).toBe(false);
  });

  test('writes session history', () => {
    handleHttp({ planningDir, data: { reason: 'http cleanup' } });
    const sessionsFile = path.join(planningDir, 'logs', 'sessions.jsonl');
    expect(fs.existsSync(sessionsFile)).toBe(true);
  });
});
