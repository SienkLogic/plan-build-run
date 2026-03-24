/**
 * Tests for pattern-based routing module.
 *
 * Validates checkPatternRouting(filePath, config) returns correct
 * advisory messages for different file pattern categories.
 */

const { checkPatternRouting } = require('../plugins/pbr/scripts/lib/pattern-routing');

describe('checkPatternRouting', () => {
  const enabledConfig = { features: {} };
  const disabledConfig = { features: { pattern_routing: false } };

  test('returns advisory for test files (.test.js)', async () => {
    const result = checkPatternRouting('src/utils.test.js', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Tt]est file/);
  });

  test('returns advisory for spec files (.spec.ts)', async () => {
    const result = checkPatternRouting('components/Button.spec.ts', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Tt]est file/);
  });

  test('returns advisory for schema/migration files', async () => {
    const result = checkPatternRouting('db/schema.prisma', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Ss]chema/);
  });

  test('returns advisory for migration SQL files', async () => {
    const result = checkPatternRouting('db/migration-001.sql', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Ss]chema|migration/i);
  });

  test('returns advisory for security-sensitive files (auth)', async () => {
    const result = checkPatternRouting('src/middleware/auth.js', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Ss]ecurity/);
  });

  test('returns advisory for env files', async () => {
    const result = checkPatternRouting('.env.production', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Ss]ecurity/);
  });

  test('returns advisory for config files', async () => {
    const result = checkPatternRouting('tsconfig.json', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Cc]onfig/);
  });

  test('returns advisory for jest.config files', async () => {
    const result = checkPatternRouting('jest.config.cjs', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Cc]onfig/);
  });

  test('returns advisory for hook script files', async () => {
    const result = checkPatternRouting('hooks/validate-commit.js', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Hh]ook/);
  });

  test('returns null for regular source files', async () => {
    const result = checkPatternRouting('src/utils.ts', enabledConfig);
    expect(result).toBeNull();
  });

  test('returns null for regular source files without pattern', async () => {
    const result = checkPatternRouting('lib/helpers/format.js', enabledConfig);
    expect(result).toBeNull();
  });

  test('returns null when feature is disabled', async () => {
    const result = checkPatternRouting('src/auth/login.test.ts', disabledConfig);
    expect(result).toBeNull();
  });

  test('returns first match only (priority order) - security before test', async () => {
    // auth.test.js should match security pattern before test pattern
    const result = checkPatternRouting('src/auth.test.js', enabledConfig);
    expect(result).not.toBeNull();
    // Should match security (auth) before test (.test.)
    expect(result.advisory).toMatch(/[Ss]ecurity/);
  });

  test('result has pattern and advisory fields', async () => {
    const result = checkPatternRouting('hooks/my-hook.js', enabledConfig);
    expect(result).toHaveProperty('pattern');
    expect(result).toHaveProperty('advisory');
    expect(typeof result.pattern).toBe('string');
    expect(typeof result.advisory).toBe('string');
  });

  test('handles Windows backslash paths', async () => {
    const result = checkPatternRouting('hooks\\validate-commit.js', enabledConfig);
    expect(result).not.toBeNull();
    expect(result.advisory).toMatch(/[Hh]ook/);
  });
});
