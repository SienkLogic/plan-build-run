const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'context-bridge.js');

// Import module exports for unit tests
const {
  getTier,
  getAdaptiveThresholds,
  getEffectiveThresholds,
  loadBridge,
  saveBridge,
  estimateFromHeuristic,
  shouldWarn,
  updateBridge,
  DEBOUNCE_INTERVAL,
  CRITICAL_DEBOUNCE_INTERVAL
} = require(SCRIPT);

describe('context-bridge.js', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-test-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir);
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- getTier ---
  describe('getTier', () => {
    test('returns PEAK for 0%', async () => {
      expect(getTier(0).name).toBe('PEAK');
    });

    test('returns PEAK for 15%', async () => {
      expect(getTier(15).name).toBe('PEAK');
    });

    test('returns GOOD for 30%', async () => {
      expect(getTier(30).name).toBe('GOOD');
    });

    test('returns GOOD for 49%', async () => {
      expect(getTier(49).name).toBe('GOOD');
    });

    test('returns DEGRADING for 50%', async () => {
      expect(getTier(50).name).toBe('DEGRADING');
    });

    test('returns DEGRADING for 69%', async () => {
      expect(getTier(69).name).toBe('DEGRADING');
    });

    test('returns POOR for 70%', async () => {
      expect(getTier(70).name).toBe('POOR');
    });

    test('returns POOR for 84%', async () => {
      expect(getTier(84).name).toBe('POOR');
    });

    test('returns CRITICAL for 85%', async () => {
      expect(getTier(85).name).toBe('CRITICAL');
    });

    test('returns CRITICAL for 100%', async () => {
      expect(getTier(100).name).toBe('CRITICAL');
    });

    test('returns CRITICAL for values above 100', async () => {
      expect(getTier(150).name).toBe('CRITICAL');
    });
  });

  // --- loadBridge / saveBridge ---
  describe('loadBridge / saveBridge', () => {
    test('returns null for non-existent file', async () => {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      expect(loadBridge(bridgePath)).toBeNull();
    });

    test('round-trips data through save and load', async () => {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      const data = {
        timestamp: '2026-01-01T00:00:00.000Z',
        estimated_percent: 42,
        source: 'heuristic',
        chars_read: 50000,
        warnings_issued: [],
        last_warned_tier: 'GOOD',
        calls_since_warn: 3,
        tool_calls: 10
      };
      saveBridge(bridgePath, data);
      const loaded = loadBridge(bridgePath);
      expect(loaded.estimated_percent).toBe(42);
      expect(loaded.source).toBe('heuristic');
      expect(loaded.tool_calls).toBe(10);
    });

    test('returns null for corrupt JSON', async () => {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      fs.writeFileSync(bridgePath, '{broken json', 'utf8');
      expect(loadBridge(bridgePath)).toBeNull();
    });
  });

  // --- estimateFromHeuristic ---
  describe('estimateFromHeuristic', () => {
    test('returns 0 when no tracker exists', async () => {
      expect(estimateFromHeuristic(planningDir)).toBe(0);
    });

    test('calculates percentage from chars read', async () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      // 80000 chars out of 800000 = 10%
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 80000 }));
      expect(estimateFromHeuristic(planningDir)).toBe(10);
    });

    test('caps at 100%', async () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 1000000 }));
      expect(estimateFromHeuristic(planningDir)).toBe(100);
    });

    test('handles corrupt tracker file', async () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, 'not json');
      expect(estimateFromHeuristic(planningDir)).toBe(0);
    });

    test('scales with context_window_tokens from config (1M → 20%)', async () => {
      // hooks/context-bridge.js uses plan-build-run/bin/lib/config.cjs
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      // Write 1M config: denominator becomes 4000000
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({ context_window_tokens: 1000000 }));
      configClearCache();
      const trackerPath = path.join(planningDir, '.context-tracker');
      // 800k chars out of 4000k = 20%
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 800000 }));
      expect(estimateFromHeuristic(planningDir)).toBe(20);
      configClearCache();
    });
  });

  // --- shouldWarn ---
  describe('shouldWarn', () => {
    test('never warns for PEAK tier', async () => {
      const bridge = { last_warned_tier: 'PEAK', calls_since_warn: 100 };
      expect(shouldWarn(bridge, 'PEAK')).toBe(false);
    });

    test('never warns for GOOD tier', async () => {
      const bridge = { last_warned_tier: 'PEAK', calls_since_warn: 100 };
      expect(shouldWarn(bridge, 'GOOD')).toBe(false);
    });

    test('warns on tier escalation from PEAK to DEGRADING', async () => {
      const bridge = { last_warned_tier: 'PEAK', calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(true);
    });

    test('warns on tier escalation from GOOD to POOR', async () => {
      const bridge = { last_warned_tier: 'GOOD', calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'POOR')).toBe(true);
    });

    test('warns on tier escalation from DEGRADING to POOR', async () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: 1 };
      expect(shouldWarn(bridge, 'POOR')).toBe(true);
    });

    test('suppresses same-tier warning below debounce interval', async () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: 2 };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(false);
    });

    test('warns same-tier after debounce interval', async () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: DEBOUNCE_INTERVAL };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(true);
    });

    test('warns same-tier POOR after debounce interval', async () => {
      const bridge = { last_warned_tier: 'POOR', calls_since_warn: DEBOUNCE_INTERVAL };
      expect(shouldWarn(bridge, 'POOR')).toBe(true);
    });

    test('warns on tier escalation from POOR to CRITICAL', async () => {
      const bridge = { last_warned_tier: 'POOR', calls_since_warn: 1 };
      expect(shouldWarn(bridge, 'CRITICAL')).toBe(true);
    });

    test('warns on tier escalation from DEGRADING to CRITICAL', async () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'CRITICAL')).toBe(true);
    });

    test('CRITICAL uses shorter debounce interval', async () => {
      // Below CRITICAL debounce — should not warn
      const bridge1 = { last_warned_tier: 'CRITICAL', calls_since_warn: 1 };
      expect(shouldWarn(bridge1, 'CRITICAL')).toBe(false);

      // At CRITICAL debounce interval — should warn
      const bridge2 = { last_warned_tier: 'CRITICAL', calls_since_warn: CRITICAL_DEBOUNCE_INTERVAL };
      expect(shouldWarn(bridge2, 'CRITICAL')).toBe(true);
    });

    test('CRITICAL debounce is shorter than standard debounce', async () => {
      expect(CRITICAL_DEBOUNCE_INTERVAL).toBeLessThan(DEBOUNCE_INTERVAL);
    });

    test('handles missing last_warned_tier gracefully', async () => {
      const bridge = { calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(true);
    });

    test('handles missing calls_since_warn gracefully', async () => {
      const bridge = { last_warned_tier: 'DEGRADING' };
      // calls_since_warn defaults to 0, below debounce, same tier => no warn
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(false);
    });
  });

  // --- updateBridge ---
  describe('updateBridge', () => {
    test('creates bridge file on first call', async () => {
      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.tool_calls).toBe(1);
      expect(bridge.source).toBe('heuristic');
      expect(bridge.estimated_percent).toBe(0);

      const bridgePath = path.join(planningDir, '.context-budget.json');
      expect(fs.existsSync(bridgePath)).toBe(true);
    });

    test('increments tool_calls on subsequent calls', async () => {
      updateBridge(planningDir, {});
      updateBridge(planningDir, {});
      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.tool_calls).toBe(3);
    });

    test('uses real context percent when provided (context_percent)', async () => {
      const { bridge } = updateBridge(planningDir, { context_percent: 55 });
      expect(bridge.estimated_percent).toBe(55);
      expect(bridge.source).toBe('bridge');
    });

    test('uses real context percent when provided (usage_percent)', async () => {
      const { bridge } = updateBridge(planningDir, { usage_percent: 72 });
      expect(bridge.estimated_percent).toBe(72);
      expect(bridge.source).toBe('bridge');
    });

    test('uses real context percent when provided (context.percent)', async () => {
      const { bridge } = updateBridge(planningDir, { context: { percent: 33 } });
      expect(bridge.estimated_percent).toBe(33);
      expect(bridge.source).toBe('bridge');
    });

    test('falls back to heuristic when no context data in stdin', async () => {
      // Seed tracker with some chars
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 160000 }));

      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.source).toBe('heuristic');
      expect(bridge.estimated_percent).toBe(20); // 160000/800000 = 20%
    });

    test('emits no warning for PEAK tier', async () => {
      const { output } = updateBridge(planningDir, { context_percent: 10 });
      expect(output).toBeNull();
    });

    test('emits no warning for GOOD tier', async () => {
      const { output } = updateBridge(planningDir, { context_percent: 40 });
      expect(output).toBeNull();
    });

    test('emits DEGRADING warning on first escalation', async () => {
      const { output } = updateBridge(planningDir, { context_percent: 55 });
      expect(output).not.toBeNull();
      expect(output.additionalContext).toContain('DEGRADING');
      expect(output.additionalContext).toContain('55%');
      expect(output.additionalContext).toContain('subagents');
    });

    test('emits POOR warning on first escalation', async () => {
      const { output } = updateBridge(planningDir, { context_percent: 75 });
      expect(output).not.toBeNull();
      expect(output.additionalContext).toContain('POOR');
      expect(output.additionalContext).toContain('75%');
      expect(output.additionalContext).toContain('/pbr:pause-work');
    });

    test('emits CRITICAL warning on first escalation', async () => {
      const { output } = updateBridge(planningDir, { context_percent: 90 });
      expect(output).not.toBeNull();
      expect(output.additionalContext).toContain('CRITICAL');
      expect(output.additionalContext).toContain('90%');
      expect(output.additionalContext).toContain('STOP');
    });

    test('debounces same-tier warnings', async () => {
      // First call — escalation to DEGRADING, should warn
      const r1 = updateBridge(planningDir, { context_percent: 55 });
      expect(r1.output).not.toBeNull();

      // Calls 2-5 — same tier, should be suppressed
      for (let i = 0; i < 4; i++) {
        const r = updateBridge(planningDir, { context_percent: 56 + i });
        expect(r.output).toBeNull();
      }

      // Call 6 — same tier but debounce interval reached (5 calls since last warn)
      const r6 = updateBridge(planningDir, { context_percent: 60 });
      expect(r6.output).not.toBeNull();
      expect(r6.output.additionalContext).toContain('DEGRADING');
    });

    test('bypasses debounce on tier escalation', async () => {
      // Escalate to DEGRADING
      const r1 = updateBridge(planningDir, { context_percent: 55 });
      expect(r1.output).not.toBeNull();

      // Immediately escalate to POOR — should bypass debounce
      const r2 = updateBridge(planningDir, { context_percent: 75 });
      expect(r2.output).not.toBeNull();
      expect(r2.output.additionalContext).toContain('POOR');
    });

    test('bypasses debounce on escalation from POOR to CRITICAL', async () => {
      // Escalate to POOR
      const r1 = updateBridge(planningDir, { context_percent: 75 });
      expect(r1.output).not.toBeNull();

      // Immediately escalate to CRITICAL — should bypass debounce
      const r2 = updateBridge(planningDir, { context_percent: 90 });
      expect(r2.output).not.toBeNull();
      expect(r2.output.additionalContext).toContain('CRITICAL');
    });

    test('records warnings in bridge state', async () => {
      updateBridge(planningDir, { context_percent: 55 });
      const { bridge } = updateBridge(planningDir, { context_percent: 75 });
      expect(bridge.warnings_issued.length).toBe(2);
      expect(bridge.warnings_issued[0].tier).toBe('DEGRADING');
      expect(bridge.warnings_issued[1].tier).toBe('POOR');
    });

    test('limits warnings_issued to 20 entries', async () => {
      // Seed with 19 warnings
      const bridgePath = path.join(planningDir, '.context-budget.json');
      const seed = {
        timestamp: new Date().toISOString(),
        estimated_percent: 50,
        source: 'heuristic',
        chars_read: 0,
        warnings_issued: Array.from({ length: 19 }, (_, i) => ({
          tier: 'DEGRADING',
          percent: 50 + i,
          timestamp: new Date().toISOString()
        })),
        last_warned_tier: 'GOOD', // set to GOOD so escalation to DEGRADING fires
        calls_since_warn: 0,
        tool_calls: 19
      };
      saveBridge(bridgePath, seed);

      // Two more warnings should push total above 20
      updateBridge(planningDir, { context_percent: 55 });

      // Force another escalation
      const bridgeData = loadBridge(bridgePath);
      bridgeData.last_warned_tier = 'GOOD';
      bridgeData.calls_since_warn = 0;
      saveBridge(bridgePath, bridgeData);

      updateBridge(planningDir, { context_percent: 65 });

      const final = loadBridge(bridgePath);
      expect(final.warnings_issued.length).toBeLessThanOrEqual(20);
    });

    test('reads chars_read from context-tracker file', async () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 42000, reads: 5, files: [] }));

      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.chars_read).toBe(42000);
    });

    test('skips file write when tier unchanged at PEAK (early-exit)', async () => {
      // Seed bridge at PEAK with 5% usage
      const bridgePath = path.join(planningDir, '.context-budget.json');
      saveBridge(bridgePath, {
        timestamp: new Date().toISOString(),
        estimated_percent: 5,
        source: 'heuristic',
        last_warned_tier: 'PEAK',
        calls_since_warn: 0,
        tool_calls: 10
      });

      // First call — should take early-exit path (PEAK unchanged)
      const r1 = updateBridge(planningDir, {});
      expect(r1.output).toBeNull();
      expect(r1.bridge.tool_calls).toBe(11);

      // Second call — also early-exit
      const r2 = updateBridge(planningDir, {});
      expect(r2.output).toBeNull();
      expect(r2.bridge.tool_calls).toBe(12);
    });

    test('writes file when tier escalates from PEAK to DEGRADING', async () => {
      // Seed bridge at PEAK
      const bridgePath = path.join(planningDir, '.context-budget.json');
      saveBridge(bridgePath, {
        timestamp: new Date().toISOString(),
        estimated_percent: 5,
        source: 'heuristic',
        last_warned_tier: 'PEAK',
        calls_since_warn: 0,
        tool_calls: 10
      });

      // Push into DEGRADING tier with high char count
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 440000 }));

      const { bridge, output } = updateBridge(planningDir, {});
      expect(output).not.toBeNull();
      expect(output.additionalContext).toContain('DEGRADING');
      expect(bridge.last_warned_tier).toBe('DEGRADING');
    });
  });

  // --- adaptive thresholds ---
  describe('adaptive thresholds', () => {
    test('getAdaptiveThresholds(200000) returns base thresholds', async () => {
      const t = getAdaptiveThresholds(200000);
      expect(t).toEqual({ degrading: 50, poor: 70, critical: 85 });
    });

    test('getAdaptiveThresholds(1000000) returns target thresholds', async () => {
      const t = getAdaptiveThresholds(1000000);
      expect(t).toEqual({ degrading: 60, poor: 75, critical: 85 });
    });

    test('getAdaptiveThresholds(500000) returns intermediate values', async () => {
      const t = getAdaptiveThresholds(500000);
      expect(t.degrading).toBeGreaterThan(50);
      expect(t.degrading).toBeLessThan(60);
      expect(t.poor).toBeGreaterThan(70);
      expect(t.poor).toBeLessThan(75);
      expect(t.critical).toBe(85);
    });

    test('getAdaptiveThresholds(100000) returns base thresholds (below 200k clamps)', async () => {
      const t = getAdaptiveThresholds(100000);
      expect(t).toEqual({ degrading: 50, poor: 70, critical: 85 });
    });

    test('getTier(55, adaptive 1M thresholds) returns GOOD (not DEGRADING)', () => {
      const thresholds = { degrading: 60, poor: 75, critical: 85 };
      expect(getTier(55, thresholds).name).toBe('GOOD');
    });

    test('getTier(55) without thresholds returns DEGRADING (backward compat)', async () => {
      expect(getTier(55).name).toBe('DEGRADING');
    });

    test('getEffectiveThresholds returns linear thresholds when threshold_curve is linear', async () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        context_window_tokens: 1000000,
        context_budget: { threshold_curve: 'linear' }
      }));
      configClearCache();
      const t = getEffectiveThresholds(planningDir);
      expect(t).toEqual({ degrading: 50, poor: 70, critical: 85 });
      configClearCache();
    });

    test('getEffectiveThresholds returns adaptive thresholds when threshold_curve is adaptive', async () => {
      const { configClearCache } = require('../plugins/pbr/scripts/lib/config');
      fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
        context_window_tokens: 1000000,
        context_budget: { threshold_curve: 'adaptive' }
      }));
      configClearCache();
      const t = getEffectiveThresholds(planningDir);
      expect(t).toEqual({ degrading: 60, poor: 75, critical: 85 });
      configClearCache();
    });
  });

  // --- CLI execution ---
  describe('CLI execution', () => {
    function run(stdinData = {}) {
      const input = JSON.stringify(stdinData);
      return execSync(`node "${SCRIPT}"`, {
        cwd: tmpDir,
        input,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    test('exits silently when no .planning directory', async () => {
      fs.rmSync(planningDir, { recursive: true, force: true });
      const output = run({});
      expect(output).toBe('');
    });

    test('creates bridge file when run as CLI', async () => {
      run({});
      const bridgePath = path.join(planningDir, '.context-budget.json');
      expect(fs.existsSync(bridgePath)).toBe(true);
    });

    test('outputs warning for DEGRADING tier via CLI', async () => {
      const output = run({ context_percent: 55 });
      const parsed = JSON.parse(output);
      expect(parsed.additionalContext).toContain('DEGRADING');
    });

    test('outputs warning for POOR tier via CLI', async () => {
      const output = run({ context_percent: 75 });
      const parsed = JSON.parse(output);
      expect(parsed.additionalContext).toContain('POOR');
    });

    test('outputs warning for CRITICAL tier via CLI', async () => {
      const output = run({ context_percent: 90 });
      const parsed = JSON.parse(output);
      expect(parsed.additionalContext).toContain('CRITICAL');
      expect(parsed.additionalContext).toContain('STOP');
    });

    test('no output for PEAK tier via CLI', async () => {
      const output = run({ context_percent: 10 });
      expect(output).toBe('');
    });

    test('no output for GOOD tier via CLI', async () => {
      const output = run({ context_percent: 40 });
      expect(output).toBe('');
    });

    test('handles empty stdin gracefully', async () => {
      const output = execSync(`node "${SCRIPT}"`, {
        cwd: tmpDir,
        input: '',
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Should not crash — empty input parsed as {}
      expect(typeof output).toBe('string');
    });
  });
});
