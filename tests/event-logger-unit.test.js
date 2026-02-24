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

  test('CLI main: logs event via process.argv', () => {
    const { execSync } = require('child_process');
    const script = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'event-logger.js');
    const result = execSync(`node "${script}" testcat testevent '{"foo":"bar"}'`, {
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    const parsed = JSON.parse(result);
    expect(parsed.logged).toBe(true);
    expect(parsed.category).toBe('testcat');
    expect(parsed.event).toBe('testevent');
    // Verify the event was actually written
    const logContent = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', 'events.jsonl'), 'utf8');
    expect(logContent).toContain('testevent');
  });

  test('CLI main: exits 1 when missing args', () => {
    const { execSync } = require('child_process');
    const script = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'event-logger.js');
    try {
      execSync(`node "${script}"`, { encoding: 'utf8', timeout: 5000, cwd: tmpDir });
      throw new Error('should have exited with code 1');
    } catch (e) {
      expect(e.status).toBe(1);
      expect(e.stdout).toContain('Usage');
    }
  });

  test('CLI main: handles non-JSON details as raw string', () => {
    const { execSync } = require('child_process');
    const script = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'event-logger.js');
    const result = execSync(`node "${script}" cat evt "not-json"`, {
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    const parsed = JSON.parse(result);
    expect(parsed.logged).toBe(true);
    const logContent = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', 'events.jsonl'), 'utf8');
    expect(logContent).toContain('"raw":"not-json"');
  });

  test('default details is empty object', () => {
    logEvent('cat', 'evt');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', 'events.jsonl'), 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.cat).toBe('cat');
    expect(entry.event).toBe('evt');
  });
});
