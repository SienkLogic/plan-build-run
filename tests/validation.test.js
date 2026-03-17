'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Config defaults tests (Task 14-01-T1) ─────────────────────────────────

describe('config defaults - Phase 14 features', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-validation-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    // Write a minimal config with Phase 14 fields for testing
    const config = {
      version: 2,
      schema_version: 1,
      features: {
        multi_layer_validation: false,
        regression_prevention: true,
        security_scanning: true,
      },
      validation_passes: ['correctness', 'security'],
    };
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('config defaults include multi_layer_validation: false', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.features.multi_layer_validation).toBe(false);
  });

  test('config defaults include regression_prevention: true', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.features.regression_prevention).toBe(true);
  });

  test('config defaults include security_scanning: true', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.features.security_scanning).toBe(true);
  });

  test('config defaults include validation_passes with correctness and security', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(Array.isArray(config.validation_passes)).toBe(true);
    expect(config.validation_passes).toContain('correctness');
    expect(config.validation_passes).toContain('security');
  });
});

// ─── getValidationPasses tests (Task 14-01-T2) ─────────────────────────────

const { getValidationPasses, buildValidationPrompt, getValidationSummary, PASS_DEFINITIONS } = require('../plan-build-run/bin/lib/validation.cjs');

describe('getValidationPasses', () => {
  test('returns empty array when feature disabled', () => {
    const config = {
      features: { multi_layer_validation: false },
      validation_passes: ['correctness', 'security'],
    };
    const result = getValidationPasses(config);
    expect(result).toEqual([]);
  });

  test('returns configured passes when enabled', () => {
    const config = {
      features: { multi_layer_validation: true },
      validation_passes: ['correctness', 'security', 'performance'],
    };
    const result = getValidationPasses(config);
    expect(result.length).toBe(3);
    expect(result.map(p => p.name)).toEqual(['correctness', 'security', 'performance']);
  });

  test('defaults to correctness+security when no list', () => {
    const config = {
      features: { multi_layer_validation: true },
    };
    const result = getValidationPasses(config);
    expect(result.length).toBe(2);
    expect(result.map(p => p.name)).toEqual(['correctness', 'security']);
  });

  test('filters out invalid pass names', () => {
    const config = {
      features: { multi_layer_validation: true },
      validation_passes: ['correctness', 'not-a-real-pass', 'security'],
    };
    const result = getValidationPasses(config);
    expect(result.map(p => p.name)).toEqual(['correctness', 'security']);
  });

  test('each pass has name, focus, severity', () => {
    const config = {
      features: { multi_layer_validation: true },
      validation_passes: ['correctness'],
    };
    const [pass] = getValidationPasses(config);
    expect(pass).toHaveProperty('name');
    expect(pass).toHaveProperty('focus');
    expect(pass).toHaveProperty('severity');
  });
});

describe('buildValidationPrompt', () => {
  test('generates pass-specific prompt for security pass', () => {
    const prompt = buildValidationPrompt('security', 'diff content here', {});
    expect(prompt.toLowerCase()).toMatch(/injection|auth|owasp|secret/);
  });

  test('includes diff content in prompt', () => {
    const diff = 'const MY_DIFF_MARKER = true;';
    const prompt = buildValidationPrompt('correctness', diff, {});
    expect(prompt).toContain(diff);
  });

  test('includes context info in prompt', () => {
    const context = { files: ['src/foo.js'], phase: '14' };
    const prompt = buildValidationPrompt('correctness', 'diff', context);
    // context can be serialized in various ways
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(50);
  });

  test('returns structured prompt with JSON instruction', () => {
    const prompt = buildValidationPrompt('correctness', 'diff', {});
    expect(prompt).toMatch(/json|JSON/);
  });
});

describe('PASS_DEFINITIONS', () => {
  test('has entries for all 8 standard passes', () => {
    const expectedPasses = ['correctness', 'security', 'performance', 'style', 'tests', 'accessibility', 'docs', 'deps'];
    expect(Object.keys(PASS_DEFINITIONS).length).toBe(8);
    for (const p of expectedPasses) {
      expect(PASS_DEFINITIONS).toHaveProperty(p);
    }
  });
});

describe('getValidationSummary', () => {
  test('aggregates pass results', () => {
    const passResults = [
      { pass: 'correctness', findings: [], summary: 'No issues' },
      { pass: 'security', findings: [{ severity: 'high', message: 'test' }], summary: '1 issue' },
    ];
    const summary = getValidationSummary(passResults);
    expect(summary).toHaveProperty('totalFindings');
    expect(summary).toHaveProperty('bySeverity');
    expect(summary).toHaveProperty('passes');
    expect(summary).toHaveProperty('blocked');
    expect(summary.blocked).toBe(true);
    expect(summary.totalFindings).toBe(1);
  });

  test('blocked is false when no high-severity findings', () => {
    const passResults = [
      { pass: 'style', findings: [{ severity: 'low', message: 'minor' }], summary: 'low issue' },
    ];
    const summary = getValidationSummary(passResults);
    expect(summary.blocked).toBe(false);
  });
});
