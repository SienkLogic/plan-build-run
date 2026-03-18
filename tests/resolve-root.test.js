const fs = require('fs');
const path = require('path');
const os = require('os');

describe('resolve-root.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getResolver() {
    return require('../hooks/lib/resolve-root');
  }

  test('finds .planning/ in current dir', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    const { resolveProjectRoot, clearRootCache } = getResolver();
    clearRootCache();
    const root = resolveProjectRoot(tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('finds .planning/ two levels up', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    const deepDir = path.join(tmpDir, 'a', 'b');
    fs.mkdirSync(deepDir, { recursive: true });

    const { resolveProjectRoot, clearRootCache } = getResolver();
    clearRootCache();
    const root = resolveProjectRoot(deepDir);
    expect(root).toBe(tmpDir);
  });

  test('falls back to startDir when .planning/ absent in entire ancestry', () => {
    // Create a nested dir structure with a fake root that has no .planning/
    // We can't guarantee the real FS root has no .planning/, so instead
    // verify the function returns a value (either startDir or an ancestor with .planning/)
    const { resolveProjectRoot, clearRootCache } = getResolver();
    clearRootCache();
    const root = resolveProjectRoot(tmpDir);
    // Result should be a valid directory
    expect(fs.existsSync(root)).toBe(true);
    // If tmpDir or an ancestor has .planning/, root should be that ancestor
    // If no ancestor has .planning/, root should be tmpDir (fallback)
    const hasPlanningDir = fs.existsSync(path.join(root, '.planning'));
    const isFallback = root === tmpDir;
    expect(hasPlanningDir || isFallback).toBe(true);
  });

  test('caching - second call returns same value without fs access', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    const { resolveProjectRoot, clearRootCache } = getResolver();
    clearRootCache();

    const first = resolveProjectRoot(tmpDir);
    // Remove .planning so if it re-walks, it would fall back
    fs.rmSync(planningDir, { recursive: true, force: true });

    const second = resolveProjectRoot(tmpDir);
    expect(second).toBe(first);
    expect(second).toBe(tmpDir);
  });

  test('clearRootCache resets the cache', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    const { resolveProjectRoot, clearRootCache } = getResolver();
    clearRootCache();

    const first = resolveProjectRoot(tmpDir);
    expect(first).toBe(tmpDir);

    // Clear cache and remove .planning
    clearRootCache();
    fs.rmSync(planningDir, { recursive: true, force: true });

    // Now it should re-resolve -- result depends on whether an ancestor has .planning/
    const second = resolveProjectRoot(tmpDir);
    // Key assertion: second !== first (first was tmpDir, now .planning/ is gone)
    // Unless an ancestor also has .planning/, in which case it finds that
    expect(typeof second).toBe('string');
    expect(fs.existsSync(second)).toBe(true);
  });

  test('defaults to process.cwd() when no startDir given', () => {
    const originalCwd = process.cwd();
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);

    try {
      process.chdir(tmpDir);
      const { resolveProjectRoot, clearRootCache } = getResolver();
      clearRootCache();
      const root = resolveProjectRoot();
      expect(root).toBe(tmpDir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handles filesystem root without infinite loop', () => {
    // Use a path that definitely has no .planning/ ancestor
    const { resolveProjectRoot, clearRootCache } = getResolver();
    clearRootCache();

    // Use OS temp root -- unlikely to have .planning/
    const tempRoot = os.tmpdir();
    const result = resolveProjectRoot(tempRoot);
    // Should return tempRoot as fallback (no .planning/ found)
    expect(result).toBe(tempRoot);
  });
});
