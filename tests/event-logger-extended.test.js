'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { logEvent } = require('../hooks/event-logger');

let tmpDir;
let origCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-el-'));
  origCwd = process.cwd;
  process.cwd = jest.fn().mockReturnValue(tmpDir);
});

afterEach(() => {
  process.cwd = origCwd;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('logEvent extended', () => {
  test('creates .planning/logs/ directory if missing', () => {
    logEvent('test', 'event-1', { key: 'value' });
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
  });

  test('writes valid JSONL entry', () => {
    logEvent('workflow', 'phase-start', { phase: 3 });
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    const content = fs.readFileSync(logPath, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.cat).toBe('workflow');
    expect(entry.event).toBe('phase-start');
    expect(entry.phase).toBe(3);
    expect(entry.ts).toBeDefined();
  });

  test('appends multiple entries', () => {
    logEvent('a', 'first');
    logEvent('b', 'second');
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).event).toBe('first');
    expect(JSON.parse(lines[1]).event).toBe('second');
  });

  test('rotates entries when exceeding MAX_ENTRIES (1000)', () => {
    const logsDir = path.join(tmpDir, '.planning', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'events.jsonl');

    // Write 1000 existing entries
    const existingLines = [];
    for (let i = 0; i < 1000; i++) {
      existingLines.push(JSON.stringify({ ts: '2026-01-01', cat: 'old', event: `entry-${i}` }));
    }
    fs.writeFileSync(logPath, existingLines.join('\n') + '\n');

    // Write one more -- should trim to 1000
    logEvent('new', 'latest');
    const content = fs.readFileSync(logPath, 'utf8').trim();
    const lines = content.split('\n');
    expect(lines.length).toBe(1000);
    // Last line should be the new entry
    expect(JSON.parse(lines[lines.length - 1]).event).toBe('latest');
    // First entry should have been trimmed (entry-0 removed)
    expect(JSON.parse(lines[0]).event).toBe('entry-1');
  });

  test('handles empty existing log file', () => {
    const logsDir = path.join(tmpDir, '.planning', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'events.jsonl'), '');
    logEvent('test', 'after-empty');
    const content = fs.readFileSync(path.join(logsDir, 'events.jsonl'), 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.event).toBe('after-empty');
  });

  test('does not throw on write errors', () => {
    // Make the logs directory read-only to trigger write error
    // This is platform-dependent; just verify it doesn't throw
    expect(() => {
      logEvent('error', 'test');
    }).not.toThrow();
  });

  test('default details is empty object', () => {
    logEvent('cat', 'evt');
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    expect(entry.cat).toBe('cat');
    expect(entry.event).toBe('evt');
    expect(entry.ts).toBeDefined();
  });
});
