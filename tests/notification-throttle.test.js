const {
  createThrottleState,
  shouldThrottle,
  resetThrottle,
  isCriticalMessage,
  shouldThrottleDefault,
  _defaultState
} = require('../plugins/pbr/scripts/lib/notification-throttle');

describe('notification-throttle', () => {
  let state;

  beforeEach(() => {
    state = createThrottleState();
    // Reset the default singleton between tests
    _defaultState.seen.clear();
    _defaultState.startTime = Date.now();
  });

  describe('createThrottleState', () => {
    test('returns object with empty Map and startTime', async () => {
      expect(state.seen).toBeInstanceOf(Map);
      expect(state.seen.size).toBe(0);
      expect(typeof state.startTime).toBe('number');
      expect(state.startTime).toBeGreaterThan(0);
    });
  });

  describe('shouldThrottle — interactive mode bypass', () => {
    test('returns false in interactive mode regardless of call count', async () => {
      const key = 'hook:test:warn';
      for (let i = 0; i < 20; i++) {
        expect(shouldThrottle(state, key, { isAutonomous: false })).toBe(false);
      }
    });

    test('defaults to interactive mode when isAutonomous not specified', async () => {
      for (let i = 0; i < 10; i++) {
        expect(shouldThrottle(state, 'key', {})).toBe(false);
      }
    });

    test('defaults to interactive mode when no options provided', async () => {
      for (let i = 0; i < 10; i++) {
        expect(shouldThrottle(state, 'key')).toBe(false);
      }
    });
  });

  describe('shouldThrottle — critical message bypass', () => {
    test('returns false for critical messages in autonomous mode', async () => {
      const key = 'hook:error';
      for (let i = 0; i < 20; i++) {
        expect(shouldThrottle(state, key, {
          isAutonomous: true,
          isCritical: true
        })).toBe(false);
      }
    });
  });

  describe('shouldThrottle — basic throttling', () => {
    test('allows first maxPerWindow messages then suppresses', async () => {
      const key = 'hook:context-bridge:DEGRADING';
      const opts = { isAutonomous: true, maxPerWindow: 3 };

      // First 3 calls allowed
      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(false);

      // 4th call suppressed
      expect(shouldThrottle(state, key, opts)).toBe(true);
      // 5th also suppressed
      expect(shouldThrottle(state, key, opts)).toBe(true);
    });

    test('uses default maxPerWindow of 3', async () => {
      const key = 'test-default';
      const opts = { isAutonomous: true };

      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(true);
    });

    test('custom maxPerWindow of 1 suppresses after first message', async () => {
      const key = 'test-one';
      const opts = { isAutonomous: true, maxPerWindow: 1 };

      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(true);
    });
  });

  describe('shouldThrottle — window reset', () => {
    test('resets throttle after windowMs elapses', async () => {
      const key = 'hook:test:window';
      const opts = { isAutonomous: true, maxPerWindow: 2, windowMs: 5000 };

      // Fill up the window
      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(false);
      expect(shouldThrottle(state, key, opts)).toBe(true);

      // Simulate window expiry by manipulating firstSeen
      const entry = state.seen.get(key);
      entry.firstSeen = Date.now() - 6000; // 6s ago, window is 5s

      // Should be allowed again (window expired)
      expect(shouldThrottle(state, key, opts)).toBe(false);
      // And now we have a fresh count of 1
      expect(shouldThrottle(state, key, opts)).toBe(false);
      // 3rd call hits the limit again
      expect(shouldThrottle(state, key, opts)).toBe(true);
    });
  });

  describe('shouldThrottle — different keys are independent', () => {
    test('each key has its own counter', async () => {
      const opts = { isAutonomous: true, maxPerWindow: 1 };

      expect(shouldThrottle(state, 'keyA', opts)).toBe(false);
      expect(shouldThrottle(state, 'keyA', opts)).toBe(true); // A exhausted

      expect(shouldThrottle(state, 'keyB', opts)).toBe(false); // B still fresh
      expect(shouldThrottle(state, 'keyB', opts)).toBe(true); // B exhausted

      expect(shouldThrottle(state, 'keyC', opts)).toBe(false); // C still fresh
    });
  });

  describe('isCriticalMessage', () => {
    test.each([
      ['contains "error"', 'Something error occurred'],
      ['contains "Error"', 'TypeError: undefined'],
      ['contains "STOP"', 'STOP — Context at 85%'],
      ['contains "block"', 'decision: block'],
      ['contains "failed"', 'Build failed with 3 errors'],
      ['contains "CRITICAL"', '[Context Monitor — CRITICAL] 90% used'],
      ['contains "checkpoint"', 'CHECKPOINT: human-verify'],
      ['starts with decision JSON', '{"decision": "block", "reason": "invalid"}'],
      ['starts with reason JSON', '{"reason": "missing file"}'],
      ['starts with quoted decision', '"decision": "block"'],
      ['starts with quoted reason', '"reason": "no such file"'],
    ])('returns true when message %s', (_desc, message) => {
      expect(isCriticalMessage(message)).toBe(true);
    });

    test.each([
      ['routine context message', 'Context at ~30%'],
      ['simple notification', 'Task completed successfully'],
      ['percentage info', 'Reading file: src/index.ts'],
      ['empty string', ''],
    ])('returns false for routine message: %s', (_desc, message) => {
      expect(isCriticalMessage(message)).toBe(false);
    });

    test('returns false for non-string input', async () => {
      expect(isCriticalMessage(null)).toBe(false);
      expect(isCriticalMessage(undefined)).toBe(false);
      expect(isCriticalMessage(42)).toBe(false);
      expect(isCriticalMessage({})).toBe(false);
    });
  });

  describe('resetThrottle', () => {
    test('clears all tracked keys and resets startTime', async () => {
      const opts = { isAutonomous: true, maxPerWindow: 1 };

      // Exhaust a key
      shouldThrottle(state, 'keyX', opts);
      shouldThrottle(state, 'keyX', opts);
      expect(shouldThrottle(state, 'keyX', opts)).toBe(true);

      // Reset
      resetThrottle(state);

      expect(state.seen.size).toBe(0);
      expect(state.startTime).toBeGreaterThan(0);

      // Key should be allowed again
      expect(shouldThrottle(state, 'keyX', opts)).toBe(false);
    });
  });

  describe('shouldThrottleDefault — singleton', () => {
    test('shares state across calls within same process', async () => {
      const opts = { isAutonomous: true, maxPerWindow: 2 };

      expect(shouldThrottleDefault('shared-key', opts)).toBe(false);
      expect(shouldThrottleDefault('shared-key', opts)).toBe(false);
      expect(shouldThrottleDefault('shared-key', opts)).toBe(true);
    });

    test('uses the module-level _defaultState', async () => {
      const opts = { isAutonomous: true, maxPerWindow: 1 };
      shouldThrottleDefault('singleton-test', opts);

      // The entry should exist in _defaultState
      expect(_defaultState.seen.has('singleton-test')).toBe(true);
    });
  });

  describe('default options', () => {
    test('windowMs defaults to 60000', async () => {
      const opts = { isAutonomous: true, maxPerWindow: 1 };

      shouldThrottle(state, 'defaults-test', opts);
      const entry = state.seen.get('defaults-test');
      expect(entry).toBeDefined();
      expect(entry.count).toBe(1);

      // Verify default window works: entry created recently should not expire
      expect(shouldThrottle(state, 'defaults-test', opts)).toBe(true); // maxPerWindow=1, so 2nd call blocked
    });

    test('partial options merge with defaults', async () => {
      // Only specify isAutonomous, rest should use defaults
      const opts = { isAutonomous: true };

      // Should use default maxPerWindow=3
      expect(shouldThrottle(state, 'partial', opts)).toBe(false); // 1
      expect(shouldThrottle(state, 'partial', opts)).toBe(false); // 2
      expect(shouldThrottle(state, 'partial', opts)).toBe(false); // 3
      expect(shouldThrottle(state, 'partial', opts)).toBe(true);  // 4 = throttled
    });
  });
});
