const { buildStatusLine, getContextPercent } = require('../plugins/dev/scripts/status-line');

describe('status-line.js', () => {
  describe('buildStatusLine', () => {
    test('builds full status line from complete STATE.md', () => {
      const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
      const result = buildStatusLine(content, 45);
      expect(result).toBe('Towline: Phase 3/10 | building | Plan 2/4 | building | ctx:45%');
    });

    test('includes phase info only', () => {
      const content = 'Phase: 1 of 5';
      const result = buildStatusLine(content, null);
      expect(result).toBe('Towline: Phase 1/5');
    });

    test('includes plan info', () => {
      const content = 'Phase: 2 of 8\nPlan: 1 of 3';
      const result = buildStatusLine(content, null);
      expect(result).toBe('Towline: Phase 2/8 | Plan 1/3');
    });

    test('adds context percentage', () => {
      const content = 'Phase: 1 of 5';
      const result = buildStatusLine(content, 60);
      expect(result).toBe('Towline: Phase 1/5 | ctx:60%');
    });

    test('adds warning indicator when context > 80%', () => {
      const content = 'Phase: 1 of 5';
      const result = buildStatusLine(content, 85);
      expect(result).toBe('Towline: Phase 1/5 | ctx:85%!');
    });

    test('no warning at exactly 80%', () => {
      const content = 'Phase: 1 of 5';
      const result = buildStatusLine(content, 80);
      expect(result).toBe('Towline: Phase 1/5 | ctx:80%');
    });

    test('omits ctx field when ctxPercent is null', () => {
      const content = 'Phase: 1 of 5';
      const result = buildStatusLine(content, null);
      expect(result).not.toContain('ctx:');
    });

    test('returns null for empty content', () => {
      const result = buildStatusLine('', null);
      expect(result).toBeNull();
    });

    test('returns null for content with no parseable fields', () => {
      const result = buildStatusLine('Just some random text', null);
      expect(result).toBeNull();
    });

    test('includes phase parenthetical as separate part', () => {
      const content = 'Phase: 3 of 10 (API layer)';
      const result = buildStatusLine(content, null);
      expect(result).toBe('Towline: Phase 3/10 | API layer');
    });

    test('includes status line', () => {
      const content = 'Status: verified';
      const result = buildStatusLine(content, null);
      expect(result).toBe('Towline: verified');
    });
  });

  describe('getContextPercent', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('returns percentage from context_usage_fraction', () => {
      expect(getContextPercent({ context_usage_fraction: 0.45 })).toBe(45);
    });

    test('rounds percentage', () => {
      expect(getContextPercent({ context_usage_fraction: 0.333 })).toBe(33);
    });

    test('handles 0 fraction', () => {
      expect(getContextPercent({ context_usage_fraction: 0 })).toBe(0);
    });

    test('falls back to env vars', () => {
      process.env.CLAUDE_CONTEXT_TOKENS_USED = '4000';
      process.env.CLAUDE_CONTEXT_TOKENS_TOTAL = '10000';
      expect(getContextPercent({})).toBe(40);
    });

    test('returns null when neither source available', () => {
      delete process.env.CLAUDE_CONTEXT_TOKENS_USED;
      delete process.env.CLAUDE_CONTEXT_TOKENS_TOTAL;
      expect(getContextPercent({})).toBeNull();
    });

    test('returns null for empty object and no env', () => {
      delete process.env.CLAUDE_CONTEXT_TOKENS_USED;
      delete process.env.CLAUDE_CONTEXT_TOKENS_TOTAL;
      expect(getContextPercent({})).toBeNull();
    });

    test('prefers context_usage_fraction over env vars', () => {
      process.env.CLAUDE_CONTEXT_TOKENS_USED = '9000';
      process.env.CLAUDE_CONTEXT_TOKENS_TOTAL = '10000';
      expect(getContextPercent({ context_usage_fraction: 0.5 })).toBe(50);
    });
  });
});
