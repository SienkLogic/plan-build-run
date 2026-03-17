/**
 * Tests for graduated verification and self-verification config schema properties.
 * Validates that config-schema.json accepts graduated_verification, self_verification,
 * and autonomy.level with correct types, defaults, and enum values.
 */

const fs = require('fs');
const path = require('path');
const { validateObject } = require('../plugins/pbr/scripts/lib/core');

const SCHEMA_PATH = path.resolve(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json');

function loadSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function validate(config) {
  const schema = loadSchema();
  const errors = [];
  const warnings = [];
  validateObject(config, schema, '', errors, warnings);
  return { errors, warnings };
}

describe('config-schema graduated verification properties', () => {
  test('validates features.graduated_verification as boolean', () => {
    const schema = loadSchema();
    const prop = schema.properties.features.properties.graduated_verification;
    expect(prop).toBeDefined();
    expect(prop.type).toBe('boolean');
  });

  test('validates features.self_verification as boolean', () => {
    const schema = loadSchema();
    const prop = schema.properties.features.properties.self_verification;
    expect(prop).toBeDefined();
    expect(prop.type).toBe('boolean');
  });

  test('validates autonomy.level as enum with 4 values', () => {
    const schema = loadSchema();
    const autonomy = schema.properties.autonomy;
    expect(autonomy).toBeDefined();
    expect(autonomy.properties.level).toBeDefined();
    expect(autonomy.properties.level.enum).toEqual([
      'supervised', 'guided', 'collaborative', 'adaptive'
    ]);
  });

  test('rejects invalid autonomy.level value', () => {
    const { errors } = validate({
      version: 2,
      autonomy: { level: 'invalid_value' }
    });
    expect(errors.some(e => e.includes('autonomy') || e.includes('level'))).toBe(true);
  });

  test('defaults: graduated_verification=true, self_verification=true, autonomy.level=supervised', () => {
    const schema = loadSchema();
    const features = schema.properties.features.properties;
    expect(features.graduated_verification.default).toBe(true);
    expect(features.self_verification.default).toBe(true);
    expect(schema.properties.autonomy.properties.level.default).toBe('supervised');
  });

  test('accepts valid autonomy.level values without errors', () => {
    const validLevels = ['supervised', 'guided', 'collaborative', 'adaptive'];
    for (const level of validLevels) {
      const { errors } = validate({
        version: 2,
        autonomy: { level }
      });
      const autonomyErrors = errors.filter(e => e.includes('autonomy'));
      expect(autonomyErrors).toEqual([]);
    }
  });

  test('accepts graduated_verification and self_verification as booleans', () => {
    const { errors } = validate({
      version: 2,
      features: {
        graduated_verification: true,
        self_verification: false
      }
    });
    const featureErrors = errors.filter(e =>
      e.includes('graduated_verification') || e.includes('self_verification')
    );
    expect(featureErrors).toEqual([]);
  });
});
