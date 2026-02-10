const { buildStatusLine, buildContextBar, getContextPercent } = require('../plugins/dev/scripts/status-line');

/** Strip ANSI escape codes for readable assertions */
function strip(str) {
  if (!str) return str;
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('status-line.js', () => {
  describe('buildStatusLine', () => {
    test('builds full status line from complete STATE.md', () => {
      const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
      const result = strip(buildStatusLine(content, 45));
      expect(result).toContain('\u25C6 Towline');
      expect(result).toContain('Phase 3/10');
      expect(result).toContain('building');
      expect(result).toContain('Plan 2/4');
      expect(result).toContain('45%');
    });

    test('includes phase info only', () => {
      const content = 'Phase: 1 of 5';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Towline');
      expect(result).toContain('Phase 1/5');
    });

    test('includes plan info', () => {
      const content = 'Phase: 2 of 8\nPlan: 1 of 3';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Phase 2/8');
      expect(result).toContain('Plan 1/3');
    });

    test('colors completed plans green', () => {
      const content = 'Phase: 2 of 8\nPlan: 3 of 3';
      const raw = buildStatusLine(content, null);
      // Green ANSI before "Plan 3/3"
      expect(raw).toContain('\x1b[32mPlan 3/3');
    });

    test('adds context bar when percentage provided', () => {
      const content = 'Phase: 1 of 5';
      const result = strip(buildStatusLine(content, 60));
      expect(result).toContain('60%');
      // Should contain block characters from the bar
      expect(result).toMatch(/[\u2588\u2591]/);
    });

    test('omits context bar when ctxPercent is null', () => {
      const content = 'Phase: 1 of 5';
      const result = strip(buildStatusLine(content, null));
      expect(result).not.toContain('%');
      expect(result).not.toMatch(/[\u2588\u2591]/);
    });

    test('shows brand even with empty content', () => {
      const result = strip(buildStatusLine('', null));
      expect(result).toContain('\u25C6 Towline');
    });

    test('shows brand even with no parseable fields', () => {
      const result = strip(buildStatusLine('Just some random text', null));
      expect(result).toContain('\u25C6 Towline');
    });

    test('includes phase name as separate section', () => {
      const content = 'Phase: 3 of 10 (API layer)';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Phase 3/10');
      expect(result).toContain('API layer');
    });

    test('includes status text', () => {
      const content = 'Phase: 1 of 5\nStatus: verified';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('verified');
    });

    test('truncates long status text', () => {
      const longStatus = 'a'.repeat(60);
      const content = `Phase: 1 of 5\nStatus: ${longStatus}`;
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('...');
      // Should not contain the full 60-char string
      expect(result).not.toContain(longStatus);
    });

    test('uses pipe separator between sections', () => {
      const content = 'Phase: 2 of 8\nPlan: 1 of 3';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('\u2502');
    });

    test('status with no phase still shows Towline brand', () => {
      const content = 'Status: idle';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('\u25C6 Towline');
      expect(result).toContain('idle');
    });
  });

  describe('buildContextBar', () => {
    test('returns empty string for zero width', () => {
      expect(buildContextBar(50, 0)).toBe('');
    });

    test('builds bar of correct character count', () => {
      const bar = strip(buildContextBar(50, 10));
      // 10 characters total (filled + empty)
      expect(bar).toHaveLength(10);
    });

    test('all filled at 100%', () => {
      const bar = strip(buildContextBar(100, 10));
      expect(bar).toBe('\u2588'.repeat(10));
    });

    test('all empty at 0%', () => {
      const bar = strip(buildContextBar(0, 10));
      expect(bar).toBe('\u2591'.repeat(10));
    });

    test('green color below 70%', () => {
      const bar = buildContextBar(50, 10);
      expect(bar).toContain('\x1b[1;32m'); // boldGreen
    });

    test('yellow color at 70-89%', () => {
      const bar = buildContextBar(75, 10);
      expect(bar).toContain('\x1b[1;33m'); // boldYellow
    });

    test('red color at 90%+', () => {
      const bar = buildContextBar(95, 10);
      expect(bar).toContain('\x1b[1;31m'); // boldRed
    });
  });

  describe('getContextPercent', () => {
    test('returns percentage from context_window.used_percentage', () => {
      expect(getContextPercent({ context_window: { used_percentage: 45.2 } })).toBe(45);
    });

    test('rounds context_window percentage', () => {
      expect(getContextPercent({ context_window: { used_percentage: 33.7 } })).toBe(34);
    });

    test('returns percentage from legacy context_usage_fraction', () => {
      expect(getContextPercent({ context_usage_fraction: 0.45 })).toBe(45);
    });

    test('rounds legacy fraction', () => {
      expect(getContextPercent({ context_usage_fraction: 0.333 })).toBe(33);
    });

    test('handles 0 fraction', () => {
      expect(getContextPercent({ context_usage_fraction: 0 })).toBe(0);
    });

    test('returns null when no context data available', () => {
      expect(getContextPercent({})).toBeNull();
    });

    test('returns null for empty object', () => {
      expect(getContextPercent({})).toBeNull();
    });

    test('prefers context_window over legacy fraction', () => {
      expect(getContextPercent({
        context_window: { used_percentage: 60 },
        context_usage_fraction: 0.5
      })).toBe(60);
    });
  });
});
