'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const { resolveConfig, checkHealth, warmUp } = require('../plugins/pbr/scripts/local-llm/health');

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------
describe('resolveConfig', () => {
  test('returns all defaults when called with undefined', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe('ollama');
    expect(cfg.endpoint).toBe('http://localhost:11434');
    expect(cfg.model).toBe('qwen2.5-coder:7b');
    expect(cfg.timeout_ms).toBe(3000);
    expect(cfg.max_retries).toBe(1);
  });

  test('merges user values over defaults', () => {
    const cfg = resolveConfig({ model: 'phi4-mini', timeout_ms: 5000 });
    expect(cfg.model).toBe('phi4-mini');
    expect(cfg.timeout_ms).toBe(5000);
    expect(cfg.enabled).toBe(false);
    expect(cfg.endpoint).toBe('http://localhost:11434');
  });

  test('advanced defaults include num_ctx: 4096', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.advanced.num_ctx).toBe(4096);
  });

  test('advanced defaults include keep_alive: "30m"', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.advanced.keep_alive).toBe('30m');
  });

  test('partial advanced override merges correctly', () => {
    const cfg = resolveConfig({ advanced: { num_ctx: 8192 } });
    expect(cfg.advanced.num_ctx).toBe(8192);
    expect(cfg.advanced.keep_alive).toBe('30m');
  });

  test('features defaults: artifact_classification true, plan_adequacy false', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.features.artifact_classification).toBe(true);
    expect(cfg.features.plan_adequacy).toBe(false);
  });

  test('partial features override merges correctly', () => {
    const cfg = resolveConfig({ features: { plan_adequacy: true } });
    expect(cfg.features.plan_adequacy).toBe(true);
    expect(cfg.features.artifact_classification).toBe(true);
  });

  test('enabled can be set to true', () => {
    const cfg = resolveConfig({ enabled: true });
    expect(cfg.enabled).toBe(true);
  });

  test('max_retries defaults to 1', () => {
    const cfg = resolveConfig(undefined);
    expect(cfg.max_retries).toBe(1);
  });

  test('max_retries: 0 is respected (not defaulted)', () => {
    const cfg = resolveConfig({ max_retries: 0 });
    expect(cfg.max_retries).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkHealth
// ---------------------------------------------------------------------------
describe('checkHealth', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns available: false, reason: disabled when enabled is false', async () => {
    const cfg = resolveConfig(undefined); // enabled: false
    const result = await checkHealth(cfg);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns reason: not_running when server unreachable (ECONNREFUSED)', async () => {
    const connErr = new Error('fetch failed');
    connErr.cause = { code: 'ECONNREFUSED' };
    global.fetch.mockRejectedValueOnce(connErr);

    const cfg = resolveConfig({ enabled: true });
    const result = await checkHealth(cfg);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('not_running');
  });

  test('returns reason: not_running when server times out on root check', async () => {
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    global.fetch.mockRejectedValueOnce(timeoutErr);

    const cfg = resolveConfig({ enabled: true });
    const result = await checkHealth(cfg);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('not_running');
  });

  test('returns reason: model_missing when model not in list', async () => {
    // Step 1: GET / — OK with Ollama body
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'Ollama is running'
    });
    // Step 2: GET /api/version
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '0.12.0' })
    });
    // Step 3: GET /v1/models — model NOT present
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'llama3:8b' }] })
    });

    const cfg = resolveConfig({ enabled: true, model: 'qwen2.5-coder:7b' });
    const result = await checkHealth(cfg);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('model_missing');
  });

  test('returns available: true with warm: true on healthy server', async () => {
    // Step 1: GET /
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'Ollama is running'
    });
    // Step 2: GET /api/version
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '0.12.11' })
    });
    // Step 3: GET /v1/models — model present
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'qwen2.5-coder:7b' }] })
    });
    // Step 4: POST /v1/chat/completions — warm-up probe succeeds
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"status":"ok"}' } }] })
    });

    const cfg = resolveConfig({ enabled: true, model: 'qwen2.5-coder:7b' });
    const result = await checkHealth(cfg);

    expect(result.available).toBe(true);
    expect(result.warm).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.model).toBe('qwen2.5-coder:7b');
    expect(result.version).toBe('0.12.11');
  });

  test('returns available: true with warm: false on cold model (timeout)', async () => {
    // Step 1: GET /
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'Ollama is running'
    });
    // Step 2: GET /api/version
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '0.12.11' })
    });
    // Step 3: GET /v1/models — model present
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'qwen2.5-coder:7b' }] })
    });
    // Step 4: warm-up probe times out
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    global.fetch.mockRejectedValueOnce(timeoutErr);

    const cfg = resolveConfig({ enabled: true, model: 'qwen2.5-coder:7b' });
    const result = await checkHealth(cfg);

    expect(result.available).toBe(true);
    expect(result.warm).toBe(false);
    expect(result.reason).toBe('ok');
  });

  test('never throws — wraps unexpected errors', async () => {
    global.fetch.mockImplementationOnce(() => {
      throw new Error('unexpected');
    });

    const cfg = resolveConfig({ enabled: true });
    const result = await checkHealth(cfg);

    expect(result.available).toBe(false);
    expect(result.reason).toBe('unknown_error');
  });

  test('version falls back to null when version endpoint fails', async () => {
    // Step 1: GET / — OK
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'Ollama is running'
    });
    // Step 2: GET /api/version — fails (non-fatal)
    global.fetch.mockRejectedValueOnce(new Error('version endpoint gone'));
    // Step 3: GET /v1/models — model NOT present
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] })
    });

    const cfg = resolveConfig({ enabled: true, model: 'qwen2.5-coder:7b' });
    const result = await checkHealth(cfg);

    // version endpoint failure is non-fatal — should continue to model check
    expect(result.available).toBe(false);
    expect(result.reason).toBe('model_missing');
  });
});

// ---------------------------------------------------------------------------
// warmUp
// ---------------------------------------------------------------------------
describe('warmUp', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('calls fetch and swallows errors', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network gone'));

    const cfg = resolveConfig({ enabled: true });
    // Should resolve without throwing
    await expect(warmUp(cfg)).resolves.toBeUndefined();
  });

  test('calls fetch with correct endpoint', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    });

    const cfg = resolveConfig({ enabled: true, endpoint: 'http://localhost:11434' });
    await warmUp(cfg);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.any(Object)
    );
  });

  test('swallows unexpected synchronous errors', async () => {
    global.fetch.mockImplementationOnce(() => {
      throw new Error('sync error');
    });

    const cfg = resolveConfig({ enabled: true });
    await expect(warmUp(cfg)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Temp directory pattern (validates os/fs/path imports work correctly)
// ---------------------------------------------------------------------------
describe('temp directory pattern', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-llm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates temp directory successfully', () => {
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(tmpDir).toContain('pbr-llm-');
  });
});
