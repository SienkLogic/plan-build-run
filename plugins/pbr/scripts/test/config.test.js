/**
 * Unit tests for lib/config.js — Config loading, validation, and depth profiles.
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { configLoad, configClearCache, resolveDepthProfile, mergeUserDefaults, DEPTH_PROFILE_DEFAULTS } = require('../lib/config');

afterEach(() => {
  configClearCache();
});

describe('configLoad', () => {
  it('returns null when config.json is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const result = configLoad(tmpDir);
    assert.strictEqual(result, null);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns parsed config when config.json exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    const config = { mode: 'autonomous', depth: 'standard' };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config), 'utf8');

    const result = configLoad(tmpDir);
    assert.strictEqual(result.mode, 'autonomous');
    assert.strictEqual(result.depth, 'standard');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null for invalid JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{ invalid json }', 'utf8');

    const result = configLoad(tmpDir);
    assert.strictEqual(result, null);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('uses mtime-based caching', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{"mode":"interactive"}', 'utf8');

    const result1 = configLoad(tmpDir);
    const result2 = configLoad(tmpDir);
    assert.strictEqual(result1, result2); // Same object reference (cached)

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('resolveDepthProfile', () => {
  it('returns standard defaults when config is null', () => {
    const { depth, profile } = resolveDepthProfile(null);
    assert.strictEqual(depth, 'standard');
    assert.strictEqual(profile['features.research_phase'], true);
  });

  it('returns quick profile when depth is quick', () => {
    const { depth, profile } = resolveDepthProfile({ depth: 'quick' });
    assert.strictEqual(depth, 'quick');
    assert.strictEqual(profile['features.research_phase'], false);
    assert.strictEqual(profile['features.plan_checking'], false);
  });

  it('returns comprehensive profile when depth is comprehensive', () => {
    const { depth, profile } = resolveDepthProfile({ depth: 'comprehensive' });
    assert.strictEqual(depth, 'comprehensive');
    assert.strictEqual(profile['features.inline_verify'], true);
  });

  it('merges user overrides from depth_profiles', () => {
    const config = {
      depth: 'standard',
      depth_profiles: {
        standard: { 'scan.mapper_count': 6 }
      }
    };
    const { profile } = resolveDepthProfile(config);
    assert.strictEqual(profile['scan.mapper_count'], 6);
    // Other defaults preserved
    assert.strictEqual(profile['features.research_phase'], true);
  });
});

describe('mergeUserDefaults', () => {
  it('uses user defaults when base key is missing', () => {
    const base = { mode: 'interactive' };
    const defaults = { mode: 'autonomous', depth: 'comprehensive' };
    const merged = mergeUserDefaults(base, defaults);
    assert.strictEqual(merged.mode, 'interactive'); // base wins
    assert.strictEqual(merged.depth, 'comprehensive'); // from defaults
  });

  it('deep-merges nested objects', () => {
    const base = { features: { research_phase: true } };
    const defaults = { features: { plan_checking: true, research_phase: false } };
    const merged = mergeUserDefaults(base, defaults);
    assert.strictEqual(merged.features.research_phase, true); // base wins
    assert.strictEqual(merged.features.plan_checking, true); // from defaults
  });

  it('returns base unchanged when defaults is null', () => {
    const base = { mode: 'interactive' };
    const merged = mergeUserDefaults(base, null);
    assert.deepStrictEqual(merged, base);
  });
});

describe('config paths use path.join', () => {
  it('USER_DEFAULTS_PATH uses platform path separator', () => {
    const { USER_DEFAULTS_PATH } = require('../lib/config');
    // Should contain the platform-appropriate separator
    assert.ok(USER_DEFAULTS_PATH.includes('pbr-defaults.json'));
    // Should NOT contain a mix of forward and back slashes (unless on platform that uses them)
    if (process.platform === 'win32') {
      assert.ok(USER_DEFAULTS_PATH.includes('\\'));
    }
  });
});
