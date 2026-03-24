'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { logEvent } = require('../plugins/pbr/scripts/event-logger');

let tmpDir;
let originalCwd;

function todayLogFile() {
  const today = new Date().toISOString().slice(0, 10);
  return `events-${today}.jsonl`;
}

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
  test('writes to new file when no event log exists', async () => {
    logEvent('test', 'first-event', { key: 'val' });
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', todayLogFile()), 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.cat).toBe('test');
    expect(entry.event).toBe('first-event');
    expect(entry.key).toBe('val');
  });

  test('appends to existing file', async () => {
    const logPath = path.join(tmpDir, '.planning', 'logs', todayLogFile());
    fs.writeFileSync(logPath, JSON.stringify({ ts: '2024-01-01', cat: 'old', event: 'old' }) + '\n');
    logEvent('test', 'new-event');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
  });

  test('handles empty existing file', async () => {
    const logPath = path.join(tmpDir, '.planning', 'logs', todayLogFile());
    fs.writeFileSync(logPath, '');
    logEvent('test', 'after-empty');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
  });

  test('appends without rotation (canonical uses daily files)', async () => {
    // The canonical event-logger uses date-based files, no MAX_ENTRIES rotation
    for (let i = 0; i < 10; i++) {
      logEvent('test', `e${i}`);
    }
    const logPath = path.join(tmpDir, '.planning', 'logs', todayLogFile());
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(10);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.event).toBe('e9');
  });

  test('returns silently when no .planning dir', async () => {
    process.chdir(os.tmpdir());
    // Should not throw
    logEvent('test', 'no-planning');
  });

  test('creates logs dir if missing', async () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
    logEvent('test', 'create-logs-dir');
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'logs', todayLogFile()))).toBe(true);
  });

  test('CLI main: logs event via process.argv', async () => {
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
    const logContent = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', todayLogFile()), 'utf8');
    expect(logContent).toContain('testevent');
  });

  test('CLI main: exits 1 when missing args', async () => {
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

  test('CLI main: handles non-JSON details as raw string', async () => {
    const { execSync } = require('child_process');
    const script = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'event-logger.js');
    const result = execSync(`node "${script}" cat evt "not-json"`, {
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
    });
    const parsed = JSON.parse(result);
    expect(parsed.logged).toBe(true);
    const logContent = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', todayLogFile()), 'utf8');
    expect(logContent).toContain('"raw":"not-json"');
  });

  test('default details is empty object', async () => {
    logEvent('cat', 'evt');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'logs', todayLogFile()), 'utf8');
    const entry = JSON.parse(content.trim());
    expect(entry.cat).toBe('cat');
    expect(entry.event).toBe('evt');
  });
});
