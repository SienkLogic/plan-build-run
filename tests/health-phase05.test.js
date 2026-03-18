'use strict';

/**
 * Health Check Phase 05 — decision_journal, negative_knowledge, living_requirements
 * Tests that cmdValidateHealth outputs phase05_features with per-feature
 * enabled/disabled/healthy/degraded status.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-health-p05-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '05-features'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 5\nphase_slug: "features"\nstatus: "building"\n---\nPhase: 5 of 5 (Features)');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
    '### Phase 5: Features\n**Goal:** Build features\n');
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
const { handleDecisionExtraction, extractNegativeKnowledge } = require('../plugins/pbr/scripts/event-handler');
const { clearRootCache } = require('../plugins/pbr/scripts/lib/resolve-root');

function parseOutput() {
  const raw = mockStdout.mock.calls.map(c => c[0]).join('');
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── decision_journal ────────────────────────────────────────────────────────

describe('phase05_features — decision_journal', () => {
  test('healthy when enabled and decisions/ dir exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'decisions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { decision_journal: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features).toBeDefined();
    expect(out.phase05_features.decision_journal).toEqual({
      enabled: true, status: 'healthy'
    });
  });

  test('degraded when enabled but decisions/ dir missing', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { decision_journal: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.decision_journal).toEqual({
      enabled: true, status: 'degraded', reason: 'decisions directory not found'
    });
  });

  test('disabled when toggle is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { decision_journal: false } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.decision_journal).toEqual({
      enabled: false, status: 'disabled'
    });
  });
});

// ─── negative_knowledge ──────────────────────────────────────────────────────

describe('phase05_features — negative_knowledge', () => {
  test('healthy when enabled and negative-knowledge/ dir exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'negative-knowledge'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { negative_knowledge: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.negative_knowledge).toEqual({
      enabled: true, status: 'healthy'
    });
  });

  test('degraded when enabled but negative-knowledge/ dir missing', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { negative_knowledge: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.negative_knowledge).toEqual({
      enabled: true, status: 'degraded', reason: 'negative-knowledge directory not found'
    });
  });

  test('disabled when toggle is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { negative_knowledge: false } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.negative_knowledge).toEqual({
      enabled: false, status: 'disabled'
    });
  });
});

// ─── living_requirements ─────────────────────────────────────────────────────

describe('phase05_features — living_requirements', () => {
  test('healthy when enabled and REQUIREMENTS.md has REQ- patterns', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '# Requirements\n\n- REQ-F-001: Build the thing\n- REQ-F-002: Test the thing\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { living_requirements: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.living_requirements).toEqual({
      enabled: true, status: 'healthy'
    });
  });

  test('degraded when enabled but REQUIREMENTS.md missing', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { living_requirements: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.living_requirements).toEqual({
      enabled: true, status: 'degraded', reason: 'REQUIREMENTS.md not found or has no REQ-IDs'
    });
  });

  test('degraded when REQUIREMENTS.md exists but has no REQ- patterns', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '# Requirements\n\nNo requirements defined yet.\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { living_requirements: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.living_requirements).toEqual({
      enabled: true, status: 'degraded', reason: 'REQUIREMENTS.md not found or has no REQ-IDs'
    });
  });

  test('disabled when toggle is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { living_requirements: false } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features.living_requirements).toEqual({
      enabled: false, status: 'disabled'
    });
  });
});

// ─── Audit evidence logging ──────────────────────────────────────────────────

describe('Phase 05 audit evidence', () => {
  let origCwd;

  beforeEach(() => {
    origCwd = process.cwd;
    // Mock cwd so hook-logger writes to our tmp .planning/logs/
    process.cwd = () => tmpDir;
    // Clear cached project root so resolveProjectRoot() re-discovers from tmpDir
    clearRootCache();
  });

  afterEach(() => {
    process.cwd = origCwd;
  });

  test('decision extraction writes audit log with feature and action fields', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'decisions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { decision_journal: true } }));

    const agentOutput = 'DECISION: Use fs.readFileSync instead of async because simplicity matters.';
    handleDecisionExtraction(path.join(tmpDir, '.planning'), agentOutput, 'executor');

    const logPath = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    const entries = lines.map(l => JSON.parse(l));
    const decisionEntry = entries.find(e => e.decision === 'decisions-extracted');
    expect(decisionEntry).toBeDefined();
    expect(decisionEntry.feature).toBe('decision_journal');
    expect(decisionEntry.action).toBe('extract');
    expect(decisionEntry.count).toBeGreaterThanOrEqual(1);
    expect(decisionEntry.ts).toBeDefined();
  });

  test('negative knowledge extraction writes audit log with feature and action fields', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'negative-knowledge'), { recursive: true });
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '05-features');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'),
      '---\nstatus: failed\ngaps:\n  - Missing test coverage\n---\n\n### Gap: Missing test coverage\nFiles: tests/foo.test.js\nExpected tests for foo module but none found\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { negative_knowledge: true } }));

    extractNegativeKnowledge(path.join(tmpDir, '.planning'), phaseDir,
      { features: { negative_knowledge: true } });

    const logPath = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    const entries = lines.map(l => JSON.parse(l));
    const nkEntry = entries.find(e => e.decision === 'negative-knowledge-extracted');
    expect(nkEntry).toBeDefined();
    expect(nkEntry.feature).toBe('negative_knowledge');
    expect(nkEntry.action).toBe('extract');
    expect(nkEntry.count).toBeGreaterThanOrEqual(1);
    expect(nkEntry.ts).toBeDefined();
  });

  test('audit entries contain required fields: hook, feature, action, count, timestamp', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'decisions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ features: { decision_journal: true } }));

    const agentOutput = 'Locked Decision: Chose CJS over ESM because compatibility matters.';
    handleDecisionExtraction(path.join(tmpDir, '.planning'), agentOutput, 'planner');

    const logPath = path.join(tmpDir, '.planning', 'logs', 'hooks.jsonl');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    const entries = lines.map(l => JSON.parse(l));
    const entry = entries.find(e => e.decision === 'decisions-extracted');
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty('hook', 'event-handler');
    expect(entry).toHaveProperty('feature', 'decision_journal');
    expect(entry).toHaveProperty('action', 'extract');
    expect(entry).toHaveProperty('count');
    expect(entry).toHaveProperty('ts');
  });
});

// ─── Combined output ─────────────────────────────────────────────────────────

describe('phase05_features — combined', () => {
  test('includes all 3 features in phase05_features section', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'decisions'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'negative-knowledge'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      '# Requirements\n\n- REQ-F-001: Test\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        features: {
          decision_journal: true,
          negative_knowledge: true,
          living_requirements: true
        }
      }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = parseOutput();
    expect(out.phase05_features).toBeDefined();
    expect(out.phase05_features.decision_journal).toBeDefined();
    expect(out.phase05_features.negative_knowledge).toBeDefined();
    expect(out.phase05_features.living_requirements).toBeDefined();
    expect(out.phase05_features.decision_journal.status).toBe('healthy');
    expect(out.phase05_features.negative_knowledge.status).toBe('healthy');
    expect(out.phase05_features.living_requirements.status).toBe('healthy');
  });
});
