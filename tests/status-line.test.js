const { buildStatusLine, buildContextBar, getContextPercent, loadStatusLineConfig, DEFAULTS } = require('../plugins/dev/scripts/status-line');

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

  describe('config-driven customization', () => {
    describe('DEFAULTS', () => {
      test('has all expected keys', () => {
        expect(DEFAULTS).toHaveProperty('sections');
        expect(DEFAULTS).toHaveProperty('brand_text');
        expect(DEFAULTS).toHaveProperty('max_status_length');
        expect(DEFAULTS).toHaveProperty('context_bar');
        expect(DEFAULTS.context_bar).toHaveProperty('width');
        expect(DEFAULTS.context_bar).toHaveProperty('thresholds');
        expect(DEFAULTS.context_bar).toHaveProperty('chars');
      });

      test('default sections include all four', () => {
        expect(DEFAULTS.sections).toEqual(['phase', 'plan', 'status', 'context']);
      });

      test('default brand text is diamond Towline', () => {
        expect(DEFAULTS.brand_text).toBe('\u25C6 Towline');
      });
    });

    describe('buildStatusLine with config', () => {
      test('uses default config when none provided', () => {
        const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
        const result = strip(buildStatusLine(content, 45));
        expect(result).toContain('\u25C6 Towline');
        expect(result).toContain('Phase 3/10');
        expect(result).toContain('Plan 2/4');
        expect(result).toContain('building');
        expect(result).toContain('45%');
      });

      test('custom brand text replaces default', () => {
        const cfg = { ...DEFAULTS, brand_text: 'MY PROJECT' };
        const content = 'Phase: 1 of 5';
        const result = strip(buildStatusLine(content, null, cfg));
        expect(result).toContain('MY PROJECT');
        expect(result).not.toContain('Towline');
      });

      test('filtering sections hides plan', () => {
        const cfg = { ...DEFAULTS, sections: ['phase', 'status', 'context'] };
        const content = 'Phase: 2 of 8\nPlan: 1 of 3\nStatus: building';
        const result = strip(buildStatusLine(content, 50, cfg));
        expect(result).toContain('Phase 2/8');
        expect(result).not.toContain('Plan 1/3');
        expect(result).toContain('building');
        expect(result).toContain('50%');
      });

      test('filtering sections hides status', () => {
        const cfg = { ...DEFAULTS, sections: ['phase', 'plan'] };
        const content = 'Phase: 2 of 8\nPlan: 1 of 3\nStatus: building';
        const result = strip(buildStatusLine(content, 50, cfg));
        expect(result).toContain('Phase 2/8');
        expect(result).toContain('Plan 1/3');
        expect(result).not.toContain('building');
        expect(result).not.toContain('50%');
      });

      test('filtering sections hides context bar', () => {
        const cfg = { ...DEFAULTS, sections: ['phase'] };
        const content = 'Phase: 1 of 5\nStatus: verified';
        const result = strip(buildStatusLine(content, 80, cfg));
        expect(result).toContain('Phase 1/5');
        expect(result).not.toContain('80%');
        expect(result).not.toContain('verified');
      });

      test('empty sections list returns null', () => {
        const cfg = { ...DEFAULTS, sections: [] };
        const content = 'Phase: 1 of 5';
        const result = buildStatusLine(content, 50, cfg);
        expect(result).toBeNull();
      });

      test('custom max_status_length truncates at different length', () => {
        const cfg = { ...DEFAULTS, max_status_length: 20 };
        const longStatus = 'a'.repeat(30);
        const content = `Phase: 1 of 5\nStatus: ${longStatus}`;
        const result = strip(buildStatusLine(content, null, cfg));
        // Should truncate to 17 chars + '...' = 20
        expect(result).toContain('a'.repeat(17) + '...');
        expect(result).not.toContain(longStatus);
      });

      test('short status within max_status_length is not truncated', () => {
        const cfg = { ...DEFAULTS, max_status_length: 100 };
        const content = 'Phase: 1 of 5\nStatus: building tests';
        const result = strip(buildStatusLine(content, null, cfg));
        expect(result).toContain('building tests');
      });

      test('custom context bar width', () => {
        const cfg = {
          ...DEFAULTS,
          context_bar: { ...DEFAULTS.context_bar, width: 20 }
        };
        const content = 'Phase: 1 of 5';
        const result = strip(buildStatusLine(content, 50, cfg));
        // Bar should have 20 chars total
        const barChars = result.match(/[\u2588\u2591]+/);
        expect(barChars).toBeTruthy();
        expect(barChars[0]).toHaveLength(20);
      });
    });

    describe('buildContextBar with config opts', () => {
      test('custom thresholds shift color boundaries', () => {
        // With thresholds green=50, yellow=75: 60% should be yellow
        const bar = buildContextBar(60, 10, {
          thresholds: { green: 50, yellow: 75 },
          chars: DEFAULTS.context_bar.chars
        });
        expect(bar).toContain('\x1b[1;33m'); // boldYellow
      });

      test('custom thresholds: below green is green', () => {
        const bar = buildContextBar(30, 10, {
          thresholds: { green: 50, yellow: 75 },
          chars: DEFAULTS.context_bar.chars
        });
        expect(bar).toContain('\x1b[1;32m'); // boldGreen
      });

      test('custom thresholds: above yellow is red', () => {
        const bar = buildContextBar(80, 10, {
          thresholds: { green: 50, yellow: 75 },
          chars: DEFAULTS.context_bar.chars
        });
        expect(bar).toContain('\x1b[1;31m'); // boldRed
      });

      test('custom bar characters', () => {
        const bar = strip(buildContextBar(50, 10, {
          thresholds: DEFAULTS.context_bar.thresholds,
          chars: { filled: '#', empty: '-' }
        }));
        expect(bar).toContain('#');
        expect(bar).toContain('-');
        expect(bar).toHaveLength(10);
      });

      test('falls back to defaults when opts not provided', () => {
        const bar = strip(buildContextBar(50, 10));
        expect(bar).toHaveLength(10);
        expect(bar).toMatch(/[\u2588\u2591]/);
      });
    });

    describe('loadStatusLineConfig', () => {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      let tmpDir;

      beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-test-'));
      });

      afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      test('returns DEFAULTS when no config.json exists', () => {
        const result = loadStatusLineConfig(tmpDir);
        expect(result).toEqual(DEFAULTS);
      });

      test('returns DEFAULTS when config.json has no status_line section', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          features: { status_line: true }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result).toEqual(DEFAULTS);
      });

      test('merges partial status_line config with defaults', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          status_line: {
            brand_text: 'Custom Brand'
          }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result.brand_text).toBe('Custom Brand');
        expect(result.sections).toEqual(DEFAULTS.sections);
        expect(result.max_status_length).toBe(DEFAULTS.max_status_length);
        expect(result.context_bar).toEqual(DEFAULTS.context_bar);
      });

      test('overrides sections from config', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          status_line: {
            sections: ['phase', 'context']
          }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result.sections).toEqual(['phase', 'context']);
      });

      test('overrides context_bar.width from config', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          status_line: {
            context_bar: { width: 30 }
          }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result.context_bar.width).toBe(30);
        // Other context_bar fields should still be defaults
        expect(result.context_bar.thresholds).toEqual(DEFAULTS.context_bar.thresholds);
        expect(result.context_bar.chars).toEqual(DEFAULTS.context_bar.chars);
      });

      test('overrides context_bar.thresholds partially', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          status_line: {
            context_bar: {
              thresholds: { green: 50, yellow: 75 }
            }
          }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result.context_bar.thresholds.green).toBe(50);
        expect(result.context_bar.thresholds.yellow).toBe(75);
        expect(result.context_bar.width).toBe(DEFAULTS.context_bar.width);
      });

      test('overrides context_bar.chars', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          status_line: {
            context_bar: {
              chars: { filled: '#', empty: '.' }
            }
          }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result.context_bar.chars.filled).toBe('#');
        expect(result.context_bar.chars.empty).toBe('.');
      });

      test('overrides max_status_length', () => {
        fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
          version: 2,
          status_line: { max_status_length: 100 }
        }));
        const result = loadStatusLineConfig(tmpDir);
        expect(result.max_status_length).toBe(100);
      });
    });
  });
});
