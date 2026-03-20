/**
 * Tests for Phase 11 health checks in pbr-tools validate health
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PBR_TOOLS = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js');

function run(args, opts) {
  const options = opts || {};
  const env = Object.assign({}, process.env, options.env || {});
  try {
    const out = execSync(`node "${PBR_TOOLS}" ${args}`, {
      encoding: 'utf-8',
      env,
      timeout: 20000,
    });
    return { stdout: out, stderr: '', code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      code: err.status || 1,
    };
  }
}

describe('Phase 11 health checks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-health-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function getHealthOutput(env) {
    const result = run('validate health', { env: Object.assign({ PBR_PROJECT_ROOT: tmpDir }, env || {}) });
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (_e) {
      return null;
    }
    return parsed;
  }

  test('validate health output includes phase10 checks', () => {
    const health = getHealthOutput();
    expect(health).not.toBeNull();
    expect(health.phase10).toBeDefined();
    expect(Array.isArray(health.phase10)).toBe(true);
  });

  test.skip('Phase 11 feature_status entries removed — were in legacy bin/lib/', () => {
    // machine_executable_plans, spec_diffing, reverse_spec, predictive_impact
    // were removed with plan-build-run/bin/lib/ deletion
  });

  test('phase10 entries each have name and status', () => {
    const health = getHealthOutput();
    expect(health).not.toBeNull();
    for (const entry of health.phase10) {
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.status).toBe('string');
    }
  });
});
