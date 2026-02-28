'use strict';

/**
 * Tests for localhost-only validation of local_llm.endpoint in configValidate().
 */

const { configValidate } = require('../../plugins/pbr/scripts/lib/config');

function makeConfig(localLlm) {
  return {
    version: 2,
    schema_version: 1,
    mode: 'interactive',
    local_llm: localLlm
  };
}

describe('configValidate — local_llm.endpoint localhost validation', () => {
  test('accepts localhost endpoint', () => {
    const result = configValidate(makeConfig({ enabled: true, endpoint: 'http://localhost:11434' }));
    expect(result.errors.filter(e => e.includes('local_llm.endpoint'))).toHaveLength(0);
  });

  test('accepts 127.0.0.1 endpoint', () => {
    const result = configValidate(makeConfig({ enabled: true, endpoint: 'http://127.0.0.1:11434' }));
    expect(result.errors.filter(e => e.includes('local_llm.endpoint'))).toHaveLength(0);
  });

  test('accepts ::1 IPv6 endpoint', () => {
    const result = configValidate(makeConfig({ enabled: true, endpoint: 'http://[::1]:11434' }));
    expect(result.errors.filter(e => e.includes('local_llm.endpoint'))).toHaveLength(0);
  });

  test('rejects remote hostname when enabled', () => {
    const result = configValidate(makeConfig({ enabled: true, endpoint: 'http://192.168.1.100:11434' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('localhost') && e.includes('local_llm.endpoint'))).toBe(true);
  });

  test('rejects external domain when enabled', () => {
    const result = configValidate(makeConfig({ enabled: true, endpoint: 'http://my-llm-server.example.com:11434' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('local_llm.endpoint'))).toBe(true);
  });

  test('skips endpoint validation when local_llm.enabled is false', () => {
    const result = configValidate(makeConfig({ enabled: false, endpoint: 'http://remote.example.com:11434' }));
    expect(result.errors.filter(e => e.includes('local_llm.endpoint'))).toHaveLength(0);
  });
});
