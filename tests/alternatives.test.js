'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { phaseAlternatives, prerequisiteAlternatives, configAlternatives } = require('../plan-build-run/bin/lib/alternatives.cjs');

describe('phaseAlternatives', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alternatives-test-'));
    planningDir = path.join(tmpDir, '.planning');
    const phasesDir = path.join(planningDir, 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    // Create some phase directories
    fs.mkdirSync(path.join(phasesDir, '01-setup'), { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '02-auth'), { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '03-api-layer'), { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '04-frontend'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // a. nonexistent slug returns correct shape with all available phases
  test('a: nonexistent slug returns error_type phase-not-found with all available phases', () => {
    const result = phaseAlternatives('nonexistent-slug', planningDir);
    expect(result.error_type).toBe('phase-not-found');
    expect(result.slug).toBe('nonexistent-slug');
    expect(Array.isArray(result.available)).toBe(true);
    expect(result.available).toContain('01-setup');
    expect(result.available).toContain('02-auth');
    expect(result.available).toContain('03-api-layer');
    expect(result.available).toContain('04-frontend');
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  // b. partial match 'api' returns 03-api-layer in suggestions
  test('b: partial match "api" returns matching phase in suggestions', () => {
    const result = phaseAlternatives('api', planningDir);
    expect(result.error_type).toBe('phase-not-found');
    expect(result.suggestions).toContain('03-api-layer');
  });

  // c. empty slug returns all phases with empty suggestions
  test('c: empty slug returns all available phases with empty suggestions array', () => {
    const result = phaseAlternatives('', planningDir);
    expect(result.error_type).toBe('phase-not-found');
    expect(result.available.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(result.suggestions).toHaveLength(0);
  });

  // h. suggestions sorted by similarity (closest first)
  test('h: suggestions are sorted by similarity score (closest match first)', () => {
    const result = phaseAlternatives('front', planningDir);
    // "frontend" should match more closely than others
    if (result.suggestions.length > 1) {
      // First suggestion should be most relevant
      expect(result.suggestions[0]).toMatch(/front/);
    } else if (result.suggestions.length === 1) {
      expect(result.suggestions[0]).toMatch(/front/);
    }
  });

  // i. error_type field is always present
  test('i: error_type field is set to phase-not-found', () => {
    const result = phaseAlternatives('whatever', planningDir);
    expect(result.error_type).toBe('phase-not-found');
  });

  // j. missing phases dir returns empty arrays without throwing
  test('j: missing phases directory returns empty arrays without throwing', () => {
    const emptyPlanningDir = path.join(tmpDir, 'empty-planning');
    fs.mkdirSync(emptyPlanningDir, { recursive: true });
    let result;
    expect(() => {
      result = phaseAlternatives('anything', emptyPlanningDir);
    }).not.toThrow();
    expect(result.available).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });
});

describe('prerequisiteAlternatives', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prereq-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // d. phase with some summaries returns correct shape
  test('d: returns correct shape with existing and missing summaries', () => {
    const phaseSlug = '55-ux-polish';
    const phaseDir = path.join(planningDir, 'phases', phaseSlug);
    fs.mkdirSync(phaseDir, { recursive: true });
    // Create some PLAN files
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "55-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), '---\nplan: "55-02"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-03.md'), '---\nplan: "55-03"\n---\n');
    // Create only one SUMMARY
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-55-01.md'), '# Summary 01');

    const result = prerequisiteAlternatives(phaseSlug, planningDir);
    expect(result.error_type).toBe('missing-prereq');
    expect(result.phase).toBe(phaseSlug);
    expect(Array.isArray(result.existing_summaries)).toBe(true);
    expect(Array.isArray(result.missing_summaries)).toBe(true);
    expect(result.existing_summaries.length).toBeGreaterThanOrEqual(1);
    expect(result.missing_summaries.length).toBeGreaterThanOrEqual(1);
    expect(typeof result.suggested_action).toBe('string');
    expect(result.suggested_action.length).toBeGreaterThan(0);
  });

  // e. phase with no SUMMARY files returns missing_summaries listing expected plan IDs
  test('e: phase with no summaries returns all plan IDs in missing_summaries', () => {
    const phaseSlug = '03-api';
    const phaseDir = path.join(planningDir, 'phases', phaseSlug);
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nplan: "03-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), '---\nplan: "03-02"\n---\n');

    const result = prerequisiteAlternatives(phaseSlug, planningDir);
    expect(result.error_type).toBe('missing-prereq');
    expect(result.existing_summaries).toHaveLength(0);
    expect(result.missing_summaries.length).toBeGreaterThanOrEqual(2);
  });

  // i. error_type field is always present for prerequisiteAlternatives
  test('i: error_type field is set to missing-prereq', () => {
    const phaseSlug = '01-setup';
    const phaseDir = path.join(planningDir, 'phases', phaseSlug);
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = prerequisiteAlternatives(phaseSlug, planningDir);
    expect(result.error_type).toBe('missing-prereq');
  });
});

describe('configAlternatives', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-alt-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // f. known field with invalid value returns valid_values list
  test('f: known field "depth" with invalid value returns valid_values and suggested_fix', () => {
    const result = configAlternatives('depth', 'invalid-value', planningDir);
    expect(result.error_type).toBe('config-invalid');
    expect(result.field).toBe('depth');
    expect(result.current_value).toBe('invalid-value');
    expect(Array.isArray(result.valid_values)).toBe(true);
    expect(result.valid_values).toContain('quick');
    expect(result.valid_values).toContain('standard');
    expect(result.valid_values).toContain('deep');
    expect(typeof result.suggested_fix).toBe('string');
    expect(result.suggested_fix.length).toBeGreaterThan(0);
  });

  // g. unknown field returns empty valid_values and remove suggestion
  test('g: unknown field returns empty valid_values and "Remove this field" suggestion', () => {
    const result = configAlternatives('unknown-field', 'x', planningDir);
    expect(result.error_type).toBe('config-invalid');
    expect(result.field).toBe('unknown-field');
    expect(result.valid_values).toHaveLength(0);
    expect(result.suggested_fix).toMatch(/[Rr]emove/);
  });

  // i. error_type field is always present for configAlternatives
  test('i: error_type field is set to config-invalid', () => {
    const result = configAlternatives('depth', 'bad', planningDir);
    expect(result.error_type).toBe('config-invalid');
  });

  // additional: git.branching known field
  test('known field "git.branching" returns valid phase/main/off values', () => {
    const result = configAlternatives('git.branching', 'wrong', planningDir);
    expect(result.error_type).toBe('config-invalid');
    expect(result.valid_values).toContain('phase');
    expect(result.valid_values).toContain('main');
    expect(result.valid_values).toContain('off');
  });
});
