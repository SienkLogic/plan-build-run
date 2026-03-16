const fs = require('fs');
const path = require('path');

const schema = require('../plan-build-run/bin/config-schema.json');
const PLUGIN_ROOT = path.join(__dirname, '..', 'plan-build-run');

describe('model-selection', () => {
  describe('config schema structure', () => {
    const complexityMap = schema.properties.models.properties.complexity_map;

    test('complexity_map exists in models schema', () => {
      expect(complexityMap).toBeDefined();
    });

    test('complexity_map has simple, medium, complex properties', () => {
      expect(complexityMap.properties).toHaveProperty('simple');
      expect(complexityMap.properties).toHaveProperty('medium');
      expect(complexityMap.properties).toHaveProperty('complex');
    });

    test('each complexity level has type string', () => {
      expect(complexityMap.properties.simple.type).toBe('string');
      expect(complexityMap.properties.medium.type).toBe('string');
      expect(complexityMap.properties.complex.type).toBe('string');
    });

    test('complexity_map does not allow additional properties', () => {
      expect(complexityMap.additionalProperties).toBe(false);
    });

    test('complexity_map defaults are haiku, sonnet, inherit', () => {
      expect(complexityMap.properties.simple.default).toBe('haiku');
      expect(complexityMap.properties.medium.default).toBe('sonnet');
      expect(complexityMap.properties.complex.default).toBe('inherit');
    });
  });

  describe('planner complexity attribute documentation', () => {
    const plannerContent = fs.readFileSync(
      path.join(__dirname, '..', 'agents', 'pbr-planner.md'),
      'utf8'
    );

    test('planner includes complexity attribute in task XML format', () => {
      expect(plannerContent).toContain('complexity=');
    });

    test('planner documents all three complexity values', () => {
      expect(plannerContent).toContain('`simple`');
      expect(plannerContent).toContain('`medium`');
      expect(plannerContent).toContain('`complex`');
    });

    test('planner includes complexity annotation section', () => {
      expect(plannerContent).toContain('### Complexity Annotation');
    });

    test('planner documents heuristics', () => {
      expect(plannerContent).toContain('**Heuristics**');
    });
  });

  describe('build skill model selection documentation', () => {
    const buildContent = fs.readFileSync(
      path.join(PLUGIN_ROOT, 'skills', 'build', 'SKILL.md'),
      'utf8'
    );

    test('build skill contains Model Selection (Adaptive) section', () => {
      expect(buildContent).toContain('Model Selection (Adaptive)');
    });

    test('build skill references complexity_map', () => {
      expect(buildContent).toContain('complexity_map');
    });

    test('build skill documents override precedence', () => {
      // Explicit model attribute takes precedence
      expect(buildContent).toContain('explicit `model` attribute');
      // Then complexity_map lookup
      expect(buildContent).toContain('config.models.complexity_map');
      // Then models.executor override
      expect(buildContent).toContain('config.models.executor');
    });
  });

  describe('model_profiles config schema', () => {
    test('config-schema.json has model_profiles property', () => {
      expect(schema.properties.model_profiles).toBeDefined();
      expect(schema.properties.model_profiles.type).toBe('object');
    });

    test('model_profiles additionalProperties schema accepts agent keys', () => {
      const profileSchema = schema.properties.model_profiles.additionalProperties;
      expect(profileSchema).toBeDefined();
      expect(profileSchema.properties.researcher).toBeDefined();
      expect(profileSchema.properties.executor).toBeDefined();
      expect(profileSchema.properties.planner).toBeDefined();
    });
  });

  // Skipped: references/model-selection.md not ported (superseded by model-profiles.md and model-profile-resolution.md)
  describe.skip('reference doc consistency', () => {
    test('reference doc documents all three complexity levels', () => {});
    test('reference doc documents all three override mechanisms', () => {});
    test('reference doc explains how it works', () => {});
    test('reference doc includes default mapping table', () => {});
  });
});
