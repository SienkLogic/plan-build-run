/**
 * Tests for hooks/lib/pattern-routing.js — Pattern-based file routing.
 */

const { checkPatternRouting, DEFAULT_PATTERNS } = require('../plugins/pbr/scripts/lib/pattern-routing');

describe('DEFAULT_PATTERNS', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_PATTERNS)).toBe(true);
    expect(DEFAULT_PATTERNS.length).toBeGreaterThan(0);
  });

  test('each entry has pattern and advisory', () => {
    for (const rule of DEFAULT_PATTERNS) {
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(typeof rule.advisory).toBe('string');
    }
  });
});

describe('checkPatternRouting', () => {
  test('matches hook files to hook advisory', () => {
    const result = checkPatternRouting('hooks/my-hook.js', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Hook script');
  });

  test('matches test files to test advisory', () => {
    const result = checkPatternRouting('src/utils.test.js', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Test file');
  });

  test('matches security-sensitive files', () => {
    const result = checkPatternRouting('.env.local', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Security');
  });

  test('matches auth-related files', () => {
    const result = checkPatternRouting('src/auth/middleware.js', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Security');
  });

  test('matches schema/migration files', () => {
    const result = checkPatternRouting('db/schema.sql', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Schema');
  });

  test('matches config files', () => {
    const result = checkPatternRouting('jest.config.js', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Config');
  });

  test('returns null for unmatched file', () => {
    const result = checkPatternRouting('src/utils/helpers.js', {});
    expect(result).toBeNull();
  });

  test('returns null when feature disabled', () => {
    const result = checkPatternRouting('hooks/my-hook.js', { features: { pattern_routing: false } });
    expect(result).toBeNull();
  });

  test('normalizes backslashes to forward slashes', () => {
    const result = checkPatternRouting('hooks\\my-hook.js', {});
    expect(result).not.toBeNull();
    expect(result.advisory).toContain('Hook script');
  });

  test('returns pattern and advisory in result', () => {
    const result = checkPatternRouting('.env', {});
    expect(result).toHaveProperty('pattern');
    expect(result).toHaveProperty('advisory');
    expect(typeof result.pattern).toBe('string');
  });

  test('handles empty config gracefully', () => {
    const result = checkPatternRouting('hooks/test.js', {});
    expect(result).not.toBeNull();
  });

  test('handles null config gracefully', () => {
    const result = checkPatternRouting('hooks/test.js', null);
    expect(result).not.toBeNull();
  });
});
