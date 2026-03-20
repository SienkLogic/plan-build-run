'use strict';

/**
 * Parity tests for post-bash-triage.js handleHttp export.
 * Verifies that handleHttp produces the same results as checkTestTriage
 * for common triage scenarios.
 */

jest.mock('../plugins/pbr/scripts/lib/local-llm/health', () => ({
  resolveConfig: jest.fn(() => ({
    enabled: true,
    model: 'test-model',
    features: { test_triage: true },
    advanced: { disable_after_failures: 3, max_input_tokens: 1024 },
    metrics: { frontier_token_rate: 3.0 }
  }))
}));

jest.mock('../plugins/pbr/scripts/lib/local-llm/operations/triage-test-output', () => ({
  triageTestOutput: jest.fn()
}));

jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn(() => JSON.stringify({ local_llm: { enabled: true } })),
    existsSync: jest.fn(() => true)
  };
});

const { handleHttp, checkTestTriage } = require('../plugins/pbr/scripts/post-bash-triage');
const { triageTestOutput } = require('../plugins/pbr/scripts/lib/local-llm/operations/triage-test-output');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('post-bash-triage handleHttp', () => {
  test('exports handleHttp', () => {
    expect(typeof handleHttp).toBe('function');
  });

  test('handleHttp returns null for passing tests (exit code 0)', async () => {
    const result = await handleHttp({
      data: {
        tool_input: { command: 'npm test' },
        tool_output: 'All tests passed',
        tool_exit_code: 0
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
    expect(triageTestOutput).not.toHaveBeenCalled();
  });

  test('handleHttp returns null for non-test commands', async () => {
    const result = await handleHttp({
      data: {
        tool_input: { command: 'git status' },
        tool_output: 'error output',
        tool_exit_code: 1
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
  });

  test('handleHttp returns null when exit code is undefined', async () => {
    const result = await handleHttp({
      data: {
        tool_input: { command: 'npm test' },
        tool_output: 'output',
        tool_exit_code: undefined
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
  });

  test('handleHttp returns additionalContext when LLM triages successfully', async () => {
    triageTestOutput.mockResolvedValue({
      category: 'assertion',
      file_hint: 'tests/foo.test.js:42',
      confidence: 0.95,
      latency_ms: 100,
      fallback_used: false
    });

    const result = await handleHttp({
      data: {
        tool_input: { command: 'npx jest tests/foo.test.js' },
        tool_output: 'FAIL tests/foo.test.js\nExpected: 1\nReceived: 2\n' + 'x'.repeat(50),
        tool_exit_code: 1
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).not.toBeNull();
    expect(result.additionalContext).toContain('assertion');
    expect(result.additionalContext).toContain('tests/foo.test.js:42');
    expect(result.additionalContext).toContain('95%');
  });

  test('handleHttp returns null when LLM returns unknown category', async () => {
    triageTestOutput.mockResolvedValue({
      category: 'unknown',
      file_hint: null,
      confidence: 0.5,
      latency_ms: 100,
      fallback_used: false
    });

    const result = await handleHttp({
      data: {
        tool_input: { command: 'npx jest' },
        tool_output: 'something failed\n' + 'x'.repeat(50),
        tool_exit_code: 1
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
  });

  test('handleHttp returns null when LLM throws', async () => {
    triageTestOutput.mockRejectedValue(new Error('LLM crash'));

    const result = await handleHttp({
      data: {
        tool_input: { command: 'npm test' },
        tool_output: 'FAIL tests/foo.test.js\n' + 'x'.repeat(50),
        tool_exit_code: 1
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
  });

  test('handleHttp does not call process.exit()', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    triageTestOutput.mockResolvedValue(null);

    await handleHttp({
      data: {
        tool_input: { command: 'npm test' },
        tool_output: 'FAIL\n' + 'x'.repeat(50),
        tool_exit_code: 1
      },
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  test('handleHttp handles empty data gracefully', async () => {
    const result = await handleHttp({
      data: {},
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
  });

  test('handleHttp parity: produces same result as checkTestTriage for assertion failure', async () => {
    triageTestOutput.mockResolvedValue({
      category: 'timeout',
      file_hint: null,
      confidence: 0.88,
      latency_ms: 100,
      fallback_used: false
    });

    const hookData = {
      tool_input: { command: 'npm test' },
      tool_output: 'Test timed out after 5000ms\n' + 'x'.repeat(50),
      tool_exit_code: 1
    };

    const triageResult = await checkTestTriage(hookData);
    const httpResult = await handleHttp({ data: hookData, planningDir: '/tmp/.planning', cache: {} }, {});

    // Both paths should produce the same additionalContext
    expect(httpResult).toEqual(triageResult ? triageResult.output : null);
  });
});
