const { checkCompaction, checkBridgeTier, buildCompositionAdvice, loadCounter, saveCounter, getThreshold, getScaledThreshold, resetCounter, DEFAULT_THRESHOLD, REMINDER_INTERVAL } = require('../plugins/pbr/scripts/suggest-compact');
const { createRunner, createTmpPlanning, cleanupTmp } = require('./helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'suggest-compact.js');
const _run = createRunner(SCRIPT);
const runScript = (cwd, toolInput) => _run({ tool_input: toolInput }, { cwd });

describe('suggest-compact.js', () => {
  describe('loadCounter', () => {
    test('returns zeroed counter when file does not exist', () => {
      const counter = loadCounter('/nonexistent/.compact-counter');
      expect(counter.count).toBe(0);
      expect(counter.lastSuggested).toBe(0);
    });

    test('loads existing counter', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, JSON.stringify({ count: 42, lastSuggested: 0 }));
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(42);
      expect(counter.lastSuggested).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('handles malformed JSON gracefully', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, 'not json');
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  describe('saveCounter', () => {
    test('writes counter to file', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: 10, lastSuggested: 0 });
      const data = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
      expect(data.count).toBe(10);
      cleanupTmp(tmpDir);
    });
  });

  describe('getThreshold', () => {
    test('returns default when no config.json', () => {
      const { tmpDir } = createTmpPlanning();
      expect(getThreshold(tmpDir)).toBe(DEFAULT_THRESHOLD);
      cleanupTmp(tmpDir);
    });

    test('returns default when no hooks.compactThreshold in config', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      expect(getThreshold(tmpDir)).toBe(DEFAULT_THRESHOLD);
      cleanupTmp(tmpDir);
    });

    test('returns configured threshold', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { compactThreshold: 30 } }));
      expect(getThreshold(tmpDir)).toBe(30);
      cleanupTmp(tmpDir);
    });
  });

  describe('getScaledThreshold', () => {
    test('returns 250 when config has context_window_tokens: 1000000', () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 1000000 }));
      configClearCache();
      expect(getScaledThreshold(planningDir)).toBe(250);
      configClearCache();
      cleanupTmp(tmpDir);
    });

    test('returns 50 (default) when no config', () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      const { tmpDir, planningDir } = createTmpPlanning();
      configClearCache();
      expect(getScaledThreshold(planningDir)).toBe(50);
      cleanupTmp(tmpDir);
    });
  });

  describe('resetCounter', () => {
    test('deletes counter file', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, JSON.stringify({ count: 99, lastSuggested: 50 }));
      resetCounter(planningDir);
      expect(fs.existsSync(counterPath)).toBe(false);
      cleanupTmp(tmpDir);
    });

    test('does not throw when file does not exist', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      expect(() => resetCounter(planningDir)).not.toThrow();
      cleanupTmp(tmpDir);
    });
  });

  describe('checkCompaction', () => {
    test('returns null below threshold', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const result = checkCompaction(planningDir, tmpDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('increments counter each call', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      checkCompaction(planningDir, tmpDir);
      checkCompaction(planningDir, tmpDir);
      checkCompaction(planningDir, tmpDir);
      const counter = loadCounter(path.join(planningDir, '.compact-counter'));
      expect(counter.count).toBe(3);
      cleanupTmp(tmpDir);
    });

    test('suggests at threshold', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      // Pre-seed counter just below threshold
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget]');
      expect(result.additionalContext).toContain(`${DEFAULT_THRESHOLD}`);
      expect(result.additionalContext).toContain('/compact');
      cleanupTmp(tmpDir);
    });

    test('does not re-suggest immediately after first suggestion', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      // Set counter at threshold with lastSuggested already set
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD, lastSuggested: DEFAULT_THRESHOLD });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('re-suggests after reminder interval', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      // Set counter at threshold + REMINDER_INTERVAL - 1 (one call away from re-suggestion)
      const count = DEFAULT_THRESHOLD + REMINDER_INTERVAL - 1;
      saveCounter(counterPath, { count, lastSuggested: DEFAULT_THRESHOLD });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget]');
      cleanupTmp(tmpDir);
    });

    test('uses configured threshold', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      // Set low threshold
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ hooks: { compactThreshold: 5 } }));
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: 4, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('5 tool calls');
      expect(result.additionalContext).toContain('threshold: 5');
      cleanupTmp(tmpDir);
    });
  });

  describe('checkBridgeTier', () => {
    function makeBridge(planningDir, percent, ageMs = 0) {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      const timestamp = new Date(Date.now() - ageMs).toISOString();
      fs.writeFileSync(bridgePath, JSON.stringify({ estimated_percent: percent, timestamp }), 'utf8');
    }

    test('returns null when bridge file is absent', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      expect(checkBridgeTier(planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null for PEAK tier (25%)', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 25);
      expect(checkBridgeTier(planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns DEGRADING for 55%', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 55);
      const result = checkBridgeTier(planningDir);
      expect(result).not.toBeNull();
      expect(result.tier).toBe('DEGRADING');
      expect(result.message).toContain('50-70%');
      cleanupTmp(tmpDir);
    });

    test('returns POOR for 75%', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 75);
      const result = checkBridgeTier(planningDir);
      expect(result).not.toBeNull();
      expect(result.tier).toBe('POOR');
      expect(result.message).toContain('70-85%');
      cleanupTmp(tmpDir);
    });

    test('returns CRITICAL for 90%', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 90);
      const result = checkBridgeTier(planningDir);
      expect(result).not.toBeNull();
      expect(result.tier).toBe('CRITICAL');
      expect(result.message).toContain('85%+');
      cleanupTmp(tmpDir);
    });

    test('returns null for stale bridge (120s old)', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 90, 120000);
      expect(checkBridgeTier(planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns tier for bridge just under staleness threshold (59s old)', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 75, 59000);
      const result = checkBridgeTier(planningDir);
      expect(result).not.toBeNull();
      expect(result.tier).toBe('POOR');
      cleanupTmp(tmpDir);
    });
  });

  describe('checkCompaction with bridge tier', () => {
    function makeBridge(planningDir, percent, ageMs = 0) {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      const timestamp = new Date(Date.now() - ageMs).toISOString();
      fs.writeFileSync(bridgePath, JSON.stringify({ estimated_percent: percent, timestamp }), 'utf8');
    }

    test('emits tier-labeled DEGRADING message when bridge is fresh at 55%', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 55);
      // Seed counter at threshold so counter would trigger too
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget - DEGRADING]');
      cleanupTmp(tmpDir);
    });

    test('emits tier-labeled POOR message when bridge is fresh at 75%', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 75);
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget - POOR]');
      cleanupTmp(tmpDir);
    });

    test('CRITICAL tier always emits regardless of debounce', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 90);
      // Set counter so it would be debounced normally (just after suggestion)
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD, lastSuggested: DEFAULT_THRESHOLD });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget - CRITICAL]');
      cleanupTmp(tmpDir);
    });

    test('falls back to counter warning when bridge is stale (120s old)', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 90, 120000);
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget]');
      expect(result.additionalContext).not.toContain('[Context Budget - ');
      cleanupTmp(tmpDir);
    });

    test('falls back to counter warning when bridge is absent', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget]');
      expect(result.additionalContext).not.toContain('[Context Budget - ');
      cleanupTmp(tmpDir);
    });

    test('PEAK tier (25%) falls through to counter check', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      makeBridge(planningDir, 25);
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      // Should use counter-based message (no tier label)
      expect(result.additionalContext).toContain('[Context Budget]');
      expect(result.additionalContext).not.toContain('[Context Budget - ');
      cleanupTmp(tmpDir);
    });
  });

  describe('composition advice', () => {
    test('returns null when no ledger file exists', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const result = buildCompositionAdvice(planningDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('returns null when ledger is empty array', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), '[]');
      const result = buildCompositionAdvice(planningDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('groups by phase and computes totals', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const now = new Date().toISOString();
      const entries = [
        { file: 'a.js', timestamp: now, est_tokens: 1000, phase: 'auth', stale: false },
        { file: 'b.js', timestamp: now, est_tokens: 2000, phase: 'auth', stale: false },
        { file: 'c.js', timestamp: now, est_tokens: 500, phase: 'config', stale: false },
      ];
      fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), JSON.stringify(entries));
      const result = buildCompositionAdvice(planningDir);
      expect(result).not.toBeNull();
      expect(result).toContain('~4k tokens');
      expect(result).toContain('3 reads');
      // No stale entries, so no phase-level stale info and no /compact suggestion
      expect(result).not.toContain('stale');
      cleanupTmp(tmpDir);
    });

    test('identifies stale entries', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      // Write config with stale_after_minutes: 60
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        context_ledger: { enabled: true, stale_after_minutes: 60 }
      }));
      configClearCache();

      const now = Date.now();
      const oldTimestamp = new Date(now - 120 * 60 * 1000).toISOString(); // 120 min ago
      const recentTimestamp = new Date(now - 5 * 60 * 1000).toISOString(); // 5 min ago
      const entries = [
        { file: 'old.js', timestamp: oldTimestamp, est_tokens: 3000, phase: 'auth', stale: false },
        { file: 'new.js', timestamp: recentTimestamp, est_tokens: 1000, phase: 'auth', stale: false },
      ];
      fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), JSON.stringify(entries));
      const result = buildCompositionAdvice(planningDir);
      expect(result).not.toBeNull();
      expect(result).toContain('1 stale reads');
      expect(result).toContain('~3k');
      expect(result).toContain('/compact');
      configClearCache();
      cleanupTmp(tmpDir);
    });

    test('handles null phase as untracked', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const oldTimestamp = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      const entries = [
        { file: 'x.js', timestamp: oldTimestamp, est_tokens: 500, phase: null, stale: false },
      ];
      fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), JSON.stringify(entries));
      const result = buildCompositionAdvice(planningDir);
      expect(result).not.toBeNull();
      expect(result).toContain('untracked');
      cleanupTmp(tmpDir);
    });

    test('checkCompaction includes composition when bridge tier active and ledger exists', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      configClearCache();

      // Set up bridge at DEGRADING tier (55%)
      const bridgePath = path.join(planningDir, '.context-budget.json');
      const timestamp = new Date().toISOString();
      fs.writeFileSync(bridgePath, JSON.stringify({ estimated_percent: 55, timestamp }));

      // Write ledger with stale entries
      const oldTimestamp = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      const entries = [
        { file: 'a.js', timestamp: oldTimestamp, est_tokens: 2000, phase: 'auth', stale: false },
      ];
      fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), JSON.stringify(entries));

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('[Context Budget - DEGRADING]');
      expect(result.additionalContext).toContain('Context composition');
      expect(result.additionalContext).toContain('stale');
      configClearCache();
      cleanupTmp(tmpDir);
    });
  });

  describe('counter persistence edge cases', () => {
    test('loadCounter handles empty file', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, '');
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(0);
      expect(counter.lastSuggested).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('loadCounter handles partial JSON (missing fields)', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, JSON.stringify({ count: 5 }));
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(5);
      expect(counter.lastSuggested).toBe(0);
      cleanupTmp(tmpDir);
    });

    test('saveCounter does not throw on non-existent directory', () => {
      // saveCounter writes to a path — if dir doesn't exist, it fails silently
      expect(() => saveCounter('/nonexistent/dir/.compact-counter', { count: 1, lastSuggested: 0 })).not.toThrow();
    });

    test('loadCounter returns zeroed counter for truncated JSON', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      fs.writeFileSync(counterPath, '{"count":');
      const counter = loadCounter(counterPath);
      expect(counter.count).toBe(0);
      cleanupTmp(tmpDir);
    });
  });

  describe('threshold scaling boundaries', () => {
    test('getScaledThreshold returns 50 at 200k tokens (base)', () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 200000 }));
      configClearCache();
      expect(getScaledThreshold(planningDir)).toBe(50);
      configClearCache();
      cleanupTmp(tmpDir);
    });

    test('getScaledThreshold returns 125 at 500k tokens', () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 500000 }));
      configClearCache();
      expect(getScaledThreshold(planningDir)).toBe(125);
      configClearCache();
      cleanupTmp(tmpDir);
    });

    test('getScaledThreshold scales with orchestrator_budget_pct', () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      const { tmpDir, planningDir } = createTmpPlanning();
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        context_window_tokens: 200000,
        orchestrator_budget_pct: 50
      }));
      configClearCache();
      // 50 * (200k/200k) * (50/25) = 50 * 1 * 2 = 100
      expect(getScaledThreshold(planningDir)).toBe(100);
      configClearCache();
      cleanupTmp(tmpDir);
    });
  });

  describe('main() hook execution via stdin', () => {
    test('checkCompaction output has correct additionalContext JSON format', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('additionalContext');
      expect(typeof result.additionalContext).toBe('string');
      // Should NOT have decision or reason (PostToolUse format, not PreToolUse)
      expect(result).not.toHaveProperty('decision');
      expect(result).not.toHaveProperty('reason');
      cleanupTmp(tmpDir);
    });

    test('checkCompaction returns null when below threshold and no bridge', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const result = checkCompaction(planningDir, tmpDir);
      expect(result).toBeNull();
      cleanupTmp(tmpDir);
    });
  });

  describe('empty state handling', () => {
    test('checkCompaction works with no config.json', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      // No config.json — uses default threshold
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });
      const result = checkCompaction(planningDir, tmpDir);
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain(`${DEFAULT_THRESHOLD}`);
      cleanupTmp(tmpDir);
    });

    test('checkBridgeTier returns null when bridge file has malformed JSON', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const bridgePath = path.join(planningDir, '.context-budget.json');
      fs.writeFileSync(bridgePath, '{invalid json');
      expect(checkBridgeTier(planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });

    test('checkBridgeTier returns null when bridge has no estimated_percent', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const bridgePath = path.join(planningDir, '.context-budget.json');
      fs.writeFileSync(bridgePath, JSON.stringify({ timestamp: new Date().toISOString() }));
      expect(checkBridgeTier(planningDir)).toBeNull();
      cleanupTmp(tmpDir);
    });
  });

  describe('hook execution', () => {
    test('exits 0 silently below threshold', () => {
      const { tmpDir } = createTmpPlanning();
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'app.js') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      cleanupTmp(tmpDir);
    });

    test('exits 0 when not a Plan-Build-Run project', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-sc-noplan-'));
      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'app.js') });
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('outputs suggestion at threshold', () => {
      const { tmpDir, planningDir } = createTmpPlanning();
      const counterPath = path.join(planningDir, '.compact-counter');
      saveCounter(counterPath, { count: DEFAULT_THRESHOLD - 1, lastSuggested: 0 });

      const result = runScript(tmpDir, { file_path: path.join(tmpDir, 'app.js') });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.output);
      expect(parsed.additionalContext).toContain('[Context Budget]');
      expect(parsed.additionalContext).toContain('/compact');
      cleanupTmp(tmpDir);
    });

    test('handles malformed JSON input gracefully', () => {
      const { tmpDir } = createTmpPlanning();
      const result = _run('not json', { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      cleanupTmp(tmpDir);
    });
  });
});
