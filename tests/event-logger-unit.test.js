'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { logEvent } = require('../plugins/pbr/scripts/event-logger');

let tmpDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-elu-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('logEvent branch coverage', () => {
  test('writes to new file when no events.jsonl exists', () => {
    logEvent('test', 'first-event', { key: 'val' });
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', 'events.jsonl'), 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.cat).toBe('test');
    expect(entry.event).toBe('first-event');
    expect(entry.key).toBe('val');
  });

  test('appends to existing file', () => {
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    fs.writeFileSync(logPath, JSON.stringify({ ts: '2024-01-01', cat: 'old', event: 'old' }) + '\n');
    logEvent('test', 'new-event');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
  });

  test('handles empty existing file', () => {
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    fs.writeFileSync(logPath, '');
    logEvent('test', 'after-empty');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
  });

  test('rotates when exceeding MAX_ENTRIES', () => {
    const logPath = path.join(tmpDir, '.planning', 'logs', 'events.jsonl');
    const entries = Array.from({ length: 1001 }, (_, i) =>
      JSON.stringify({ ts: '2024-01-01', cat: 'test', event: `e${i}` })
    );
    fs.writeFileSync(logPath, entries.join('\n') + '\n');
    logEvent('test', 'overflow');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1000);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.event).toBe('overflow');
  });

  test('returns silently when no .planning dir', () => {
    process.chdir(os.tmpdir());
    // Should not throw
    logEvent('test', 'no-planning');
  });

  test('creates logs dir if missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
    logEvent('test', 'create-logs-dir');
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'logs', 'events.jsonl'))).toBe(true);
  });

  test('default details is empty object', () => {
    logEvent('cat', 'evt');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', 'events.jsonl'), 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.cat).toBe('cat');
    expect(entry.event).toBe('evt');
  });
});
