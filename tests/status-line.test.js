const { buildStatusLine, buildContextBar, getContextPercent, getGitInfo, getMilestone, countPhaseDirs, isHookServerRunning, getHookServerStatus, getVersion, countTodos, countQuickTasks, countSkills, countHookEntries, getCoverage, getLastTestResult, getCiStatus, formatDuration, formatTokens, loadStatusLineConfig, parseFrontmatter, DEFAULTS } = require('../hooks/status-line');
const { configClearCache } = require('../plan-build-run/bin/lib/config.cjs');

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
      expect(result).toContain('\u25C6 PBR');
      expect(result).toContain('Phase 3/10');
      expect(result).toContain('building');
      expect(result).toContain('Plan 2/4');
      expect(result).toContain('45%');
    });

    test('includes phase info only', () => {
      const content = 'Phase: 1 of 5';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('PBR');
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
      expect(result).toContain('\u25C6 PBR');
    });

    test('shows brand even with no parseable fields', () => {
      const result = strip(buildStatusLine('Just some random text', null));
      expect(result).toContain('\u25C6 PBR');
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

    test('status with no phase still shows PBR brand', () => {
      const content = 'Status: idle';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('\u25C6 PBR');
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

      test('default sections include phase, plan, status, agent, git, hooks, context, llm', () => {
        expect(DEFAULTS.sections).toEqual(['phase', 'plan', 'status', 'agent', 'git', 'hooks', 'context', 'llm']);
      });

      test('default brand text is diamond PBR', () => {
        expect(DEFAULTS.brand_text).toBe('\u25C6 PBR');
      });
    });

    describe('buildStatusLine with config', () => {
      test('uses default config when none provided', () => {
        const content = 'Phase: 3 of 10 (building)\nPlan: 2 of 4\nStatus: building';
        const result = strip(buildStatusLine(content, 45));
        expect(result).toContain('\u25C6 PBR');
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
        // Also clear pbr-tools configLoad cache (separate from config.cjs cache)
        try { require('../plugins/pbr/scripts/pbr-tools').configClearCache(); } catch (_e) { /* ok */ }
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
        // Verify structure matches DEFAULTS shape (values may differ due to project config cache)
        expect(result).toHaveProperty('sections');
        expect(result).toHaveProperty('brand_text');
        expect(result).toHaveProperty('max_status_length');
        expect(result).toHaveProperty('context_bar.width');
        expect(result).toHaveProperty('context_bar.thresholds.green');
        expect(result).toHaveProperty('context_bar.thresholds.yellow');
        expect(result).toHaveProperty('context_bar.chars.filled');
        expect(result).toHaveProperty('context_bar.chars.empty');
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
        expect(Array.isArray(result.sections)).toBe(true);
        expect(typeof result.max_status_length).toBe('number');
        expect(result.context_bar).toHaveProperty('width');
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
        // Other context_bar fields should still have values
        expect(result.context_bar.thresholds).toHaveProperty('green');
        expect(result.context_bar.chars).toHaveProperty('filled');
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
        expect(typeof result.context_bar.width).toBe('number');
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
      const content = '---\ncurrent_phase: 23\nphase_name: "Quality & Gap Closure"\nstatus: "planned"\n---\n# Body';
      const fm = parseFrontmatter(content);
      expect(fm.current_phase).toBe('23');
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
      const content = '---\r\ncurrent_phase: 5\r\n---\r\n# Body';
      const fm = parseFrontmatter(content);
      expect(fm.current_phase).toBe('5');
    });

    test('skips YAML null values', () => {
      const content = '---\ncurrent_phase: null\nphase_slug: null\nstatus: "milestone_complete"\n---\n# Body';
      const fm = parseFrontmatter(content);
      expect(fm.current_phase).toBeUndefined();
      expect(fm.phase_slug).toBeUndefined();
      expect(fm.status).toBe('milestone_complete');
    });

    test('skips empty values', () => {
      const content = '---\ncurrent_phase: \nstatus: building\n---\n# Body';
      const fm = parseFrontmatter(content);
      expect(fm.current_phase).toBeUndefined();
      expect(fm.status).toBe('building');
    });
  });

  describe('buildStatusLine between milestones (null phases)', () => {
    test('shows only brand when all frontmatter phase fields are null', () => {
      const content = '---\ncurrent_phase: null\nphase_slug: null\nphase_name: null\nstatus: "milestone_complete"\nplans_total: 17\nplans_complete: 17\n---\n# State\nPhase: (none)';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('\u25C6 PBR');
      // Should NOT show "Phase null" or "null/17"
      expect(result).not.toContain('null');
      expect(result).toContain('milestone_complete');
    });

    test('shows plan count when plans_complete and plans_total are valid numbers', () => {
      const content = '---\ncurrent_phase: null\nstatus: "milestone_complete"\nplans_total: 17\nplans_complete: 17\n---\n# State';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Plan 17/17');
    });
  });

  describe('buildStatusLine prefers frontmatter over body', () => {
    test('uses frontmatter phase when body is stale', () => {
      const content = '---\ncurrent_phase: 23\nphase_name: "Quality & Gap Closure"\nstatus: "planned"\nplans_complete: 0\nplans_total: 12\n---\n# State\n\nPhase: 20 of 23 (Agent Definition Audit)\nStatus: Not Started';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Phase 23/23');
      expect(result).toContain('Quality & Gap Closure');
      expect(result).not.toContain('Phase 20');
      expect(result).not.toContain('Agent Definition Audit');
    });

    test('uses frontmatter status when body is stale', () => {
      const content = '---\ncurrent_phase: 23\nstatus: "planned"\n---\n# State\n\nPhase: 20 of 23\nStatus: Not Started';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('planned');
    });

    test('uses frontmatter plan counts over body', () => {
      const content = '---\ncurrent_phase: 5\nplans_complete: 3\nplans_total: 5\n---\n# State\n\nPhase: 5 of 10\nPlan: 1 of 2';
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
      const content = '---\ncurrent_phase: 23\nplans_complete: 0\nplans_total: 0\n---\n# State\n\nPhase: 23 of 23';
      const result = strip(buildStatusLine(content, null));
      expect(result).not.toMatch(/Plan \d+\/\d+/);
    });

    test('uses phase_slug from frontmatter when phase_name is absent', () => {
      const content = '---\ncurrent_phase: 75\nphase_slug: "schema-alignment"\nstatus: "built"\nplans_complete: 3\nplans_total: 5\n---\n# State\n\nPhase: 75 of 39 (Schema Alignment)\nStatus: Built';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Schema Alignment');
    });

    test('formats phase_slug hyphens as title-cased words', () => {
      const content = '---\ncurrent_phase: 10\nphase_slug: "http-hook-server"\nstatus: "building"\n---\n# State\n\nPhase: 10 of 20';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Http Hook Server');
    });

    test('prefers phase_name over phase_slug when both exist', () => {
      const content = '---\ncurrent_phase: 5\nphase_name: "Custom Name"\nphase_slug: "custom-name"\nstatus: "planned"\n---\n# State\n\nPhase: 5 of 10';
      const result = strip(buildStatusLine(content, null));
      expect(result).toContain('Custom Name');
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
      expect(result).toContain('PBR');
    });

    test('omits duration when not in stdinData', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'duration'] };
      const result = strip(buildStatusLine(content, null, cfg, {}));
      expect(result).toContain('PBR');
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

  // LLM metrics tests removed — local-llm module deleted in Phase 53 (dead feature cleanup)
  describe.skip('buildStatusLine with llm section (REMOVED — local-llm deleted)', () => {
    const llmMetricsModule = {};

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('shows lifetime-only when no session duration in stdinData', () => {
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
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('Phase 1/5');
      expect(lines[1]).toContain('Local LLM');
      expect(lines[1]).toContain('42 calls');
      expect(lines[1]).toContain('85.0K saved');
      expect(lines[1]).not.toContain('lifetime');
    });

    test('shows session stats and lifetime when duration is available', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 42,
        fallback_count: 2,
        avg_latency_ms: 150,
        tokens_saved: 85_000,
        cost_saved_usd: 0.26,
        by_operation: {}
      });
      jest.spyOn(llmMetricsModule, 'readSessionMetrics').mockReturnValue([
        { tokens_saved_frontier: 5000, latency_ms: 100, fallback_used: false },
        { tokens_saved_frontier: 7000, latency_ms: 120, fallback_used: false }
      ]);
      jest.spyOn(llmMetricsModule, 'summarizeMetrics').mockReturnValue({
        total_calls: 2,
        fallback_count: 0,
        avg_latency_ms: 110,
        tokens_saved: 12_000,
        cost_saved_usd: 0.04
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const sd = { cost: { total_duration_ms: 300000 } };
      const result = strip(buildStatusLine(content, null, cfg, sd, '/fake/.planning'));
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Local LLM');
      expect(lines[1]).toContain('2 calls');
      expect(lines[1]).toContain('12.0K saved');
      expect(lines[1]).toContain('85.0K lifetime');
    });

    test('falls back to lifetime-only when session has zero calls', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 42,
        fallback_count: 0,
        avg_latency_ms: 150,
        tokens_saved: 85_000,
        cost_saved_usd: 0.26,
        by_operation: {}
      });
      jest.spyOn(llmMetricsModule, 'readSessionMetrics').mockReturnValue([]);
      jest.spyOn(llmMetricsModule, 'summarizeMetrics').mockReturnValue({
        total_calls: 0,
        fallback_count: 0,
        avg_latency_ms: 0,
        tokens_saved: 0,
        cost_saved_usd: 0
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const sd = { cost: { total_duration_ms: 60000 } };
      const result = strip(buildStatusLine(content, null, cfg, sd, '/fake/.planning'));
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('42 calls');
      expect(lines[1]).toContain('85.0K saved');
      expect(lines[1]).not.toContain('lifetime');
    });

    test('uses green color for Local LLM label', () => {
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
      expect(raw).toContain('\x1b[32mLocal LLM\x1b[0m');
    });

    test('omits LLM line when no calls', () => {
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
      expect(result).not.toContain('Local LLM');
      expect(result).not.toContain('\n');
    });

    test('omits LLM line when computeLifetimeMetrics throws', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockImplementation(() => {
        throw new Error('no log file');
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, '/fake/.planning'));
      expect(result).not.toContain('Local LLM');
      expect(result).not.toContain('\n');
    });

    test('omits LLM line when not in sections array', () => {
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
      expect(result).not.toContain('Local LLM');
    });

    test('omits LLM line when planningDir is not provided', () => {
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
      expect(result).not.toContain('Local LLM');
    });

    test('formats large token counts with M suffix on second line', () => {
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
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('200 calls');
      expect(lines[1]).toContain('2.5M saved');
    });

    test('shows session + lifetime with M suffix formatting', () => {
      jest.spyOn(llmMetricsModule, 'computeLifetimeMetrics').mockReturnValue({
        total_calls: 200,
        fallback_count: 5,
        avg_latency_ms: 200,
        tokens_saved: 2_500_000,
        cost_saved_usd: 7.50,
        by_operation: {}
      });
      jest.spyOn(llmMetricsModule, 'readSessionMetrics').mockReturnValue([
        { tokens_saved_frontier: 500000, latency_ms: 100, fallback_used: false }
      ]);
      jest.spyOn(llmMetricsModule, 'summarizeMetrics').mockReturnValue({
        total_calls: 1,
        fallback_count: 0,
        avg_latency_ms: 100,
        tokens_saved: 500_000,
        cost_saved_usd: 1.50
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'llm'] };
      const sd = { cost: { total_duration_ms: 120000 } };
      const result = strip(buildStatusLine(content, null, cfg, sd, '/fake/.planning'));
      const lines = result.split('\n');
      expect(lines[1]).toContain('500.0K saved');
      expect(lines[1]).toContain('2.5M lifetime');
    });
  });

  describe('DEFAULTS includes new sections', () => {
    test('default sections include llm', () => {
      // llm section remains in defaults even though module was removed — renders nothing gracefully
      expect(DEFAULTS.sections).toContain('llm');
    });

    test('default sections do not include milestone', () => {
      expect(DEFAULTS.sections).not.toContain('milestone');
    });

    test('default sections include hooks', () => {
      expect(DEFAULTS.sections).toContain('hooks');
    });
  });

  describe('getMilestone', () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const osMod = require('os');

    let tmpDir;

    beforeEach(() => {
      tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-milestone-'));
    });

    afterEach(() => {
      fsMod.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns null when no ROADMAP.md exists', () => {
      expect(getMilestone(tmpDir)).toBeNull();
    });

    test('extracts milestone name from ROADMAP.md', () => {
      fsMod.writeFileSync(pathMod.join(tmpDir, 'ROADMAP.md'),
        '# Roadmap\n\n## Milestone: MyApp v1.0\n\n### Phase 1\n');
      expect(getMilestone(tmpDir)).toBe('MyApp v1.0');
    });

    test('skips completed milestones', () => {
      fsMod.writeFileSync(pathMod.join(tmpDir, 'ROADMAP.md'),
        '# Roadmap\n\n## Milestone: MyApp v0.9 -- COMPLETED\n\n## Milestone: MyApp v1.0\n\n### Phase 1\n');
      expect(getMilestone(tmpDir)).toBe('MyApp v1.0');
    });

    test('returns null when all milestones are completed', () => {
      fsMod.writeFileSync(pathMod.join(tmpDir, 'ROADMAP.md'),
        '# Roadmap\n\n## Milestone: MyApp v0.9 -- COMPLETED\n\n## Milestone: MyApp v1.0 -- COMPLETED\n');
      expect(getMilestone(tmpDir)).toBeNull();
    });

    test('returns null for ROADMAP.md without milestone header', () => {
      fsMod.writeFileSync(pathMod.join(tmpDir, 'ROADMAP.md'),
        '# Roadmap\n\n## Phase 1\n\nSome content\n');
      expect(getMilestone(tmpDir)).toBeNull();
    });
  });

  describe('isHookServerRunning', () => {
    test('returns false for a port with no listener', () => {
      // Use a random high port that's almost certainly not in use
      expect(isHookServerRunning(59999)).toBe(false);
    });

    test('returns true when a server is listening', () => {
      const netMod = require('net');
      const server = netMod.createServer();
      server.listen(0); // random available port
      const port = server.address().port;
      try {
        expect(isHookServerRunning(port)).toBe(true);
      } finally {
        server.close();
      }
    });
  });

  describe('buildStatusLine with milestone section', () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const osMod = require('os');

    let tmpDir;

    beforeEach(() => {
      tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-ms-'));
    });

    afterEach(() => {
      fsMod.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('shows milestone name in status line', () => {
      fsMod.writeFileSync(pathMod.join(tmpDir, 'ROADMAP.md'),
        '# Roadmap\n\n## Milestone: PBR v3.0\n\n### Phase 1\n');
      const content = 'Phase: 1 of 5\nStatus: building';
      const cfg = { ...DEFAULTS, sections: ['milestone', 'phase', 'status'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, tmpDir));
      expect(result).toContain('PBR v3.0');
      expect(result).toContain('Phase 1/5');
    });

    test('shows brand without milestone when no ROADMAP.md', () => {
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['milestone', 'phase'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, tmpDir));
      expect(result).toContain('\u25C6 PBR');
      expect(result).toContain('Phase 1/5');
    });
  });

  describe('buildStatusLine with hooks section', () => {
    test('shows green filled circle with label when hook server is running', () => {
      const cpMod = require('child_process');
      const spy = jest.spyOn(cpMod, 'execSync').mockReturnValue('1');
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'hooks'] };
      const result = strip(buildStatusLine(content, null, cfg));
      expect(result).toContain('\u25CF hooks');
      spy.mockRestore();
    });

    test('shows dim empty circle with label when hook server is stopped', () => {
      const cpMod = require('child_process');
      const spy = jest.spyOn(cpMod, 'execSync').mockImplementation(() => {
        throw new Error('connection refused');
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'hooks'] };
      const result = strip(buildStatusLine(content, null, cfg));
      expect(result).toContain('\u25CB hooks');
      spy.mockRestore();
    });

    test('shows red filled circle when circuit breaker is open', () => {
      const cpMod = require('child_process');
      const fsMod = require('fs');
      const pathMod = require('path');
      const osMod = require('os');

      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-hooks-'));
      // Write circuit breaker file with open state
      fsMod.writeFileSync(
        pathMod.join(tmpDir, '.hook-server-circuit.json'),
        JSON.stringify({ failures: 5, openedAt: Date.now() })
      );

      const spy = jest.spyOn(cpMod, 'execSync').mockImplementation(() => {
        throw new Error('connection refused');
      });
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'hooks'] };
      const raw = buildStatusLine(content, null, cfg, {}, tmpDir);
      const result = strip(raw);
      expect(result).toContain('\u25CF hooks');
      // Verify it uses red color (not green or dim)
      expect(raw).toContain('\x1b[31m\u25CF hooks');
      spy.mockRestore();
      fsMod.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('getHookServerStatus', () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const osMod = require('os');

    test('returns running when server is listening', () => {
      const netMod = require('net');
      const server = netMod.createServer();
      server.listen(0);
      const port = server.address().port;
      try {
        expect(getHookServerStatus(port)).toBe('running');
      } finally {
        server.close();
      }
    });

    test('returns stopped when server is down and no circuit file', () => {
      expect(getHookServerStatus(59998)).toBe('stopped');
    });

    test('returns stopped when server is down and no planningDir', () => {
      expect(getHookServerStatus(59998, null)).toBe('stopped');
    });

    test('returns failed when circuit breaker is open', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-hs-'));
      fsMod.writeFileSync(
        pathMod.join(tmpDir, '.hook-server-circuit.json'),
        JSON.stringify({ failures: 5, openedAt: Date.now() })
      );
      try {
        expect(getHookServerStatus(59998, tmpDir)).toBe('failed');
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('returns stopped when circuit breaker cooldown expired', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-hs-'));
      fsMod.writeFileSync(
        pathMod.join(tmpDir, '.hook-server-circuit.json'),
        JSON.stringify({ failures: 5, openedAt: Date.now() - 60000 })
      );
      try {
        expect(getHookServerStatus(59998, tmpDir)).toBe('stopped');
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('returns stopped when failures below threshold', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-hs-'));
      fsMod.writeFileSync(
        pathMod.join(tmpDir, '.hook-server-circuit.json'),
        JSON.stringify({ failures: 3, openedAt: 0 })
      );
      try {
        expect(getHookServerStatus(59998, tmpDir)).toBe('stopped');
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('plan section display logic', () => {
    test('shows Plan done/total in green when all plans complete', () => {
      const content = 'Phase: 2 of 5\nPlan: 3 of 3';
      const raw = buildStatusLine(content, null, DEFAULTS);
      const result = strip(raw);
      expect(result).toContain('Plan 3/3');
      // Green color when done === total
      expect(raw).toContain('\x1b[32mPlan 3/3');
    });

    test('shows Plan done/total when in progress', () => {
      const content = 'Phase: 2 of 5\nPlan: 1 of 4';
      const result = strip(buildStatusLine(content, null, DEFAULTS));
      expect(result).toContain('Plan 1/4');
    });

    test('shows Plan 0/N when no plans complete', () => {
      const content = 'Phase: 1 of 5\nPlan: 0 of 3';
      const result = strip(buildStatusLine(content, null, DEFAULTS));
      expect(result).toContain('Plan 0/3');
    });
  });

  describe('dev line helpers', () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const osMod = require('os');

    test('getVersion reads package.json version', () => {
      const ver = getVersion();
      expect(ver).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('countTodos returns 0 when no pending dir', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      try {
        expect(countTodos(tmpDir)).toBe(0);
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('countTodos counts .md files in pending/', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      const pending = pathMod.join(tmpDir, 'todos', 'pending');
      fsMod.mkdirSync(pending, { recursive: true });
      fsMod.writeFileSync(pathMod.join(pending, 'todo-1.md'), 'todo');
      fsMod.writeFileSync(pathMod.join(pending, 'todo-2.md'), 'todo');
      fsMod.writeFileSync(pathMod.join(pending, 'not-md.txt'), 'skip');
      try {
        expect(countTodos(tmpDir)).toBe(2);
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('countQuickTasks counts dirs and detects open tasks', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      const quickDir = pathMod.join(tmpDir, 'quick');
      fsMod.mkdirSync(pathMod.join(quickDir, '001-done'), { recursive: true });
      fsMod.writeFileSync(pathMod.join(quickDir, '001-done', 'SUMMARY.md'), 'done');
      fsMod.mkdirSync(pathMod.join(quickDir, '002-open'), { recursive: true });
      try {
        const result = countQuickTasks(tmpDir);
        expect(result.total).toBe(2);
        expect(result.open).toBe(1);
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('countHookEntries counts from hooks.json', () => {
      const count = countHookEntries();
      expect(count).toBeGreaterThan(0);
    });

    test('getCoverage reads coverage-summary.json', () => {
      const cov = getCoverage();
      // May be null if no coverage file, or a number if present
      if (cov !== null) {
        expect(typeof cov).toBe('number');
        expect(cov).toBeGreaterThanOrEqual(0);
        expect(cov).toBeLessThanOrEqual(100);
      }
    });

    test('getLastTestResult returns null when no cache file', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      try {
        expect(getLastTestResult(tmpDir)).toBeNull();
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('getLastTestResult reads cached test data', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      fsMod.writeFileSync(pathMod.join(tmpDir, '.last-test.json'),
        JSON.stringify({ passed: 125, failed: 0, total: 125 }));
      try {
        const result = getLastTestResult(tmpDir);
        expect(result.total).toBe(125);
        expect(result.failed).toBe(0);
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('getCiStatus returns null when no cache file', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      try {
        expect(getCiStatus(tmpDir)).toBeNull();
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('getCiStatus reads cached CI data', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      fsMod.writeFileSync(pathMod.join(tmpDir, '.ci-status.json'),
        JSON.stringify({ status: 'pass', branch: 'main' }));
      try {
        const result = getCiStatus(tmpDir);
        expect(result.status).toBe('pass');
      } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('buildStatusLine with dev section', () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const osMod = require('os');

    test('renders dev line with version and quick tasks', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      const quickDir = pathMod.join(tmpDir, 'quick');
      fsMod.mkdirSync(pathMod.join(quickDir, '001-task'), { recursive: true });
      fsMod.writeFileSync(pathMod.join(quickDir, '001-task', 'SUMMARY.md'), 'done');
      const content = 'Phase: 1 of 5\nStatus: building';
      const cfg = { ...DEFAULTS, sections: ['phase', 'dev'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, tmpDir));
      expect(result).toContain('dev');
      expect(result).toContain('Q:1');
      try { /* cleanup */ } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('renders test failures in red', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      fsMod.writeFileSync(pathMod.join(tmpDir, '.last-test.json'),
        JSON.stringify({ passed: 123, failed: 2, total: 125 }));
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'dev'] };
      const raw = buildStatusLine(content, null, cfg, {}, tmpDir);
      const result = strip(raw);
      expect(result).toContain('2 fail');
      // Red color for failures
      expect(raw).toContain('\x1b[31m');
      try { /* cleanup */ } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('renders CI pass in green', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      fsMod.writeFileSync(pathMod.join(tmpDir, '.ci-status.json'),
        JSON.stringify({ status: 'pass', branch: 'main' }));
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'dev'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, tmpDir));
      expect(result).toContain('CI');
      try { /* cleanup */ } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('shows todo count when todos exist', () => {
      const tmpDir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'sl-dev-'));
      const pending = pathMod.join(tmpDir, 'todos', 'pending');
      fsMod.mkdirSync(pending, { recursive: true });
      fsMod.writeFileSync(pathMod.join(pending, 'fix-bug.md'), 'todo');
      const content = 'Phase: 1 of 5';
      const cfg = { ...DEFAULTS, sections: ['phase', 'dev'] };
      const result = strip(buildStatusLine(content, null, cfg, {}, tmpDir));
      expect(result).toContain('1 todo');
      try { /* cleanup */ } finally {
        fsMod.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
