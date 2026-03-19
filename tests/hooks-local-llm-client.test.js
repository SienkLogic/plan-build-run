'use strict';

const {
  tryParseJSON,
  categorizeError,
  isDisabled,
  recordFailure,
  resetCircuit,
  complete
} = require('../hooks/local-llm/client');

// ---- tryParseJSON ----

describe('tryParseJSON', () => {
  test('parses valid JSON string', () => {
    const result = tryParseJSON('{"key":"value"}');
    expect(result).toEqual({ ok: true, data: { key: 'value' } });
  });

  test('parses JSON wrapped in markdown code block', () => {
    const result = tryParseJSON('```json\n{"key":"value"}\n```');
    expect(result).toEqual({ ok: true, data: { key: 'value' } });
  });

  test('extracts JSON embedded in text with {...}', () => {
    const result = tryParseJSON('Here is some text {"key":"value"} more text');
    expect(result).toEqual({ ok: true, data: { key: 'value' } });
  });

  test('returns ok:false for non-JSON text', () => {
    const result = tryParseJSON('just plain text with no json');
    expect(result).toEqual({ ok: false, raw: 'just plain text with no json' });
  });

  test('handles code block without json tag', () => {
    const result = tryParseJSON('```\n{"a":1}\n```');
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });
});

// ---- categorizeError ----

describe('categorizeError', () => {
  test('ECONNREFUSED via cause.code', () => {
    const err = new Error('connect failed');
    err.cause = { code: 'ECONNREFUSED' };
    expect(categorizeError(err)).toEqual({ type: 'ECONNREFUSED', message: 'connect failed' });
  });

  test('ECONNREFUSED via message', () => {
    const err = new Error('fetch failed: ECONNREFUSED');
    expect(categorizeError(err)).toEqual({ type: 'ECONNREFUSED', message: 'fetch failed: ECONNREFUSED' });
  });

  test('TimeoutError returns timeout type', () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    expect(categorizeError(err).type).toBe('timeout');
  });

  test('AbortError returns timeout type', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(categorizeError(err).type).toBe('timeout');
  });

  test('HTTP error returns http_error type', () => {
    const err = new Error('HTTP 500: Internal Server Error');
    expect(categorizeError(err).type).toBe('http_error');
  });

  test('SyntaxError returns json_parse type', () => {
    const err = new SyntaxError('Unexpected token');
    expect(categorizeError(err).type).toBe('json_parse');
  });

  test('generic error returns wrong_answer type', () => {
    const err = new Error('something went wrong');
    expect(categorizeError(err).type).toBe('wrong_answer');
  });
});

// ---- Circuit breaker (in-memory) ----

describe('circuit breaker (in-memory)', () => {
  const OP = 'test-circuit-op';

  afterEach(() => {
    resetCircuit(OP);
  });

  test('isDisabled returns false when no failures', () => {
    expect(isDisabled(OP, 3)).toBe(false);
  });

  test('isDisabled returns true after maxFailures', () => {
    recordFailure(OP, 3);
    recordFailure(OP, 3);
    recordFailure(OP, 3);
    expect(isDisabled(OP, 3)).toBe(true);
  });

  test('resetCircuit clears the circuit', () => {
    recordFailure(OP, 3);
    recordFailure(OP, 3);
    recordFailure(OP, 3);
    expect(isDisabled(OP, 3)).toBe(true);
    resetCircuit(OP);
    expect(isDisabled(OP, 3)).toBe(false);
  });
});

// ---- complete ----

describe('complete', () => {
  const OP = 'test-complete-op';
  const config = {
    endpoint: 'http://localhost:11434',
    model: 'test-model',
    timeout_ms: 3000,
    max_retries: 1,
    advanced: { num_ctx: 4096, keep_alive: '30m', disable_after_failures: 3 }
  };

  let fetchSpy;

  beforeEach(() => {
    resetCircuit(OP);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    resetCircuit(OP);
  });

  test('successful response returns content, latency_ms, tokens', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"result":"ok"}' } }],
        usage: { completion_tokens: 42 }
      })
    });

    const result = await complete(config, 'test prompt', OP);
    expect(result.content).toBe('{"result":"ok"}');
    expect(typeof result.latency_ms).toBe('number');
    expect(result.tokens).toBe(42);
    expect(result.logprobsData).toBeNull();
  });

  test('ECONNREFUSED throws immediately without retry', async () => {
    const connErr = new Error('connect failed');
    connErr.cause = { code: 'ECONNREFUSED' };
    fetchSpy.mockRejectedValue(connErr);

    await expect(complete(config, 'test', OP)).rejects.toThrow('connect failed');
    // Should have called fetch only once (no retry for ECONNREFUSED)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Circuit should record failure
    expect(isDisabled(OP, 3)).toBe(false); // only 1 failure, need 3
  });

  test('timeout error retries then throws after max retries', async () => {
    const timeoutErr = new Error('timed out');
    timeoutErr.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(timeoutErr);

    await expect(complete(config, 'test', OP)).rejects.toThrow('timed out');
    // max_retries=1 means 2 total attempts
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('HTTP error retries then throws', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error'
    });

    await expect(complete(config, 'test', OP)).rejects.toThrow('HTTP 500');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('circuit open throws circuit_open error without calling fetch', async () => {
    // Fill up the circuit
    recordFailure(OP, 3);
    recordFailure(OP, 3);
    recordFailure(OP, 3);

    await expect(complete(config, 'test', OP)).rejects.toThrow('Circuit open');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('logprobs option passes logprobs:true in request body and returns logprobsData', async () => {
    const logprobsContent = [{ token: 'a', logprob: -0.1 }];
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"x":1}' }, logprobs: { content: logprobsContent } }],
        usage: { completion_tokens: 10 }
      })
    });

    const result = await complete(config, 'test', OP, { logprobs: true });
    expect(result.logprobsData).toEqual(logprobsContent);

    // Verify the request body included logprobs
    const callArgs = fetchSpy.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.logprobs).toBe(true);
    expect(body.top_logprobs).toBe(3);
  });
});
