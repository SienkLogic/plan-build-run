'use strict';

const {
  tryParseJSON,
  categorizeError,
  isDisabled,
  recordFailure,
  resetCircuit,
  complete
} = require('../plugins/pbr/scripts/local-llm/client');

// ---------------------------------------------------------------------------
// tryParseJSON
// ---------------------------------------------------------------------------
describe('tryParseJSON', () => {
  test('parses valid JSON directly', () => {
    const result = tryParseJSON('{"x":1}');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ x: 1 });
  });

  test('extracts JSON from markdown code block', () => {
    const input = '```json\n{"a":"b"}\n```';
    const result = tryParseJSON(input);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ a: 'b' });
  });

  test('extracts JSON from markdown code block without language tag', () => {
    const input = '```\n{"c":3}\n```';
    const result = tryParseJSON(input);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ c: 3 });
  });

  test('extracts first {…} from mixed text', () => {
    const result = tryParseJSON('result: {"y":2} done');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ y: 2 });
  });

  test('returns ok: false for unparseable text', () => {
    const result = tryParseJSON('not json at all');
    expect(result.ok).toBe(false);
  });

  test('returns ok: false for empty string', () => {
    const result = tryParseJSON('');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// categorizeError
// ---------------------------------------------------------------------------
describe('categorizeError', () => {
  test('categorizes ECONNREFUSED via cause.code', () => {
    const err = new Error('fetch failed');
    err.cause = { code: 'ECONNREFUSED' };
    const result = categorizeError(err);
    expect(result.type).toBe('ECONNREFUSED');
  });

  test('categorizes ECONNREFUSED via message', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const result = categorizeError(err);
    expect(result.type).toBe('ECONNREFUSED');
  });

  test('categorizes timeout via TimeoutError name', () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    const result = categorizeError(err);
    expect(result.type).toBe('timeout');
  });

  test('categorizes timeout via AbortError name', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const result = categorizeError(err);
    expect(result.type).toBe('timeout');
  });

  test('categorizes http_error via HTTP prefix in message', () => {
    const err = new Error('HTTP 500: internal server error');
    const result = categorizeError(err);
    expect(result.type).toBe('http_error');
  });

  test('categorizes json_parse for SyntaxError', () => {
    const err = new SyntaxError('bad');
    const result = categorizeError(err);
    expect(result.type).toBe('json_parse');
  });

  test('categorizes wrong_answer for unrecognized error', () => {
    const err = new Error('something weird happened');
    const result = categorizeError(err);
    expect(result.type).toBe('wrong_answer');
  });

  test('returns message property', () => {
    const err = new Error('my error message');
    err.name = 'TimeoutError';
    const result = categorizeError(err);
    expect(result.message).toBe('my error message');
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------
describe('circuit breaker', () => {
  beforeEach(() => {
    resetCircuit('test-op');
  });

  test('not disabled initially', () => {
    expect(isDisabled('test-op', 3)).toBe(false);
  });

  test('not disabled before maxFailures is reached', () => {
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    expect(isDisabled('test-op', 3)).toBe(false);
  });

  test('disables after maxFailures', () => {
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    expect(isDisabled('test-op', 3)).toBe(true);
  });

  test('resetCircuit clears state', () => {
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    resetCircuit('test-op');
    expect(isDisabled('test-op', 3)).toBe(false);
  });

  test('does not disable before maxFailures', () => {
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    expect(isDisabled('test-op', 3)).toBe(false);
  });

  test('circuit states are isolated per operation type', () => {
    recordFailure('op-a', 3);
    recordFailure('op-a', 3);
    recordFailure('op-a', 3);
    expect(isDisabled('op-a', 3)).toBe(true);
    expect(isDisabled('op-b', 3)).toBe(false);
    resetCircuit('op-a');
  });
});

// ---------------------------------------------------------------------------
// complete — unit (mocked fetch)
// ---------------------------------------------------------------------------
describe('complete — unit', () => {
  const baseConfig = {
    endpoint: 'http://localhost:11434',
    model: 'test:7b',
    timeout_ms: 3000,
    max_retries: 0
  };

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
    resetCircuit('test-op');
    resetCircuit('test-op-retry');
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns content on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { completion_tokens: 5 }
      })
    });

    const result = await complete(baseConfig, 'test prompt', 'test-op');

    expect(result.content).toBe('{"ok":true}');
    expect(result.tokens).toBe(5);
    expect(typeof result.latency_ms).toBe('number');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test('throws when circuit is open', async () => {
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);
    recordFailure('test-op', 3);

    await expect(complete(baseConfig, 'test prompt', 'test-op')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('records failure on ECONNREFUSED', async () => {
    const connErr = new Error('fetch failed');
    connErr.cause = { code: 'ECONNREFUSED' };
    global.fetch.mockRejectedValueOnce(connErr);

    try {
      await complete(baseConfig, 'test prompt', 'test-op');
    } catch (_err) {
      // expected
    }

    // After 1 ECONNREFUSED failure, circuit should have 1 failure recorded
    // It should not be disabled yet (threshold is 3 by default)
    expect(isDisabled('test-op', 1)).toBe(true); // 1 failure >= 1 threshold
    resetCircuit('test-op');
  });

  test('retries on timeout', async () => {
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';

    global.fetch
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"retried":true}' } }],
          usage: { completion_tokens: 3 }
        })
      });

    const configWithRetry = { ...baseConfig, max_retries: 1 };
    const result = await complete(configWithRetry, 'test prompt', 'test-op-retry');

    expect(result.content).toBe('{"retried":true}');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws on http error after exhausting retries', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error'
    });

    await expect(complete(baseConfig, 'test prompt', 'test-op')).rejects.toThrow(/HTTP 500/);
  });

  test('uses endpoint from config', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{}' } }],
        usage: { completion_tokens: 1 }
      })
    });

    const customConfig = { ...baseConfig, endpoint: 'http://custom-host:11434' };
    await complete(customConfig, 'prompt', 'test-op');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://custom-host:11434'),
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// complete — integration (requires Ollama)
// ---------------------------------------------------------------------------
const RUN_INTEGRATION = process.env.LOCAL_LLM_AVAILABLE === '1';
(RUN_INTEGRATION ? describe : describe.skip)('complete — integration (requires Ollama)', () => {
  const integrationConfig = {
    endpoint: 'http://localhost:11434',
    model: 'qwen2.5-coder:7b',
    timeout_ms: 30000,
    max_retries: 1
  };

  beforeEach(() => {
    resetCircuit('integration-op');
  });

  test('classifies JSON correctly', async () => {
    const prompt = 'Classify this as pass or fail. Respond with JSON: {"result":"pass"} or {"result":"fail"}. Input: "hello world"';
    const result = await complete(integrationConfig, prompt, 'integration-op');

    expect(typeof result.content).toBe('string');
    const parsed = tryParseJSON(result.content);
    expect(parsed.ok).toBe(true);
  });
});
