'use strict';

const {
  DIMENSIONS,
  CATEGORIES,
  PRESETS,
  getDimensionById,
  getDimensionBySlug,
  getDimensionsByCategory,
  getActivePresetCategories,
  resolveDimensions,
  explainResolution,
} = require('../plugins/pbr/scripts/audit-dimensions');

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------
describe('module exports', () => {
  test('exports DIMENSIONS as a non-empty array', async () => {
    expect(Array.isArray(DIMENSIONS)).toBe(true);
    expect(DIMENSIONS.length).toBeGreaterThan(0);
  });

  test('exports CATEGORIES as an object with expected keys', async () => {
    expect(typeof CATEGORIES).toBe('object');
    expect(CATEGORIES).toHaveProperty('AC', 'audit_config');
    expect(CATEGORIES).toHaveProperty('SI', 'self_integrity');
    expect(CATEGORIES).toHaveProperty('IH', 'infrastructure');
    expect(CATEGORIES).toHaveProperty('EF', 'error_analysis');
    expect(CATEGORIES).toHaveProperty('WC', 'workflow_compliance');
    expect(CATEGORIES).toHaveProperty('BC', 'behavioral_compliance');
    expect(CATEGORIES).toHaveProperty('SQ', 'session_quality');
    expect(CATEGORIES).toHaveProperty('FV', 'feature_verification');
    expect(CATEGORIES).toHaveProperty('QM', 'quality_metrics');
  });

  test('exports PRESETS with expected preset names', async () => {
    expect(PRESETS).toHaveProperty('minimal');
    expect(PRESETS).toHaveProperty('standard');
    expect(PRESETS).toHaveProperty('comprehensive');
    expect(PRESETS).toHaveProperty('custom');
  });

  test('exports all expected functions', async () => {
    expect(typeof getDimensionById).toBe('function');
    expect(typeof getDimensionBySlug).toBe('function');
    expect(typeof getDimensionsByCategory).toBe('function');
    expect(typeof getActivePresetCategories).toBe('function');
    expect(typeof resolveDimensions).toBe('function');
    expect(typeof explainResolution).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Dimension schema validation
// ---------------------------------------------------------------------------
describe('dimension schema', () => {
  test('every dimension has required fields', async () => {
    for (const d of DIMENSIONS) {
      expect(d).toHaveProperty('id');
      expect(d).toHaveProperty('code');
      expect(d).toHaveProperty('slug');
      expect(d).toHaveProperty('category');
      expect(d).toHaveProperty('categoryCode');
      expect(d).toHaveProperty('severity');
      expect(d).toHaveProperty('description');
      expect(d).toHaveProperty('phaseOrigin');
      expect(d).toHaveProperty('source', 'builtin');
      expect(d).toHaveProperty('thresholdKey');
    }
  });

  test('dimension id matches code:slug pattern', async () => {
    for (const d of DIMENSIONS) {
      expect(d.id).toBe(`${d.code}:${d.slug}`);
    }
  });

  test('severity is one of error, warning, info', () => {
    const validSeverities = ['error', 'warning', 'info'];
    for (const d of DIMENSIONS) {
      expect(validSeverities).toContain(d.severity);
    }
  });

  test('no duplicate dimension codes', async () => {
    const codes = DIMENSIONS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('no duplicate dimension ids', async () => {
    const ids = DIMENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('categoryCode matches the prefix of code', async () => {
    for (const d of DIMENSIONS) {
      expect(d.code.startsWith(d.categoryCode + '-')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------
describe('CATEGORIES', () => {
  test('every dimension category exists in CATEGORIES values', async () => {
    const catValues = new Set(Object.values(CATEGORIES));
    for (const d of DIMENSIONS) {
      expect(catValues.has(d.category)).toBe(true);
    }
  });

  test('every dimension categoryCode exists in CATEGORIES keys', async () => {
    const catKeys = new Set(Object.keys(CATEGORIES));
    for (const d of DIMENSIONS) {
      expect(catKeys.has(d.categoryCode)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// PRESETS
// ---------------------------------------------------------------------------
describe('PRESETS', () => {
  test('minimal preset contains a subset of standard', async () => {
    for (const cat of PRESETS.minimal) {
      expect(PRESETS.standard).toContain(cat);
    }
  });

  test('standard preset contains a subset of comprehensive', async () => {
    for (const cat of PRESETS.standard) {
      expect(PRESETS.comprehensive).toContain(cat);
    }
  });

  test('comprehensive preset covers all category values', async () => {
    const allCats = Object.values(CATEGORIES);
    for (const cat of allCats) {
      expect(PRESETS.comprehensive).toContain(cat);
    }
  });

  test('custom preset is an empty array', async () => {
    expect(PRESETS.custom).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDimensionById
// ---------------------------------------------------------------------------
describe('getDimensionById', () => {
  test('finds dimension by full id', async () => {
    const d = getDimensionById('SI-01:skill-template-refs');
    expect(d).toBeDefined();
    expect(d.code).toBe('SI-01');
    expect(d.slug).toBe('skill-template-refs');
  });

  test('finds dimension by short code', async () => {
    const d = getDimensionById('AC-01');
    expect(d).toBeDefined();
    expect(d.category).toBe('audit_config');
  });

  test('returns undefined for unknown id', async () => {
    expect(getDimensionById('ZZ-99')).toBeUndefined();
  });

  test('returns undefined for empty string', async () => {
    expect(getDimensionById('')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getDimensionBySlug
// ---------------------------------------------------------------------------
describe('getDimensionBySlug', () => {
  test('finds dimension by slug', async () => {
    const d = getDimensionBySlug('hook-server-health');
    expect(d).toBeDefined();
    expect(d.code).toBe('IH-01');
  });

  test('returns undefined for unknown slug', async () => {
    expect(getDimensionBySlug('nonexistent-slug')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getDimensionsByCategory
// ---------------------------------------------------------------------------
describe('getDimensionsByCategory', () => {
  test('returns dimensions for self_integrity', async () => {
    const dims = getDimensionsByCategory('self_integrity');
    expect(dims.length).toBeGreaterThan(0);
    for (const d of dims) {
      expect(d.category).toBe('self_integrity');
    }
  });

  test('returns dimensions for audit_config', async () => {
    const dims = getDimensionsByCategory('audit_config');
    expect(dims.length).toBe(1);
    expect(dims[0].code).toBe('AC-01');
  });

  test('returns empty array for invalid category', async () => {
    expect(getDimensionsByCategory('nonexistent')).toEqual([]);
  });

  test('returns empty array for empty string', async () => {
    expect(getDimensionsByCategory('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getActivePresetCategories
// ---------------------------------------------------------------------------
describe('getActivePresetCategories', () => {
  test('returns categories for minimal preset', async () => {
    const cats = getActivePresetCategories('minimal');
    expect(cats).toEqual(['self_integrity', 'infrastructure']);
  });

  test('returns categories for standard preset', async () => {
    const cats = getActivePresetCategories('standard');
    expect(cats).toContain('self_integrity');
    expect(cats).toContain('workflow_compliance');
  });

  test('returns empty array for unknown preset', async () => {
    expect(getActivePresetCategories('unknown')).toEqual([]);
  });

  test('returns empty array for custom preset', async () => {
    expect(getActivePresetCategories('custom')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveDimensions
// ---------------------------------------------------------------------------
describe('resolveDimensions', () => {
  test('defaults to standard preset with no config or flags', async () => {
    const dims = resolveDimensions({}, {});
    const standardCats = new Set(PRESETS.standard);
    for (const d of dims) {
      expect(standardCats.has(d.category)).toBe(true);
    }
    expect(dims.length).toBeGreaterThan(0);
  });

  test('results are sorted by code', async () => {
    const dims = resolveDimensions({}, {});
    for (let i = 1; i < dims.length; i++) {
      expect(dims[i].code.localeCompare(dims[i - 1].code)).toBeGreaterThanOrEqual(0);
    }
  });

  test('respects preset flag', async () => {
    const dims = resolveDimensions({}, { preset: 'minimal' });
    const minimalCats = new Set(PRESETS.minimal);
    for (const d of dims) {
      expect(minimalCats.has(d.category)).toBe(true);
    }
  });

  test('respects config.audit.preset', async () => {
    const config = { audit: { preset: 'comprehensive' } };
    const dims = resolveDimensions(config, {});
    // comprehensive includes all categories
    expect(dims.length).toBe(DIMENSIONS.length);
  });

  test('cli preset overrides config preset', async () => {
    const config = { audit: { preset: 'comprehensive' } };
    const dims = resolveDimensions(config, { preset: 'minimal' });
    const minimalCats = new Set(PRESETS.minimal);
    for (const d of dims) {
      expect(minimalCats.has(d.category)).toBe(true);
    }
  });

  test('category toggle disables a category', async () => {
    const config = {
      audit: {
        preset: 'standard',
        categories: { self_integrity: false },
      },
    };
    const dims = resolveDimensions(config, {});
    for (const d of dims) {
      expect(d.category).not.toBe('self_integrity');
    }
  });

  test('category toggle enables an extra category', async () => {
    const config = {
      audit: {
        preset: 'minimal',
        categories: { behavioral_compliance: true },
      },
    };
    const dims = resolveDimensions(config, {});
    const cats = new Set(dims.map((d) => d.category));
    expect(cats.has('behavioral_compliance')).toBe(true);
  });

  test('override disables a specific dimension', async () => {
    const config = {
      audit: {
        preset: 'comprehensive',
        overrides: { 'SI-01': false },
      },
    };
    const dims = resolveDimensions(config, {});
    const codes = dims.map((d) => d.code);
    expect(codes).not.toContain('SI-01');
  });

  test('override enables a dimension from a disabled category', async () => {
    const config = {
      audit: {
        preset: 'minimal',
        overrides: { 'BC-01': true },
      },
    };
    const dims = resolveDimensions(config, {});
    const codes = dims.map((d) => d.code);
    expect(codes).toContain('BC-01');
  });

  test('--dimension flag adds specific dimensions', async () => {
    const dims = resolveDimensions({}, { preset: 'minimal', dimension: ['QM-01'] });
    const codes = dims.map((d) => d.code);
    expect(codes).toContain('QM-01');
  });

  test('--skip flag removes specific dimensions', async () => {
    const dims = resolveDimensions({}, { preset: 'standard', skip: ['SI-01'] });
    const codes = dims.map((d) => d.code);
    expect(codes).not.toContain('SI-01');
  });

  test('--only flag overrides everything', async () => {
    const dims = resolveDimensions(
      { audit: { preset: 'comprehensive' } },
      { only: ['SI-01', 'AC-01'] }
    );
    expect(dims.length).toBe(2);
    const codes = dims.map((d) => d.code);
    expect(codes).toContain('SI-01');
    expect(codes).toContain('AC-01');
  });

  test('--only with unknown dimension ignores it', async () => {
    const dims = resolveDimensions({}, { only: ['SI-01', 'FAKE-99'] });
    expect(dims.length).toBe(1);
    expect(dims[0].code).toBe('SI-01');
  });

  test('--only deduplicates dimensions', async () => {
    const dims = resolveDimensions({}, { only: ['SI-01', 'SI-01:skill-template-refs'] });
    expect(dims.length).toBe(1);
  });

  test('handles null config gracefully', async () => {
    const dims = resolveDimensions(null, {});
    expect(Array.isArray(dims)).toBe(true);
    expect(dims.length).toBeGreaterThan(0);
  });

  test('handles null cliFlags gracefully', async () => {
    const dims = resolveDimensions({}, null);
    expect(Array.isArray(dims)).toBe(true);
    expect(dims.length).toBeGreaterThan(0);
  });

  test('--skip with slug works', async () => {
    const dims = resolveDimensions({}, { preset: 'standard', skip: ['skill-template-refs'] });
    const codes = dims.map((d) => d.code);
    expect(codes).not.toContain('SI-01');
  });

  test('--dimension with slug works', async () => {
    const dims = resolveDimensions({}, { preset: 'minimal', dimension: ['session-degradation'] });
    const codes = dims.map((d) => d.code);
    expect(codes).toContain('QM-01');
  });
});

// ---------------------------------------------------------------------------
// explainResolution
// ---------------------------------------------------------------------------
describe('explainResolution', () => {
  test('returns array of strings', async () => {
    const steps = explainResolution({}, {});
    expect(Array.isArray(steps)).toBe(true);
    for (const s of steps) {
      expect(typeof s).toBe('string');
    }
  });

  test('last step contains Final count', async () => {
    const steps = explainResolution({}, {});
    expect(steps[steps.length - 1]).toMatch(/^Final:/);
  });

  test('reports preset name used', async () => {
    const steps = explainResolution({}, { preset: 'minimal' });
    expect(steps[0]).toContain("'minimal'");
  });

  test('--only produces override explanation', async () => {
    const steps = explainResolution({}, { only: ['SI-01'] });
    expect(steps[0]).toContain('--only override');
    expect(steps[1]).toContain('Final: 1');
  });

  test('category disable is explained', async () => {
    const config = {
      audit: {
        preset: 'standard',
        categories: { self_integrity: false },
      },
    };
    const steps = explainResolution(config, {});
    const disableStep = steps.find((s) => s.includes("'self_integrity' disabled"));
    expect(disableStep).toBeDefined();
  });

  test('category enable is explained', async () => {
    const config = {
      audit: {
        preset: 'minimal',
        categories: { behavioral_compliance: true },
      },
    };
    const steps = explainResolution(config, {});
    const enableStep = steps.find((s) => s.includes("'behavioral_compliance' enabled"));
    expect(enableStep).toBeDefined();
  });

  test('--skip is explained', async () => {
    const steps = explainResolution({}, { preset: 'standard', skip: ['SI-01'] });
    const skipStep = steps.find((s) => s.includes('--skip SI-01'));
    expect(skipStep).toBeDefined();
  });

  test('--dimension add is explained', async () => {
    const steps = explainResolution({}, { preset: 'minimal', dimension: ['QM-01'] });
    const addStep = steps.find((s) => s.includes('--dimension QM-01'));
    expect(addStep).toBeDefined();
  });

  test('override disable is explained', async () => {
    const config = {
      audit: {
        preset: 'standard',
        overrides: { 'SI-01': false },
      },
    };
    const steps = explainResolution(config, {});
    const overrideStep = steps.find((s) => s.includes('Override SI-01 disabled'));
    expect(overrideStep).toBeDefined();
  });

  test('handles null config gracefully', async () => {
    const steps = explainResolution(null, {});
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
  });
});
