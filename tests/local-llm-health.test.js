'use strict';

/**
 * Local LLM health stub tests.
 *
 * The full health/config implementation is deferred to v3 (ADV-01).
 * These tests verify that the health.cjs stub's resolveConfig function
 * exists and returns expected defaults.
 */

const { resolveConfig } = require('../plugins/pbr/scripts/lib/local-llm/health');

describe('resolveConfig (stub)', () => {
  test('returns enabled: false by default', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.enabled).toBe(false);
  });

  test('returns provider: none by default', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.provider).toBe('none');
  });

  test('merges user values over defaults', () => {
    const cfg = resolveConfig({ model: 'phi4-mini', enabled: true });
    expect(cfg.model).toBe('phi4-mini');
    expect(cfg.enabled).toBe(true);
  });

  test('returns object when called with undefined', () => {
    const cfg = resolveConfig(undefined);
    expect(typeof cfg).toBe('object');
    expect(cfg).not.toBeNull();
  });

  test('returns object when called with null', () => {
    const cfg = resolveConfig(null);
    expect(typeof cfg).toBe('object');
    expect(cfg.enabled).toBe(false);
  });

  test('returns object when called with empty object', () => {
    const cfg = resolveConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe('none');
  });

  test('enabled can be set to true', () => {
    const cfg = resolveConfig({ enabled: true });
    expect(cfg.enabled).toBe(true);
  });
});
