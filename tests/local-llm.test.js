const fs = require('fs');
const path = require('path');
const os = require('os');

describe('local-llm.js', () => {
  let tmpDir;
  let planningDir;
  let configPath;
  let originalCwd;
  let originalFetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'towline-llm-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    configPath = path.join(planningDir, 'config.json');
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    originalFetch = global.fetch;
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(localLlm) {
    fs.writeFileSync(configPath, JSON.stringify({ local_llm: localLlm }));
  }

  function getLlm() {
    return require('../plugins/dev/scripts/local-llm');
  }

  describe('isAvailable', () => {
    test('returns false when config has enabled: false', async () => {
      writeConfig({ enabled: false });
      const { isAvailable } = getLlm();
      expect(await isAvailable()).toBe(false);
    });

    test('returns false when config is missing', async () => {
      // Don't write any config — loadConfig will catch the ENOENT
      const { isAvailable } = getLlm();
      expect(await isAvailable()).toBe(false);
    });

    test('returns false when fetch fails', async () => {
      writeConfig({ enabled: true, endpoint: 'http://127.0.0.1:11434' });
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const { isAvailable } = getLlm();
      expect(await isAvailable()).toBe(false);
    });

    test('returns true when endpoint responds ok', async () => {
      writeConfig({ enabled: true, endpoint: 'http://127.0.0.1:11434' });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      const { isAvailable } = getLlm();
      expect(await isAvailable()).toBe(true);
    });

    test('caches result for 60s', async () => {
      writeConfig({ enabled: true, endpoint: 'http://127.0.0.1:11434' });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      const { isAvailable } = getLlm();

      await isAvailable(); // First call
      await isAvailable(); // Second call - should use cache

      // fetch should only have been called once (for the /v1/models endpoint)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('query', () => {
    test('sends correct request body', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434',
        model: 'test-model',
        timeout_ms: 5000
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test response' } }]
        })
      });

      const { query } = getLlm();
      const result = await query('system prompt', 'user message');

      expect(result.ok).toBe(true);
      expect(result.result).toBe('test response');

      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://127.0.0.1:11434/v1/chat/completions');
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('test-model');
      expect(body.messages).toEqual([
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user message' }
      ]);
      expect(body.stream).toBe(false);
    });

    test('returns ok: false on failure with skip fallback', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434',
        fallback: 'skip'
      });
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const { query } = getLlm();
      const result = await query('sys', 'user');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection refused');
      expect(result.result).toBeNull();
    });

    test('throws on failure with error fallback', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434',
        fallback: 'error'
      });
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const { query } = getLlm();
      await expect(query('sys', 'user')).rejects.toThrow('Local LLM error');
    });

    test('returns error for HTTP error status', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434',
        fallback: 'skip'
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      const { query } = getLlm();
      const result = await query('sys', 'user');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('HTTP 500');
    });

    test('returns skip result when not enabled', async () => {
      writeConfig({ enabled: false });
      const { query } = getLlm();
      const result = await query('sys', 'user');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Local LLM not enabled');
    });

    test('respects model override in opts', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434',
        model: 'default-model'
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }]
        })
      });

      const { query } = getLlm();
      await query('sys', 'user', { model: 'override-model' });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.model).toBe('override-model');
    });
  });

  describe('classify', () => {
    test('builds correct system prompt with categories', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434'
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'bug' } }]
        })
      });

      const { classify } = getLlm();
      const result = await classify('fix the login bug', ['bug', 'feature', 'refactor']);

      expect(result.ok).toBe(true);
      expect(result.result).toBe('bug');

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('bug, feature, refactor');
      expect(body.messages[0].content).toContain('Classify');
      expect(body.temperature).toBe(0);
      expect(body.max_tokens).toBe(50);
    });
  });

  describe('summarize', () => {
    test('builds correct system prompt for summarization', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434'
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'A summary' } }]
        })
      });

      const { summarize } = getLlm();
      const result = await summarize('Long text to summarize', 100);

      expect(result.ok).toBe(true);
      expect(result.result).toBe('A summary');

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('Summarize');
      expect(body.max_tokens).toBe(100);
    });

    test('uses default max_tokens of 200', async () => {
      writeConfig({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434'
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Summary' } }]
        })
      });

      const { summarize } = getLlm();
      await summarize('text');

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(200);
    });
  });
});
