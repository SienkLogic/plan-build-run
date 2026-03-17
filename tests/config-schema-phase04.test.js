/**
 * Phase 04 config schema tests — NL routing, adaptive ceremony, ceremony_level
 */
const schema = require('../plugins/pbr/scripts/config-schema.json');

describe('Phase 04 config schema properties', () => {
  const features = schema.properties.features.properties;

  describe('features.natural_language_routing', () => {
    it('exists and is boolean', () => {
      expect(features.natural_language_routing).toBeDefined();
      expect(features.natural_language_routing.type).toBe('boolean');
    });

    it('defaults to true', () => {
      expect(features.natural_language_routing.default).toBe(true);
    });
  });

  describe('features.adaptive_ceremony', () => {
    it('exists and is boolean', () => {
      expect(features.adaptive_ceremony).toBeDefined();
      expect(features.adaptive_ceremony.type).toBe('boolean');
    });

    it('defaults to true', () => {
      expect(features.adaptive_ceremony.default).toBe(true);
    });
  });

  describe('ceremony_level', () => {
    const ceremony = schema.properties.ceremony_level;

    it('exists at top level', () => {
      expect(ceremony).toBeDefined();
    });

    it('is a string enum with [auto, low, medium, high]', () => {
      expect(ceremony.type).toBe('string');
      expect(ceremony.enum).toEqual(['auto', 'low', 'medium', 'high']);
    });

    it('defaults to auto', () => {
      expect(ceremony.default).toBe('auto');
    });
  });

  describe('schema integrity', () => {
    it('features still has additionalProperties: false', () => {
      expect(schema.properties.features.additionalProperties).toBe(false);
    });

    it('top-level still has additionalProperties: false', () => {
      expect(schema.additionalProperties).toBe(false);
    });
  });
});
