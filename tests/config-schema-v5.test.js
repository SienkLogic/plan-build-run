/**
 * Tests for Phase 1 feature toggles, Phase 7 trust/confidence toggles,
 * and config properties in config-schema.json
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_PLUGIN = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json');
const SCHEMA_BIN = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json');

describe('Config Schema v5 — Phase 1 feature properties', () => {
  let schema;

  beforeAll(() => {
    const raw = fs.readFileSync(SCHEMA_PLUGIN, 'utf-8');
    schema = JSON.parse(raw);
  });

  describe('Feature toggles in features.properties', () => {
    test('enhanced_session_start is a boolean with default true', () => {
      const prop = schema.properties.features.properties.enhanced_session_start;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('boolean');
      expect(prop.default).toBe(true);
    });

    test('context_quality_scoring is a boolean with default true', () => {
      const prop = schema.properties.features.properties.context_quality_scoring;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('boolean');
      expect(prop.default).toBe(true);
    });

    test('skip_rag is a boolean with default false', () => {
      const prop = schema.properties.features.properties.skip_rag;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('boolean');
      expect(prop.default).toBe(false);
    });
  });

  describe('Top-level config properties', () => {
    test('skip_rag_max_lines is an integer with min 1000, max 500000, default 50000', () => {
      const prop = schema.properties.skip_rag_max_lines;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(1000);
      expect(prop.maximum).toBe(500000);
      expect(prop.default).toBe(50000);
    });

    test('orchestrator_budget_pct is an integer with min 15, max 50, default 25', () => {
      const prop = schema.properties.orchestrator_budget_pct;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(15);
      expect(prop.maximum).toBe(50);
      expect(prop.default).toBe(25);
    });
  });

  describe('Schema copy consistency', () => {
    test('plugins/pbr/scripts/config-schema.json and plan-build-run/bin/config-schema.json are identical', () => {
      const pluginRaw = fs.readFileSync(SCHEMA_PLUGIN, 'utf-8');
      const binRaw = fs.readFileSync(SCHEMA_BIN, 'utf-8');
      const pluginParsed = JSON.parse(pluginRaw);
      const binParsed = JSON.parse(binRaw);
      expect(pluginParsed).toEqual(binParsed);
    });
  });
});

describe('Config Schema v5 — Trust tracking and confidence calibration toggles', () => {
  const SCHEMA_PATHS = [
    { path: SCHEMA_PLUGIN, label: 'plugins/pbr' },
    { path: SCHEMA_BIN, label: 'plan-build-run/bin' }
  ];

  for (const { path: schemaPath, label } of SCHEMA_PATHS) {
    describe(`${label}/config-schema.json`, () => {
      const schema = require(schemaPath);
      const features = schema.properties.features.properties;

      test('has trust_tracking boolean toggle', () => {
        expect(features.trust_tracking).toBeDefined();
        expect(features.trust_tracking.type).toBe('boolean');
      });

      test('trust_tracking defaults to true', () => {
        expect(features.trust_tracking.default).toBe(true);
      });

      test('has confidence_calibration boolean toggle', () => {
        expect(features.confidence_calibration).toBeDefined();
        expect(features.confidence_calibration.type).toBe('boolean');
      });

      test('confidence_calibration defaults to true', () => {
        expect(features.confidence_calibration.default).toBe(true);
      });
    });
  }
});

describe('Config Schema v5 — Phase 11 spec-driven development toggles', () => {
  const SCHEMA_PATHS = [
    { path: SCHEMA_PLUGIN, label: 'plugins/pbr' },
    { path: SCHEMA_BIN, label: 'plan-build-run/bin' }
  ];

  for (const { path: schemaPath, label } of SCHEMA_PATHS) {
    describe(`${label}/config-schema.json`, () => {
      const schema = require(schemaPath);
      const features = schema.properties.features.properties;

      test('machine_executable_plans is boolean with default false', () => {
        expect(features.machine_executable_plans).toBeDefined();
        expect(features.machine_executable_plans.type).toBe('boolean');
        expect(features.machine_executable_plans.default).toBe(false);
      });

      test('spec_diffing is boolean with default true', () => {
        expect(features.spec_diffing).toBeDefined();
        expect(features.spec_diffing.type).toBe('boolean');
        expect(features.spec_diffing.default).toBe(true);
      });

      test('reverse_spec is boolean with default true', () => {
        expect(features.reverse_spec).toBeDefined();
        expect(features.reverse_spec.type).toBe('boolean');
        expect(features.reverse_spec.default).toBe(true);
      });

      test('predictive_impact is boolean with default true', () => {
        expect(features.predictive_impact).toBeDefined();
        expect(features.predictive_impact.type).toBe('boolean');
        expect(features.predictive_impact.default).toBe(true);
      });

      test('all 4 Phase 11 toggles exist in schema', () => {
        const phase11 = ['machine_executable_plans', 'spec_diffing', 'reverse_spec', 'predictive_impact'];
        for (const toggle of phase11) {
          expect(features[toggle]).toBeDefined();
        }
      });
    });
  }
});
