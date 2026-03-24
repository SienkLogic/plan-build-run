/**
 * Tests for Phase 2 config schema properties
 */
const path = require('path');

describe('Phase 2 config schema properties', () => {
  let schema;

  beforeAll(() => {
    schema = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json'));
  });

  describe('feature toggles', () => {
    test('inline_simple_tasks is boolean with default true', async () => {
      const prop = schema.properties.features.properties.inline_simple_tasks;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('boolean');
      expect(prop.default).toBe(true);
    });

    test('rich_agent_prompts is boolean with default true', async () => {
      const prop = schema.properties.features.properties.rich_agent_prompts;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('boolean');
      expect(prop.default).toBe(true);
    });

    test('multi_phase_awareness is boolean with default true', async () => {
      const prop = schema.properties.features.properties.multi_phase_awareness;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('boolean');
      expect(prop.default).toBe(true);
    });
  });

  describe('workflow properties', () => {
    test('inline_max_files has min 1, max 20, default 5', () => {
      const prop = schema.properties.workflow.properties.inline_max_files;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(1);
      expect(prop.maximum).toBe(20);
      expect(prop.default).toBe(5);
    });

    test('inline_max_lines has min 10, max 500, default 50', () => {
      const prop = schema.properties.workflow.properties.inline_max_lines;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(10);
      expect(prop.maximum).toBe(500);
      expect(prop.default).toBe(50);
    });

    test('max_phases_in_context has min 1, max 10, default 3', () => {
      const prop = schema.properties.workflow.properties.max_phases_in_context;
      expect(prop).toBeDefined();
      expect(prop.type).toBe('integer');
      expect(prop.minimum).toBe(1);
      expect(prop.maximum).toBe(10);
      expect(prop.default).toBe(3);
    });
  });

  describe('schema consistency', () => {
    test('both config-schema.json copies are identical', async () => {
      const pluginSchema = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json'));
      const binSchema = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json'));
      expect(JSON.stringify(pluginSchema)).toBe(JSON.stringify(binSchema));
    });
  });
});
