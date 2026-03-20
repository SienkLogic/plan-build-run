'use strict';

/**
 * Tests for hooks/local-llm/shadow.js — runShadow fire-and-forget comparison.
 */

jest.mock('../plugins/pbr/scripts/lib/local-llm/metrics', () => ({
  logAgreement: jest.fn()
}));

const { logAgreement } = require('../plugins/pbr/scripts/lib/local-llm/metrics');
const { runShadow } = require('../plugins/pbr/scripts/lib/local-llm/shadow');

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    advanced: {
      shadow_mode: true,
      ...((overrides && overrides.advanced) || {})
    },
    ...overrides
  };
}

// Let the fire-and-forget promise chain settle
const tick = () => new Promise(r => setTimeout(r, 50));

describe('runShadow', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns frontierResult immediately when shadow_mode is false', () => {
    const cfg = makeConfig({ advanced: { shadow_mode: false } });
    const result = runShadow(cfg, '/tmp', 'test-op', jest.fn(), 'frontier-value');
    expect(result).toBe('frontier-value');
    expect(logAgreement).not.toHaveBeenCalled();
  });

  test('returns frontierResult immediately when config.enabled is false', () => {
    const cfg = makeConfig({ enabled: false });
    const result = runShadow(cfg, '/tmp', 'test-op', jest.fn(), 'frontier-value');
    expect(result).toBe('frontier-value');
    expect(logAgreement).not.toHaveBeenCalled();
  });

  test('calls localResultFn and logs agreement when results match', async () => {
    const cfg = makeConfig();
    const localFn = jest.fn().mockResolvedValue('frontier-value');
    const result = runShadow(cfg, '/tmp', 'test-op', localFn, 'frontier-value', 'sess1');
    expect(result).toBe('frontier-value');

    await tick();

    expect(localFn).toHaveBeenCalledTimes(1);
    expect(logAgreement).toHaveBeenCalledTimes(1);
    expect(logAgreement.mock.calls[0][1]).toMatchObject({
      operation: 'test-op',
      session_id: 'sess1',
      agrees: true
    });
  });

  test('logs agrees: false when local and frontier results differ', async () => {
    const cfg = makeConfig();
    const localFn = jest.fn().mockResolvedValue('different-value');
    runShadow(cfg, '/tmp', 'test-op', localFn, 'frontier-value');

    await tick();

    expect(logAgreement).toHaveBeenCalledTimes(1);
    expect(logAgreement.mock.calls[0][1].agrees).toBe(false);
  });

  test('logs agrees: false with local_result: null when localResultFn throws', async () => {
    const cfg = makeConfig();
    const localFn = jest.fn().mockRejectedValue(new Error('boom'));
    runShadow(cfg, '/tmp', 'test-op', localFn, 'frontier-value');

    await tick();

    expect(logAgreement).toHaveBeenCalledTimes(1);
    const entry = logAgreement.mock.calls[0][1];
    expect(entry.agrees).toBe(false);
    expect(entry.local_result).toBeNull();
  });

  test('always returns frontierResult regardless of local outcome', async () => {
    const cfg = makeConfig();
    const localFn = jest.fn().mockRejectedValue(new Error('fail'));
    const result = runShadow(cfg, '/tmp', 'test-op', localFn, 'my-frontier');
    expect(result).toBe('my-frontier');

    await tick();
    // Still returned frontier even though local threw
  });

  test('handles non-string frontierResult by JSON.stringifying', async () => {
    const cfg = makeConfig();
    const frontierObj = { classification: 'complete' };
    const localFn = jest.fn().mockResolvedValue({ classification: 'complete' });
    runShadow(cfg, '/tmp', 'test-op', localFn, frontierObj);

    await tick();

    expect(logAgreement).toHaveBeenCalledTimes(1);
    const entry = logAgreement.mock.calls[0][1];
    expect(entry.frontier_result).toBe(JSON.stringify(frontierObj));
    expect(entry.agrees).toBe(true);
  });

  test('defaults session_id to unknown when not provided', async () => {
    const cfg = makeConfig();
    const localFn = jest.fn().mockResolvedValue('val');
    runShadow(cfg, '/tmp', 'test-op', localFn, 'val');

    await tick();

    expect(logAgreement.mock.calls[0][1].session_id).toBe('unknown');
  });
});
