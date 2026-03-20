'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { logEvent, getLogFilename } = require('../plugins/pbr/scripts/event-logger');

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

function getDatedLogPath() {
  return path.join(tmpDir, '.planning', 'logs', getLogFilename());
}

describe('logEvent extended', () => {
  test('creates .planning/logs/ directory if missing', () => {
    logEvent('test', 'event-1', { key: 'value' });
    expect(fs.existsSync(getDatedLogPath())).toBe(true);
  });

  test('writes valid JSONL entry', () => {
    logEvent('workflow', 'phase-start', { phase: 3 });
    const content = fs.readFileSync(getDatedLogPath(), 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.cat).toBe('workflow');
    expect(entry.event).toBe('phase-start');
    expect(entry.phase).toBe(3);
    expect(entry.ts).toBeDefined();
  });

  test('appends multiple entries', () => {
    logEvent('a', 'first');
    logEvent('b', 'second');
    const lines = fs.readFileSync(getDatedLogPath(), 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).event).toBe('first');
    expect(JSON.parse(lines[1]).event).toBe('second');
  });

  test('no rotation — daily files accumulate all entries', () => {
    // With dated daily files there is no per-file entry cap.
    for (let i = 0; i < 1001; i++) {
      logEvent('test', `entry-${i}`);
    }
    const lines = fs.readFileSync(getDatedLogPath(), 'utf8').trim().split('\n');
    // All 1001 entries must be present (no rotation)
    expect(lines.length).toBe(1001);
    expect(JSON.parse(lines[0]).event).toBe('entry-0');
    expect(JSON.parse(lines[lines.length - 1]).event).toBe('entry-1000');
  });

  test('handles empty existing dated log file', () => {
    const logsDir = path.join(tmpDir, '.planning', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(getDatedLogPath(), '');
    logEvent('test', 'after-empty');
    const content = fs.readFileSync(getDatedLogPath(), 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.event).toBe('after-empty');
  });

  test('does not throw on write errors', () => {
    expect(() => {
      logEvent('error', 'test');
    }).not.toThrow();
  });

  test('default details is empty object', () => {
    logEvent('cat', 'evt');
    const entry = JSON.parse(fs.readFileSync(getDatedLogPath(), 'utf8').trim());
    expect(entry.cat).toBe('cat');
    expect(entry.event).toBe('evt');
    expect(entry.ts).toBeDefined();
  });
});
