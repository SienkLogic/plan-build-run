'use strict';

jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

const { checkTestTriage, detectTestRunner } = require('../plugins/pbr/scripts/post-bash-triage');

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

    test('returns null for unknown commands', () => {
      expect(detectTestRunner('ls -la')).toBeNull();
    });
  });

  describe('checkTestTriage (no-op after local_llm removal)', () => {
    test('always returns null', async () => {
      const result = await checkTestTriage({
        tool_input: { command: 'npm test' },
        tool_output: 'FAIL tests/foo.test.js\n' + 'x'.repeat(50),
        tool_exit_code: 1
      });
      expect(result).toBeNull();
    });
  });
});
