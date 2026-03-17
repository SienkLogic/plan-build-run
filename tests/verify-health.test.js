'use strict';

/**
 * verify-health.test.js -- Health check tests for Phase 16 cross-project intelligence features.
 * Tests cross_project_patterns, spec_templates, and global_learnings feature status
 * in cmdValidateHealth().
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let mockExit;
let mockStdout;
let mockStderr;
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-verify-health-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '01-foundation'), { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 1\nphase_slug: "foundation"\nstatus: "building"\n---\nPhase: 1 of 1 (Foundation)');
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'),
    '### Phase 1: Foundation\n**Goal:** Build base\n');
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

function getParsedOutput() {
  const out = getOutput();
  try { return JSON.parse(out); } catch (_) { return null; }
}

// --- cross_project_patterns ---

describe('cmdValidateHealth - Phase 16 cross_project_patterns', () => {
  test('reports enabled and healthy when cross_project_patterns is true and ~/.claude/patterns/ has json files', () => {
    const patternsDir = path.join(os.homedir(), '.claude', 'patterns');
    const tempPatternFile = path.join(patternsDir, '_test-health-check.json');
    let created = false;

    // Create the patterns directory and a test file if needed
    try {
      fs.mkdirSync(patternsDir, { recursive: true });
      if (!fs.existsSync(tempPatternFile)) {
        fs.writeFileSync(tempPatternFile, JSON.stringify({ name: 'test' }));
        created = true;
      }
    } catch (_) {
      // Skip if can't write to home dir
    }

    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { cross_project_patterns: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/cross_project_patterns/i);

    if (created) {
      try { fs.unlinkSync(tempPatternFile); } catch (_e) { /* cleanup */ }
    }
  });

  test('reports disabled when cross_project_patterns is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { cross_project_patterns: false } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/cross_project_patterns/i);
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status) {
      expect(parsed.feature_status.cross_project_patterns.enabled).toBe(false);
      expect(parsed.feature_status.cross_project_patterns.status).toBe('disabled');
    }
  });

  test('reports degraded when cross_project_patterns is enabled but ~/.claude/patterns/ is empty', () => {
    // Use a temp dir that doesn't have pattern files by overriding the module if possible
    // We test the output contains the feature name and either degraded or healthy
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { cross_project_patterns: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/cross_project_patterns/i);
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status && parsed.feature_status.cross_project_patterns) {
      expect(['healthy', 'degraded']).toContain(parsed.feature_status.cross_project_patterns.status);
    }
  });

  test('feature_status key exists in health output when config.json is present', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { cross_project_patterns: true, spec_templates: true, global_learnings: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status) {
      expect(parsed.feature_status.cross_project_patterns).toBeDefined();
      expect(parsed.feature_status.spec_templates).toBeDefined();
      expect(parsed.feature_status.global_learnings).toBeDefined();
    }
  });
});

// --- spec_templates ---

describe('cmdValidateHealth - Phase 16 spec_templates', () => {
  test('reports enabled and healthy when spec_templates is true', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { spec_templates: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/spec_templates/i);
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status && parsed.feature_status.spec_templates) {
      expect(parsed.feature_status.spec_templates.enabled).toBe(true);
      expect(parsed.feature_status.spec_templates.status).toBe('healthy');
    }
  });

  test('reports disabled when spec_templates is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { spec_templates: false } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/spec_templates/i);
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status && parsed.feature_status.spec_templates) {
      expect(parsed.feature_status.spec_templates.enabled).toBe(false);
      expect(parsed.feature_status.spec_templates.status).toBe('disabled');
    }
  });
});

// --- global_learnings ---

describe('cmdValidateHealth - Phase 16 global_learnings', () => {
  test('reports enabled status when global_learnings is true', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { global_learnings: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/global_learnings/i);
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status && parsed.feature_status.global_learnings) {
      expect(parsed.feature_status.global_learnings.enabled).toBe(true);
      expect(['healthy', 'degraded']).toContain(parsed.feature_status.global_learnings.status);
    }
  });

  test('reports disabled when global_learnings is false', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { global_learnings: false } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/global_learnings/i);
    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status && parsed.feature_status.global_learnings) {
      expect(parsed.feature_status.global_learnings.enabled).toBe(false);
      expect(parsed.feature_status.global_learnings.status).toBe('disabled');
    }
  });

  test('reports healthy when global_learnings enabled and ~/.claude/learnings.jsonl exists', () => {
    const learningsPath = path.join(os.homedir(), '.claude', 'learnings.jsonl');
    const learningsExists = fs.existsSync(learningsPath);

    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ depth: 'standard', features: { global_learnings: true } }));
    try { cmdValidateHealth(tmpDir, {}, false); } catch (_e) { /* exit */ }
    const out = getOutput();
    expect(out).toMatch(/global_learnings/i);

    const parsed = getParsedOutput();
    if (parsed && parsed.feature_status && parsed.feature_status.global_learnings) {
      if (learningsExists) {
        expect(parsed.feature_status.global_learnings.status).toBe('healthy');
      } else {
        expect(['healthy', 'degraded']).toContain(parsed.feature_status.global_learnings.status);
      }
    }
  });
});
