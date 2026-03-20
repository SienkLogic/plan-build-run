'use strict';

const schema = require('../plugins/pbr/scripts/config-schema.json');

describe('Phase 06 config toggles', () => {
  const features = schema.properties.features.properties;

  describe('features.convention_memory', () => {
    test('exists and is boolean', () => {
      expect(features.convention_memory).toBeDefined();
      expect(features.convention_memory.type).toBe('boolean');
    });

    test('defaults to true', () => {
      expect(features.convention_memory.default).toBe(true);
    });

    test('has a description', () => {
      expect(typeof features.convention_memory.description).toBe('string');
      expect(features.convention_memory.description.length).toBeGreaterThan(10);
    });
  });

  describe('features.mental_model_snapshots', () => {
    test('exists and is boolean', () => {
      expect(features.mental_model_snapshots).toBeDefined();
      expect(features.mental_model_snapshots.type).toBe('boolean');
    });

    test('defaults to true', () => {
      expect(features.mental_model_snapshots.default).toBe(true);
    });

    test('has a description', () => {
      expect(typeof features.mental_model_snapshots.description).toBe('string');
      expect(features.mental_model_snapshots.description.length).toBeGreaterThan(10);
    });
  });

  describe('features object constraints', () => {
    test('additionalProperties is false', () => {
      expect(schema.properties.features.additionalProperties).toBe(false);
    });
  });
});
