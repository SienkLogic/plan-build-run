'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// commands.cjs calls process.exit via output() — mock it
let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cmd-'));
  mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
  mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  mockStderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  mockExit.mockRestore();
  mockStdout.mockRestore();
  mockStderr.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Import after setup since requiring the module has side effects from core.cjs
const {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdVerifyPathExists,
} = require('../plan-build-run/bin/lib/commands.cjs');

describe('cmdGenerateSlug', () => {
  test('generates a slug from text', () => {
    try { cmdGenerateSlug('Hello World Test', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('hello-world-test');
  });

  test('strips special characters', () => {
    try { cmdGenerateSlug('My Feature! (v2.0)', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('my-feature-v2-0');
  });

  test('strips leading and trailing dashes', () => {
    try { cmdGenerateSlug('---hello---', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('hello');
  });
});

describe('cmdCurrentTimestamp', () => {
  test('returns full ISO timestamp by default', () => {
    try { cmdCurrentTimestamp('full', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  test('returns date-only format', () => {
    try { cmdCurrentTimestamp('date', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('returns filename-safe format', () => {
    try { cmdCurrentTimestamp('filename', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).not.toContain(':');
  });

  test('defaults to full format', () => {
    try { cmdCurrentTimestamp(undefined, true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('cmdVerifyPathExists', () => {
  test('returns true for existing file', () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'data');
    try { cmdVerifyPathExists(tmpDir, 'test.txt', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('true');
  });

  test('returns false for non-existent path', () => {
    try { cmdVerifyPathExists(tmpDir, 'nonexistent.txt', true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('false');
  });

  test('identifies directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'subdir'));
    try { cmdVerifyPathExists(tmpDir, 'subdir', false); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('directory');
  });

  test('handles absolute paths', () => {
    const filePath = path.join(tmpDir, 'abs-test.txt');
    fs.writeFileSync(filePath, 'data');
    try { cmdVerifyPathExists(tmpDir, filePath, true); } catch (_e) { /* exit mock */ }
    const output = mockStdout.mock.calls.map(c => c[0]).join('');
    expect(output).toContain('true');
  });
});
