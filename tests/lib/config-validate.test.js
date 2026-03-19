'use strict';

/**
 * Tests for local_llm deprecation in configValidate().
 * Endpoint validation removed in phase 53 — local_llm feature deprecated.
 */

const { configValidate } = require('../../plan-build-run/bin/lib/config.cjs');

function makeConfig(localLlm) {
  return {
    version: 2,
    schema_version: 1,
    mode: 'interactive',
    local_llm: localLlm
  };
}

describe('configValidate — local_llm deprecation', () => {
  test('local_llm.enabled=true produces deprecation warning', () => {
    const result = configValidate(makeConfig({ enabled: true }));
    expect(result.warnings.some(w => w.includes('deprecated'))).toBe(true);
  });

  test('local_llm.enabled=false produces no deprecation warning', () => {
    const result = configValidate(makeConfig({ enabled: false }));
    expect(result.warnings.filter(w => w.includes('local_llm')).length).toBe(0);
  });

  test('local_llm.enabled=true with endpoint still only produces deprecation', () => {
    const result = configValidate(makeConfig({ enabled: true, endpoint: 'http://remote.example.com:11434' }));
    // No endpoint errors — only deprecation warning
    expect(result.errors.filter(e => e.includes('local_llm')).length).toBe(0);
    expect(result.warnings.some(w => w.includes('deprecated'))).toBe(true);
  });

  test('skips deprecation warning when local_llm.enabled is false', () => {
    const result = configValidate(makeConfig({ enabled: false, endpoint: 'http://remote.example.com:11434' }));
    expect(result.warnings.filter(w => w.includes('local_llm')).length).toBe(0);
  });
});
