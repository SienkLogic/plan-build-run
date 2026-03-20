'use strict';

const { resolveConfig } = require('../plugins/pbr/scripts/lib/local-llm/health');

// ---- resolveConfig (canonical stub) ----

describe('resolveConfig', () => {
  test('undefined input returns defaults with enabled:false', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe('none');
  });

  test('partial input merges with defaults', () => {
    const cfg = resolveConfig({ enabled: true, model: 'llama3:8b' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.model).toBe('llama3:8b');
    expect(cfg.provider).toBe('none'); // default preserved
  });

  test('full input preserves all values', () => {
    const full = {
      enabled: true,
      provider: 'custom',
      endpoint: 'http://myhost:8080',
      model: 'custom-model',
    };
    const cfg = resolveConfig(full);
    expect(cfg.provider).toBe('custom');
    expect(cfg.endpoint).toBe('http://myhost:8080');
    expect(cfg.model).toBe('custom-model');
  });

  test('null input returns defaults', () => {
    const cfg = resolveConfig(null);
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe('none');
  });
});

// ---- checkHealth / warmUp are not exported by canonical stub ----

describe('checkHealth', () => {
  test('is not exported (stub module)', () => {
    const mod = require('../plugins/pbr/scripts/lib/local-llm/health');
    expect(mod.checkHealth).toBeUndefined();
  });
});

describe('warmUp', () => {
  test('is not exported (stub module)', () => {
    const mod = require('../plugins/pbr/scripts/lib/local-llm/health');
    expect(mod.warmUp).toBeUndefined();
  });
});
