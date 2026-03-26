// lib/schema.js — Lightweight JSON Schema validator for Plan-Build-Run tools.

/**
 * Validate an object against a simple JSON Schema subset.
 * Supports type, enum, properties, additionalProperties, minimum, maximum.
 *
 * @param {*} value - Value to validate
 * @param {object} schema - JSON Schema subset
 * @param {string} prefix - Path prefix for error messages
 * @param {string[]} errors - Array to push errors to
 * @param {string[]} warnings - Array to push warnings to
 */
function validateObject(value, schema, prefix, errors, warnings) {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = typeof value;
    const typeMatch = types.some(t => {
      if (t === 'integer') return actualType === 'number' && Number.isInteger(value);
      return actualType === t;
    });
    if (!typeMatch) {
      errors.push(`${prefix || 'root'}: expected ${types.join('|')}, got ${actualType}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${prefix || 'root'}: value "${value}" not in allowed values [${schema.enum.join(', ')}]`);
    return;
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${prefix || 'root'}: value ${value} is below minimum ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${prefix || 'root'}: value ${value} is above maximum ${schema.maximum}`);
  }

  if (schema.type === 'object' && schema.properties) {
    const knownKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(value)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (!knownKeys.has(key)) {
        if (schema.additionalProperties === false) {
          warnings.push(`${fullKey}: unrecognized key (possible typo?)`);
        }
        continue;
      }
      validateObject(value[key], schema.properties[key], fullKey, errors, warnings);
    }
  }
}

module.exports = { validateObject };
