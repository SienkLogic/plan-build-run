'use strict';

/**
 * Health Check — Graduated Verification, Self-Verification, and Autonomy
 * Tests that cmdValidateHealth reports feature_status for Phase 8 features
 * and that the trust-gate CLI subcommand returns depth JSON.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-health-grad-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '08-graduated'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 8\nphase_slug: "graduated"\nstatus: "building"\n---\nPhase: 8 of 8 (Graduated)');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
    '### Phase 8: Graduated Verification\n**Goal:** Trust-based verification\n');
  fs.writeFileSync(path.join(planningDir, 'PROJECT.md'),
    '# Project\n\n## What This Is\n\nTest project.\n\n## Core Value\n\nTesting.\n\n## Requirements\n\nNone.\n');
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

const { cmdValidateHealth } = require('../plan-build-run/bin/lib/verify.cjs');

function parseOutput() {
  const raw = mockStdout.mock.calls.map(c => c[0]).join('');
  try { return JSON.parse(raw); } catch { return null; }
}

describe('cmdValidateHealth — graduated_verification feature status', () => {
  test('reports healthy when graduated_verification enabled and trust data exists', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'trust'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'trust', 'scores.json'),
      JSON.stringify({ overall_pass_rate: 0.85 }));
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({
        features: { graduated_verification: true, self_verification: true }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status).toBeDefined();
    expect(out.feature_status.graduated_verification).toEqual({
      enabled: true, status: 'healthy'
    });
  });

  test('reports degraded when graduated_verification enabled but no trust data', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { graduated_verification: true }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status.graduated_verification).toEqual({
      enabled: true, status: 'degraded'
    });
  });

  test('reports disabled when graduated_verification is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { graduated_verification: false }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status.graduated_verification).toEqual({
      enabled: false, status: 'disabled'
    });
  });
});

describe('cmdValidateHealth — self_verification feature status', () => {
  test('reports healthy when self_verification enabled', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { self_verification: true }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status.self_verification).toEqual({
      enabled: true, status: 'healthy'
    });
  });

  test('reports disabled when self_verification is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { self_verification: false }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status.self_verification).toEqual({
      enabled: false, status: 'disabled'
    });
  });
});

describe('cmdValidateHealth — autonomy feature status', () => {
  test('reports healthy with current level when autonomy.level is set', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        autonomy: { level: 'collaborative' }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status.autonomy).toEqual({
      enabled: true, status: 'healthy', level: 'collaborative'
    });
  });

  test('reports degraded when autonomy section missing (defaults to supervised)', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { graduated_verification: true }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status.autonomy).toEqual({
      enabled: true, status: 'degraded', level: 'supervised'
    });
  });
});

describe('trust-gate CLI subcommand', () => {
  test('resolveVerificationDepth is callable and returns valid depth', () => {
    const { resolveVerificationDepth } = require('../plugins/pbr/scripts/lib/trust-gate');
    const planningDir = path.join(tmpDir, '.planning');

    // No trust data, feature enabled
    const config = { features: { graduated_verification: true } };
    const depth = resolveVerificationDepth(planningDir, config);
    expect(['light', 'standard', 'thorough']).toContain(depth);
    expect(depth).toBe('standard'); // no data -> standard
  });

  test('resolveVerificationDepth returns light for high trust', () => {
    const { resolveVerificationDepth } = require('../plugins/pbr/scripts/lib/trust-gate');
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(path.join(planningDir, 'trust'), { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'trust', 'scores.json'),
      JSON.stringify({ overall_pass_rate: 0.95 }));

    const config = { features: { graduated_verification: true } };
    const depth = resolveVerificationDepth(planningDir, config);
    expect(depth).toBe('light');
  });
});
