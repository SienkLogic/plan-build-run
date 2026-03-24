'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { initConfigCache, getConfig, clearConfigCache, stopConfigWatch } = require('../plugins/pbr/scripts/lib/config-cache');

let tmpDir;
let planningDir;

beforeEach(() => {
  clearConfigCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cc-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ project_name: 'test' }));
});

afterEach(() => {
  clearConfigCache();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) { /* best-effort cleanup */ }
});

describe('config-cache', () => {
  test('initConfigCache loads config from disk and returns it', async () => {
    const result = initConfigCache(planningDir);
    expect(result).toEqual(expect.objectContaining({ project_name: 'test' }));
  });

  test('getConfig returns cached value without disk read', async () => {
    initConfigCache(planningDir);
    // Delete the file from disk
    fs.unlinkSync(path.join(planningDir, 'config.json'));
    // Should still return the cached value (proves no disk read)
    const result = getConfig();
    expect(result).toEqual(expect.objectContaining({ project_name: 'test' }));
  });

  test('clearConfigCache resets to null', async () => {
    initConfigCache(planningDir);
    expect(getConfig()).not.toBeNull();
    clearConfigCache();
    expect(getConfig()).toBeNull();
  });

  test('getConfig returns null before init', async () => {
    // clearConfigCache already called in beforeEach
    expect(getConfig()).toBeNull();
  });

  test('re-init with different planningDir switches config', async () => {
    // First planningDir
    initConfigCache(planningDir);
    expect(getConfig()).toEqual(expect.objectContaining({ project_name: 'test' }));

    // Second planningDir
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cc2-'));
    const planningDir2 = path.join(tmpDir2, '.planning');
    fs.mkdirSync(planningDir2, { recursive: true });
    fs.writeFileSync(path.join(planningDir2, 'config.json'), JSON.stringify({ project_name: 'other' }));

    try {
      initConfigCache(planningDir2);
      expect(getConfig()).toEqual(expect.objectContaining({ project_name: 'other' }));
    } finally {
      clearConfigCache();
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });
});
