'use strict';

const { resolveConfig, checkHealth, warmUp } = require('../plugins/pbr/scripts/lib/local-llm/health');

// ---- resolveConfig ----

describe('resolveConfig', () => {
  test('undefined input returns all defaults', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.enabled).toBe(false);
    expect(cfg.endpoint).toBe('http://localhost:11434');
    expect(cfg.model).toBe('qwen2.5-coder:7b');
    expect(cfg.timeout_ms).toBe(3000);
    expect(cfg.max_retries).toBe(1);
    expect(cfg.fallback).toBe('frontier');
    expect(cfg.routing_strategy).toBe('local_first');
    expect(cfg.features.artifact_classification).toBe(true);
    expect(cfg.advanced.confidence_threshold).toBe(0.9);
    expect(cfg.metrics.enabled).toBe(true);
  });

  test('partial input merges with defaults', () => {
    const cfg = resolveConfig({ enabled: true, model: 'llama3:8b' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.model).toBe('llama3:8b');
    expect(cfg.endpoint).toBe('http://localhost:11434'); // default preserved
    expect(cfg.features.artifact_classification).toBe(true); // default preserved
  });

  test('full input preserves all values', () => {
    const full = {
      enabled: true,
      provider: 'custom',
      endpoint: 'http://myhost:8080',
      model: 'custom-model',
      timeout_ms: 5000,
      max_retries: 3,
      fallback: 'skip',
      routing_strategy: 'quality_first',
      features: { artifact_classification: false, plan_adequacy: true },
      metrics: { enabled: false, frontier_token_rate: 5.0 },
      advanced: { confidence_threshold: 0.8, num_ctx: 8192 }
    };
    const cfg = resolveConfig(full);
    expect(cfg.provider).toBe('custom');
    expect(cfg.endpoint).toBe('http://myhost:8080');
    expect(cfg.timeout_ms).toBe(5000);
    expect(cfg.routing_strategy).toBe('quality_first');
    expect(cfg.features.artifact_classification).toBe(false);
    expect(cfg.features.plan_adequacy).toBe(true);
    expect(cfg.metrics.frontier_token_rate).toBe(5.0);
    expect(cfg.advanced.confidence_threshold).toBe(0.8);
  });

  test('features object merges with default features', () => {
    const cfg = resolveConfig({ features: { plan_adequacy: true } });
    expect(cfg.features.plan_adequacy).toBe(true);
    expect(cfg.features.artifact_classification).toBe(true); // default preserved
    expect(cfg.features.task_validation).toBe(true); // default preserved
  });
});

// ---- checkHealth ----

describe('checkHealth', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const enabledConfig = resolveConfig({ enabled: true });

  test('returns disabled when config.enabled is false', async () => {
    const cfg = resolveConfig({ enabled: false });
    const result = await checkHealth(cfg);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('returns not_running when fetch throws ECONNREFUSED', async () => {
    const err = new Error('connect failed');
    err.cause = { code: 'ECONNREFUSED' };
    fetchSpy.mockRejectedValue(err);

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('not_running');
  });

  test('returns not_running on timeout', async () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(err);

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('not_running');
  });

  test('returns not_running when response body does not contain Ollama', async () => {
    fetchSpy.mockResolvedValueOnce({
      text: async () => 'Some other server'
    });

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('not_running');
  });

  test('returns model_missing when model not in /v1/models list', async () => {
    // Step 1: server reachable
    fetchSpy.mockResolvedValueOnce({ text: async () => 'Ollama is running' });
    // Step 2: version
    fetchSpy.mockResolvedValueOnce({ json: async () => ({ version: '0.1.0' }) });
    // Step 3: models list without the configured model
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ data: [{ id: 'other-model:7b' }] })
    });

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('model_missing');
  });

  test('returns gpu_error on 500 with GPU in body', async () => {
    // Step 1: server reachable
    fetchSpy.mockResolvedValueOnce({ text: async () => 'Ollama is running' });
    // Step 2: version
    fetchSpy.mockResolvedValueOnce({ json: async () => ({ version: '0.1.0' }) });
    // Step 3: model found
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ data: [{ id: 'qwen2.5-coder:7b' }] })
    });
    // Step 4: chat completion returns 500 with GPU error
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'GPU memory allocation failed'
    });

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('gpu_error');
  });

  test('returns available:true warm:true on full success path', async () => {
    // Step 1: server reachable
    fetchSpy.mockResolvedValueOnce({ text: async () => 'Ollama is running' });
    // Step 2: version
    fetchSpy.mockResolvedValueOnce({ json: async () => ({ version: '0.2.0' }) });
    // Step 3: model found
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ data: [{ id: 'qwen2.5-coder:7b' }] })
    });
    // Step 4: chat completion succeeds
    fetchSpy.mockResolvedValueOnce({ ok: true });

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(true);
    expect(result.warm).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.version).toBe('0.2.0');
  });

  test('returns available:true warm:false when chat completion times out', async () => {
    // Step 1: server reachable
    fetchSpy.mockResolvedValueOnce({ text: async () => 'Ollama is running' });
    // Step 2: version
    fetchSpy.mockResolvedValueOnce({ json: async () => ({ version: '0.1.0' }) });
    // Step 3: model found
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ data: [{ id: 'qwen2.5-coder:7b' }] })
    });
    // Step 4: chat completion times out (cold start)
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    fetchSpy.mockRejectedValueOnce(timeoutErr);

    const result = await checkHealth(enabledConfig);
    expect(result.available).toBe(true);
    expect(result.warm).toBe(false);
  });
});

// ---- warmUp ----

describe('warmUp', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const config = resolveConfig({ enabled: true });

  test('calls the endpoint', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true });
    await warmUp(config);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0];
    expect(url).toContain('/v1/chat/completions');
  });

  test('swallows errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
    await expect(warmUp(config)).resolves.toBeUndefined();
  });
});
