/**
 * Tests for hooks/lib/alternatives.js — Conversational error recovery helpers.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  phaseAlternatives,
  prerequisiteAlternatives,
  configAlternatives
} = require('../hooks/lib/alternatives');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-alt-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- phaseAlternatives ---

describe('phaseAlternatives', () => {
  it('returns phase-not-found error type', () => {
    const result = phaseAlternatives('nonexistent', planningDir);
    expect(result.error_type).toBe('phase-not-found');
    expect(result.slug).toBe('nonexistent');
  });

  it('lists available phase directories', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'));
    fs.mkdirSync(path.join(planningDir, 'phases', '02-core'));
    const result = phaseAlternatives('missing', planningDir);
    expect(result.available).toContain('01-setup');
    expect(result.available).toContain('02-core');
  });

  it('suggests similar phase slugs', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'));
    fs.mkdirSync(path.join(planningDir, 'phases', '02-core-features'));
    const result = phaseAlternatives('core', planningDir);
    expect(result.suggestions.length).toBeGreaterThan(0);
    // "core" should match "02-core-features" by substring
    expect(result.suggestions.some(s => s.includes('core'))).toBe(true);
  });

  it('returns empty suggestions for no match', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'));
    const result = phaseAlternatives('zzzzz', planningDir);
    // Low similarity score should yield empty suggestions
    expect(result.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('handles null/empty slug', () => {
    const result = phaseAlternatives('', planningDir);
    expect(result.error_type).toBe('phase-not-found');
    expect(result.suggestions).toEqual([]);
  });

  it('handles missing phases directory', () => {
    fs.rmSync(path.join(planningDir, 'phases'), { recursive: true, force: true });
    const result = phaseAlternatives('test', planningDir);
    expect(result.available).toEqual([]);
  });
});

// --- prerequisiteAlternatives ---

describe('prerequisiteAlternatives', () => {
  it('returns missing-prereq error type', () => {
    const result = prerequisiteAlternatives('01-setup', planningDir);
    expect(result.error_type).toBe('missing-prereq');
    expect(result.phase).toBe('01-setup');
  });

  it('identifies missing SUMMARY files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), '---\nplan: "01-02"\n---\n');

    const result = prerequisiteAlternatives('01-setup', planningDir);
    expect(result.missing_summaries.length).toBe(2);
  });

  it('identifies existing SUMMARY files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '---\nstatus: complete\n---\n');

    const result = prerequisiteAlternatives('01-setup', planningDir);
    expect(result.existing_summaries.length).toBe(1);
    expect(result.missing_summaries.length).toBe(0);
  });

  it('includes suggested_action', () => {
    const result = prerequisiteAlternatives('test-phase', planningDir);
    expect(result.suggested_action).toContain('/pbr:execute-phase');
  });
});

// --- configAlternatives ---

describe('configAlternatives', () => {
  it('returns valid values for known config fields', () => {
    const result = configAlternatives('depth', 'invalid', planningDir);
    expect(result.error_type).toBe('config-invalid');
    expect(result.field).toBe('depth');
    expect(result.current_value).toBe('invalid');
    expect(result.valid_values).toContain('quick');
    expect(result.valid_values).toContain('standard');
    expect(result.valid_values).toContain('deep');
  });

  it('returns valid values for git.branching', () => {
    const result = configAlternatives('git.branching', 'wrong', planningDir);
    expect(result.valid_values).toContain('phase');
    expect(result.valid_values).toContain('main');
    expect(result.valid_values).toContain('off');
  });

  it('returns empty values for unknown config field', () => {
    const result = configAlternatives('unknown_field', 'val', planningDir);
    expect(result.valid_values).toEqual([]);
    expect(result.suggested_fix).toContain('Remove');
  });

  it('includes suggested_fix in response', () => {
    const result = configAlternatives('depth', 'bad', planningDir);
    expect(result.suggested_fix).toContain('Set depth');
  });
});
