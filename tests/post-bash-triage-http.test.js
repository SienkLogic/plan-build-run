'use strict';

/**
 * Parity tests for post-bash-triage.js handleHttp export.
 * After local_llm removal, checkTestTriage is a no-op stub.
 */

jest.mock('../plugins/pbr/scripts/hook-logger', () => ({
  logHook: jest.fn()
}));

const { handleHttp } = require('../plugins/pbr/scripts/post-bash-triage');

describe('post-bash-triage handleHttp', () => {
  test('exports handleHttp', () => {
    expect(typeof handleHttp).toBe('function');
  });

  test('handleHttp returns null (no-op after local_llm removal)', async () => {
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

  test('handleHttp handles empty data gracefully', async () => {
    const result = await handleHttp({
      data: {},
      planningDir: '/tmp/.planning',
      cache: {}
    }, {});

    expect(result).toBeNull();
  });
});
