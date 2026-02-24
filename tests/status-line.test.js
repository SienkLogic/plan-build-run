const { buildStatusLine, buildContextBar, getContextPercent, getGitInfo, formatDuration, formatTokens, loadStatusLineConfig, parseFrontmatter, DEFAULTS } = require('../plugins/pbr/scripts/status-line');
const { configClearCache } = require('../plugins/pbr/scripts/pbr-tools');

/** Strip ANSI escape codes for readable assertions */
function strip(str) {
  if (!str) return str;
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('status-line.js', () => {
  describe('buildStatusLine', () => {
    test('builds full status line from complete STATE.md', () => {
      const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
      const result = strip(buildStatusLine(content, 45));
      expect(result).toContain('\u25C6 Plan-Build-Run');
      expect(result).toContain('Phase 3/10');
      expect(result).toContain('building');
      expect(result).toContain('Plan 2/4');
      expect(result).toContain('45%');
    });

    test('includes phase info only', () => {
      const content = 'Phase: 1 of 5';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Plan-Build-Run');
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
      expect(result).toContain('\u25C6 Plan-Build-Run');
    });

    test('shows brand even with no parseable fields', () => {
      const result = strip(buildStatusLine('Just some random text', null));
      expect(result).toContain('\u25C6 Plan-Build-Run');
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

    test('status with no phase still shows Plan-Build-Run brand', () => {
      const content = 'Status: idle';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('\u25C6 Plan-Build-Run');
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

      test('default sections include phase, plan, status, git, context, llm', () => {
        expect(DEFAULTS.sections).toEqual(['phase', 'plan', 'status', 'git', 'context', 'llm']);
      });

      test('default brand text is diamond Plan-Build-Run', () => {
        expect(DEFAULTS.brand_text).toBe('\u25C6 Plan-Build-Run');
      });
    });

    describe('buildStatusLine with config', () => {
      test('uses default config when none provided', () => {
        const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
        const result = strip(buildStatusLine(content, 45));
        expect(result).toContain('\u25C6 Plan-Build-Run');
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
        expect(result).not.toContain('Plan-Build-Run');
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
        configClearCache();
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

  describe('getGitInfo', () => {
    const cp = require('child_process');

    test('returns branch and dirty false for clean repo', () => {
      const spy = jest.spyOn(cp, 'execSync');
      spy.mockImplementation((cmd) => {
        if (cmd.includes('branch --show-current')) return 'main\n';
        if (cmd.includes('status --porcelain')) return '';
        return '';
      });
      const info = getGitInfo();
      expect(info).toEqual({ branch: 'main', dirty: false });
      spy.mockRestore();
    });

    test('returns dirty true when porcelain has output', () => {
      const spy = jest.spyOn(cp, 'execSync');
      spy.mockImplementation((cmd) => {
        if (cmd.includes('branch --show-current')) return 'feature/x\n';
        if (cmd.includes('status --porcelain')) return ' M src/index.js\n';
        return '';
      });
      const info = getGitInfo();
      expect(info).toEqual({ branch: 'feature/x', dirty: true });
      spy.mockRestore();
    });

    test('returns null when not in a git repo', () => {
      const spy = jest.spyOn(cp, 'execSync').mockImplementation(() => {
        throw new Error('not a git repo');
      });
      const info = getGitInfo();
      expect(info).toBeNull();
      spy.mockRestore();
    });

    test('returns null when branch is empty', () => {
      const spy = jest.spyOn(cp, 'execSync').mockImplementation((cmd) => {
        if (cmd.includes('branch --show-current')) return '\n';
        return '';
      });
      const info = getGitInfo();
      expect(info).toBeNull();
      spy.mockRestore();
    });
  });

  describe('formatDuration', () => {
    test('formats minutes only', () => {
      expect(formatDuration(720000)).toBe('12m');
    });

    test('formats hours and minutes', () => {
      expect(formatDuration(4980000)).toBe('1h23m');
    });

    test('formats hours with no minutes', () => {
      expect(formatDuration(7200000)).toBe('2h');
    });

    test('formats zero as 0m', () => {
      expect(formatDuration(0)).toBe('0m');
    });

    test('formats sub-minute as 0m', () => {
      expect(formatDuration(30000)).toBe('0m');
    });
  });

  describe('buildStatusLine with git section', () => {
    const cp = require('child_process');

    test('includes git branch when git section is configured', () => {
      const spy = jest.spyOn(cp, 'execSync');
      spy.mockImplementation((cmd) => {
        if (cmd.includes('branch --show-current')) return 'main\n';
        if (cmd.includes('status --porcelain')) return '';
        return '';
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'git'] };
      const result = strip(buildStatusLine(content, null, cfg));
      expect(result).toContain('main');
      spy.mockRestore();
    });

    test('shows dirty indicator', () => {
      const spy = jest.spyOn(cp, 'execSync');
      spy.mockImplementation((cmd) => {
        if (cmd.includes('branch --show-current')) return 'dev\n';
        if (cmd.includes('status --porcelain')) return 'M file.js\n';
        return '';
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'git'] };
      const result = strip(buildStatusLine(content, null, cfg));
      expect(result).toContain('dev');
      expect(result).toContain('*');
      spy.mockRestore();
    });

    test('omits git when not in sections', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase'] };
      const result = strip(buildStatusLine(content, null, cfg));
      expect(result).not.toContain('main');
    });
  });

  describe('parseFrontmatter', () => {
    test('parses standard frontmatter fields', () => {
      const content = '---\ncurrent_phase: 23\ntotal_phases: 23\nphase_name: "Quality & Gap Closure"\nstatus: "planned"\n---\n# Body';
      const fm = parseFrontmatter(content);
      expect(fm.current_phase).toBe('23');
      expect(fm.total_phases).toBe('23');
      expect(fm.phase_name).toBe('Quality & Gap Closure');
      expect(fm.status).toBe('planned');
    });

    test('returns null for content without frontmatter', () => {
      expect(parseFrontmatter('# Just a heading')).toBeNull();
    });

    test('returns null for unclosed frontmatter', () => {
      expect(parseFrontmatter('---\nfoo: bar\n')).toBeNull();
    });

    test('handles Windows line endings', () => {
      const content = '---\r\ncurrent_phase: 5\r\ntotal_phases: 10\r\n---\r\n# Body';
      const fm = parseFrontmatter(content);
      expect(fm.current_phase).toBe('5');
      expect(fm.total_phases).toBe('10');
    });
  });

  describe('buildStatusLine prefers frontmatter over body', () => {
    test('uses frontmatter phase when body is stale', () => {
      const content = '---\ncurrent_phase: 23\ntotal_phases: 23\nphase_name: "Quality & Gap Closure"\nstatus: "planned"\nplans_complete: 0\nplans_total: 12\n---\n# State\n\nPhase: 20 of 23 (Agent Definition Audit)\nStatus: Not Started';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Phase 23/23');
      expect(result).toContain('Quality & Gap Closure');
      expect(result).not.toContain('Phase 20');
      expect(result).not.toContain('Agent Definition Audit');
    });

    test('uses frontmatter status when body is stale', () => {
      const content = '---\ncurrent_phase: 23\ntotal_phases: 23\nstatus: "planned"\n---\n# State\n\nPhase: 20 of 23\nStatus: Not Started';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('planned');
    });

    test('uses frontmatter plan counts over body', () => {
      const content = '---\ncurrent_phase: 5\ntotal_phases: 10\nplans_complete: 3\nplans_total: 5\n---\n# State\n\nPhase: 5 of 10\nPlan: 1 of 2';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Plan 3/5');
      expect(result).not.toContain('Plan 1/2');
    });

    test('falls back to body when no frontmatter', () => {
      const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Phase 3/10');
      expect(result).toContain('Plan 2/4');
    });

    test('hides plan section when frontmatter plans_total is 0', () => {
      const content = '---\ncurrent_phase: 23\ntotal_phases: 23\nplans_complete: 0\nplans_total: 0\n---\n# State\n\nPhase: 23 of 23';
      const result = strip(buildStatusLine(content, null));
      expect(result).not.toMatch(/Plan \d+\/\d+/);
    });
  });

  describe('buildStatusLine with cost/model/duration', () => {
    test('shows cost from stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'cost'] };
      const sd = { cost: { total_cost_usd: 0.42 } };
      const result = strip(buildStatusLine(content, null, cfg, sd));
      expect(result).toContain('$0.42');
    });

    test('shows model name from stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'model'] };
      const sd = { model: { display_name: 'Opus' } };
      const result = strip(buildStatusLine(content, null, cfg, sd));
      expect(result).toContain('Opus');
    });

    test('shows duration from stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'duration'] };
      const sd = { cost: { total_duration_ms: 180000 } };
      const result = strip(buildStatusLine(content, null, cfg, sd));
      expect(result).toContain('3m');
    });

    test('omits cost when not in stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'cost'] };
      const result = strip(buildStatusLine(content, null, cfg, {}));
      expect(result).not.toContain('$');
    });

    test('omits model when not in stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'model'] };
      const result = strip(buildStatusLine(content, null, cfg, {}));
      // Only phase brand should be present
      expect(result).toContain('Plan-Build-Run');
    });

    test('omits duration when not in stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'duration'] };
      const result = strip(buildStatusLine(content, null, cfg, {}));
      expect(result).toContain('Plan-Build-Run');
    });

    test('cost color yellow above $1', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['cost'] };
      const sd = { cost: { total_cost_usd: 2.50 } };
      const raw = buildStatusLine(content, null, cfg, sd);
      expect(raw).toContain('\x1b[33m$2.50');
    });

    test('cost color red above $5', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['cost'] };
      const sd = { cost: { total_cost_usd: 7.00 } };
      const raw = buildStatusLine(content, null, cfg, sd);
      expect(raw).toContain('\x1b[31m$7.00');
    });
  });

  describe('formatTokens', () => {
    test('formats millions with M suffix', () => {
      expect(formatTokens(1_500_000)).toBe('1.5M');
    });

    test('formats thousands with K suffix', () => {
      expect(formatTokens(12_300)).toBe('12.3K');
    });

    test('formats exact million', () => {
      expect(formatTokens(1_000_000)).toBe('1.0M');
    });

    test('formats exact thousand', () => {
      expect(formatTokens(1_000)).toBe('1.0K');
    });

    test('formats small numbers without suffix', () => {
      expect(formatTokens(500)).toBe('500');
    });

    test('formats zero', () => {
      expect(formatTokens(0)).toBe('0');
    });
  });

  describe('buildStatusLine with llm section', () => {
    const llmMetricsModule = require('../plugins/pbr/scripts/local-llm/metrics');

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('shows LLM stats when metrics exist', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 42,
        fallback_count: 2,
        avg_latency_ms: 150,
        tokens_saved: 85_000,
        cost_saved_usd: 0.26,
        by_operation: {}
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, '/fake/.planning'));
      expect(result).toContain('LLM 42x 85.0K saved');
    });

    test('uses green color for LLM stats', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 10,
        fallback_count: 0,
        avg_latency_ms: 100,
        tokens_saved: 5_000,
        cost_saved_usd: 0.02,
        by_operation: {}
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const raw = buildStatusLine(content, null, cfg, {}, '/fake/.planning');
      expect(raw).toContain('\x1b[32mLLM 10x 5.0K saved');
    });

    test('omits LLM section when no calls', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 0,
        fallback_count: 0,
        avg_latency_ms: 0,
        tokens_saved: 0,
        cost_saved_usd: 0,
        by_operation: {}
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, '/fake/.planning'));
      expect(result).not.toContain('LLM');
    });

    test('omits LLM section when computeLifetimeMetrics throws', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockImplementation(() => {
        throw new Error('no log file');
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, '/fake/.planning'));
      expect(result).not.toContain('LLM');
    });

    test('omits LLM section when not in sections array', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 42,
        fallback_count: 0,
        avg_latency_ms: 100,
        tokens_saved: 50_000,
        cost_saved_usd: 0.15,
        by_operation: {}
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'context'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, '/fake/.planning'));
      expect(result).not.toContain('LLM');
    });

    test('omits LLM section when planningDir is not provided', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 42,
        fallback_count: 0,
        avg_latency_ms: 100,
        tokens_saved: 50_000,
        cost_saved_usd: 0.15,
        by_operation: {}
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const result = strip(buildStatusLine(content, null, cfg, {}));
      expect(result).not.toContain('LLM');
    });

    test('formats large token counts with M suffix', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 200,
        fallback_count: 5,
        avg_latency_ms: 200,
        tokens_saved: 2_500_000,
        cost_saved_usd: 7.50,
        by_operation: {}
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, '/fake/.planning'));
      expect(result).toContain('LLM 200x 2.5M saved');
    });
  });

  describe('DEFAULTS includes llm section', () => {
    test('default sections include llm', () => {
      expect(DEFAULTS.sections).toContain('llm');
    });
  });
});
