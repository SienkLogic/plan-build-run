'use strict';

jest.mock('../plugins/pbr/scripts/local-llm/health', () => ({
  resolveConfig: jest.fn(() => ({
    enabled: true,
    model: 'test-model',
    features: { test_triage: true },
    advanced: { disable_after_failures: 3, max_input_tokens: 1024 },
    metrics: { frontier_token_rate: 3.0 }
  }))
}));

jest.mock('../plugins/pbr/scripts/local-llm/operations/triage-test-output', () => ({
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

const { checkTestTriage, detectTestRunner } = require('../plugins/pbr/scripts/post-bash-triage');
const { triageTestOutput } = require('../plugins/pbr/scripts/local-llm/operations/triage-test-output');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('post-bash-triage', () => {
  describe('detectTestRunner', () => {
    test('detects jest', () => {
      expect(detectTestRunner('npx jest tests/')).toBe('jest');
    });

    test('detects vitest', () => {
      expect(detectTestRunner('npx vitest run')).toBe('vitest');
    });

    test('detects pytest', () => {
      expect(detectTestRunner('pytest tests/')).toBe('pytest');
    });

    test('detects mocha', () => {
      expect(detectTestRunner('mocha tests/**/*.test.js')).toBe('mocha');
    });

    test('detects cargo test', () => {
      expect(detectTestRunner('cargo test --release')).toBe('cargo');
    });

    test('detects go test', () => {
      expect(detectTestRunner('go test ./...')).toBe('go');
    });

    test('returns null for unknown commands', () => {
      expect(detectTestRunner('ls -la')).toBeNull();
      expect(detectTestRunner('echo hello')).toBeNull();
    });
  });

  describe('checkTestTriage', () => {
    test('returns null when exit code is 0 (passing tests)', async () => {
      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'All tests passed',
        tool_exit_code: 0
      });
      expect(result).toBeNull();
      expect(triageTestOutput).not.toHaveBeenCalled();
    });

    test('returns null when exit code is undefined', async () => {
      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'output',
        tool_exit_code: undefined
      });
      expect(result).toBeNull();
    });

    test('returns null when command is not a test command', async () => {
      const result = await checkTestTriage({
        tool_input: { command: 'git status' },
        tool_output: 'error output',
        tool_exit_code: 1
      });
      expect(result).toBeNull();
    });

    test('returns null when output is too short', async () => {
      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'fail',
        tool_exit_code: 1
      });
      expect(result).toBeNull();
    });

    test('returns advisory context when LLM triages successfully', async () => {
      triageTestOutput.mockResolvedValue({
        category: 'assertion',
        file_hint: 'tests/foo.test.js:42',
        confidence: 0.95,
        latency_ms: 100,
        fallback_used: false
      });

      const result = await checkTestTriage({
        tool_input: { command: 'npx jest tests/foo.test.js' },
        tool_output: 'FAIL tests/foo.test.js\nExpected: 1\nReceived: 2\n' + 'x'.repeat(50),
        tool_exit_code: 1
      });

      expect(result).not.toBeNull();
      expect(result.output.additionalContext).toContain('assertion');
      expect(result.output.additionalContext).toContain('tests/foo.test.js:42');
      expect(result.output.additionalContext).toContain('95%');
    });

    test('returns null when LLM returns unknown category', async () => {
      triageTestOutput.mockResolvedValue({
        category: 'unknown',
        file_hint: null,
        confidence: 0.5,
        latency_ms: 100,
        fallback_used: false
      });

      const result = await checkTestTriage({
        tool_input: { command: 'npx jest' },
        tool_output: 'something failed\n' + 'x'.repeat(50),
        tool_exit_code: 1
      });

      expect(result).toBeNull();
    });

    test('returns null when LLM returns null', async () => {
      triageTestOutput.mockResolvedValue(null);

      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'FAIL tests/foo.test.js\n' + 'x'.repeat(50),
        tool_exit_code: 1
      });

      expect(result).toBeNull();
    });

    test('returns null when LLM throws', async () => {
      triageTestOutput.mockRejectedValue(new Error('LLM crash'));

      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'FAIL tests/foo.test.js\n' + 'x'.repeat(50),
        tool_exit_code: 1
      });

      expect(result).toBeNull();
    });

    test('matches various test command patterns', async () => {
      triageTestOutput.mockResolvedValue({
        category: 'assertion',
        file_hint: null,
        confidence: 0.9,
        latency_ms: 50,
        fallback_used: false
      });

      const testCommands = [
        'npm test',
        'npx jest',
        'npx vitest run',
        'pytest tests/',
        'npm run test:unit'
      ];

      for (const cmd of testCommands) {
        const result = await checkTestTriage({
          tool_input: { command: cmd },
          tool_output: 'FAIL some test\n' + 'x'.repeat(50),
          tool_exit_code: 1
        });
        expect(result).not.toBeNull();
      }
    });

    test('handles result without file_hint', async () => {
      triageTestOutput.mockResolvedValue({
        category: 'timeout',
        file_hint: null,
        confidence: 0.88,
        latency_ms: 100,
        fallback_used: false
      });

      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'Test timed out after 5000ms\n' + 'x'.repeat(50),
        tool_exit_code: 1
      });

      expect(result).not.toBeNull();
      expect(result.output.additionalContext).toContain('timeout');
      expect(result.output.additionalContext).not.toContain('likely:');
    });
  });
});
