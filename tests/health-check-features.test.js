'use strict';

/**
 * Health Check Features — Phase 1 feature-level health reporting
 * Tests that cmdValidateHealth outputs feature_status with per-feature
 * enabled/disabled/healthy status for Phase 1 features, and validates
 * orchestrator_budget_pct range.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-health-feat-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 1\nphase_slug: "foundation"\nstatus: "building"\n---\nPhase: 1 of 1 (Foundation)');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
    '### Phase 1: Foundation\n**Goal:** Build base\n');
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

function getOutput() {
  return mockStdout.mock.calls.map(c => c[0]).join('');
}

function parseOutput() {
  const raw = getOutput();
  try { return JSON.parse(raw); } catch { return null; }
}

describe('cmdValidateHealth — feature_status', () => {
  test('outputs feature_status with enabled features marked healthy', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: {
          enhanced_session_start: true,
          context_quality_scoring: true,
          skip_rag: false
        },
        orchestrator_budget_pct: 25
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status).toBeDefined();
    expect(out.feature_status.enhanced_session_start).toEqual({ enabled: true, status: 'healthy' });
    expect(out.feature_status.context_quality_scoring).toEqual({ enabled: true, status: 'healthy' });
    expect(out.feature_status.skip_rag).toEqual({ enabled: false, status: 'disabled' });
  });

  test('outputs disabled status for features set to false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: {
          enhanced_session_start: false,
          context_quality_scoring: false,
          skip_rag: false
        }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status).toBeDefined();
    expect(out.feature_status.enhanced_session_start).toEqual({ enabled: false, status: 'disabled' });
    expect(out.feature_status.context_quality_scoring).toEqual({ enabled: false, status: 'disabled' });
    expect(out.feature_status.skip_rag).toEqual({ enabled: false, status: 'disabled' });
  });

  test('defaults enabled when features section is missing', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ orchestrator_budget_pct: 25 }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status).toBeDefined();
    // enhanced_session_start and context_quality_scoring default to enabled (not explicitly false)
    expect(out.feature_status.enhanced_session_start.enabled).toBe(true);
    expect(out.feature_status.context_quality_scoring.enabled).toBe(true);
    // skip_rag defaults to disabled (requires explicit true)
    expect(out.feature_status.skip_rag.enabled).toBe(false);
  });

  test('warns when orchestrator_budget_pct is above max (50)', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { enhanced_session_start: true },
        orchestrator_budget_pct: 60
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    const allWarnings = out.warnings || [];
    const budgetWarning = allWarnings.find(w =>
      (typeof w === 'string' ? w : w.message || '').includes('orchestrator_budget_pct')
    );
    expect(budgetWarning).toBeDefined();
  });

  test('warns when orchestrator_budget_pct is below min (15)', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: { enhanced_session_start: true },
        orchestrator_budget_pct: 10
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    const allWarnings = out.warnings || [];
    const budgetWarning = allWarnings.find(w =>
      (typeof w === 'string' ? w : w.message || '').includes('orchestrator_budget_pct')
    );
    expect(budgetWarning).toBeDefined();
  });

  test('each feature_status entry has enabled (boolean) and status (string) fields', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: {
          enhanced_session_start: true,
          context_quality_scoring: true,
          skip_rag: true
        }
      }, null, 2));

    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();

    expect(out).not.toBeNull();
    expect(out.feature_status).toBeDefined();

    for (const key of ['enhanced_session_start', 'context_quality_scoring', 'skip_rag']) {
      const entry = out.feature_status[key];
      expect(typeof entry.enabled).toBe('boolean');
      expect(['healthy', 'disabled', 'degraded']).toContain(entry.status);
    }
  });
});
