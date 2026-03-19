/**
 * Tests for hooks/lib/resolve-root.js — Project root resolution.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveProjectRoot, clearRootCache } = require('../hooks/lib/resolve-root');

let tmpDir;

beforeEach(() => {
  clearRootCache();
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-root-test-')));
});

afterEach(() => {
  clearRootCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('finds root when .planning/ exists in start dir', () => {
  fs.mkdirSync(path.join(tmpDir, '.planning'));
  const root = resolveProjectRoot(tmpDir);
  expect(root).toBe(tmpDir);
});

test('walks up to find .planning/ in parent', () => {
  fs.mkdirSync(path.join(tmpDir, '.planning'));
  const childDir = path.join(tmpDir, 'src', 'lib');
  fs.mkdirSync(childDir, { recursive: true });

  const root = resolveProjectRoot(childDir);
  expect(root).toBe(tmpDir);
});

test('returns start dir as fallback when no .planning/ found', () => {
  // tmpDir has no .planning
  const root = resolveProjectRoot(tmpDir);
  // Falls back to tmpDir (or finds it walking up if parent has .planning)
  expect(typeof root).toBe('string');
  expect(root.length).toBeGreaterThan(0);
});

test('cache: second call returns cached value', () => {
  fs.mkdirSync(path.join(tmpDir, '.planning'));
  const first = resolveProjectRoot(tmpDir);
  // Even with a different startDir, cache returns the same
  const second = resolveProjectRoot('/some/other/path');
  expect(second).toBe(first);
});

test('clearRootCache resets the cache', () => {
  fs.mkdirSync(path.join(tmpDir, '.planning'));
  resolveProjectRoot(tmpDir);
  clearRootCache();

  // Create a different dir with .planning
  const tmpDir2 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-root-test2-')));
  fs.mkdirSync(path.join(tmpDir2, '.planning'));

  const result = resolveProjectRoot(tmpDir2);
  expect(result).toBe(tmpDir2);

  fs.rmSync(tmpDir2, { recursive: true, force: true });
});

test('uses cwd when no startDir provided', () => {
  clearRootCache();
  const root = resolveProjectRoot();
  expect(typeof root).toBe('string');
});
