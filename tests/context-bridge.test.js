const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'context-bridge.js');

// Import module exports for unit tests
const {
  getTier,
  loadBridge,
  saveBridge,
  estimateFromHeuristic,
  shouldWarn,
  updateBridge,
  DEBOUNCE_INTERVAL
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
    test('returns PEAK for 0%', () => {
      expect(getTier(0).name).toBe('PEAK');
    });

    test('returns PEAK for 15%', () => {
      expect(getTier(15).name).toBe('PEAK');
    });

    test('returns GOOD for 30%', () => {
      expect(getTier(30).name).toBe('GOOD');
    });

    test('returns GOOD for 49%', () => {
      expect(getTier(49).name).toBe('GOOD');
    });

    test('returns DEGRADING for 50%', () => {
      expect(getTier(50).name).toBe('DEGRADING');
    });

    test('returns DEGRADING for 69%', () => {
      expect(getTier(69).name).toBe('DEGRADING');
    });

    test('returns POOR for 70%', () => {
      expect(getTier(70).name).toBe('POOR');
    });

    test('returns POOR for 100%', () => {
      expect(getTier(100).name).toBe('POOR');
    });

    test('returns POOR for values above 100', () => {
      expect(getTier(150).name).toBe('POOR');
    });
  });

  // --- loadBridge / saveBridge ---
  describe('loadBridge / saveBridge', () => {
    test('returns null for non-existent file', () => {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      expect(loadBridge(bridgePath)).toBeNull();
    });

    test('round-trips data through save and load', () => {
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

    test('returns null for corrupt JSON', () => {
      const bridgePath = path.join(planningDir, '.context-budget.json');
      fs.writeFileSync(bridgePath, '{broken json', 'utf8');
      expect(loadBridge(bridgePath)).toBeNull();
    });
  });

  // --- estimateFromHeuristic ---
  describe('estimateFromHeuristic', () => {
    test('returns 0 when no tracker exists', () => {
      expect(estimateFromHeuristic(planningDir)).toBe(0);
    });

    test('calculates percentage from chars read', () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      // 80000 chars out of 800000 = 10%
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 80000 }));
      expect(estimateFromHeuristic(planningDir)).toBe(10);
    });

    test('caps at 100%', () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 1000000 }));
      expect(estimateFromHeuristic(planningDir)).toBe(100);
    });

    test('handles corrupt tracker file', () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, 'not json');
      expect(estimateFromHeuristic(planningDir)).toBe(0);
    });
  });

  // --- shouldWarn ---
  describe('shouldWarn', () => {
    test('never warns for PEAK tier', () => {
      const bridge = { last_warned_tier: 'PEAK', calls_since_warn: 100 };
      expect(shouldWarn(bridge, 'PEAK')).toBe(false);
    });

    test('never warns for GOOD tier', () => {
      const bridge = { last_warned_tier: 'PEAK', calls_since_warn: 100 };
      expect(shouldWarn(bridge, 'GOOD')).toBe(false);
    });

    test('warns on tier escalation from PEAK to DEGRADING', () => {
      const bridge = { last_warned_tier: 'PEAK', calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(true);
    });

    test('warns on tier escalation from GOOD to POOR', () => {
      const bridge = { last_warned_tier: 'GOOD', calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'POOR')).toBe(true);
    });

    test('warns on tier escalation from DEGRADING to POOR', () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: 1 };
      expect(shouldWarn(bridge, 'POOR')).toBe(true);
    });

    test('suppresses same-tier warning below debounce interval', () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: 2 };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(false);
    });

    test('warns same-tier after debounce interval', () => {
      const bridge = { last_warned_tier: 'DEGRADING', calls_since_warn: DEBOUNCE_INTERVAL };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(true);
    });

    test('warns same-tier POOR after debounce interval', () => {
      const bridge = { last_warned_tier: 'POOR', calls_since_warn: DEBOUNCE_INTERVAL };
      expect(shouldWarn(bridge, 'POOR')).toBe(true);
    });

    test('handles missing last_warned_tier gracefully', () => {
      const bridge = { calls_since_warn: 0 };
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(true);
    });

    test('handles missing calls_since_warn gracefully', () => {
      const bridge = { last_warned_tier: 'DEGRADING' };
      // calls_since_warn defaults to 0, below debounce, same tier => no warn
      expect(shouldWarn(bridge, 'DEGRADING')).toBe(false);
    });
  });

  // --- updateBridge ---
  describe('updateBridge', () => {
    test('creates bridge file on first call', () => {
      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.tool_calls).toBe(1);
      expect(bridge.source).toBe('heuristic');
      expect(bridge.estimated_percent).toBe(0);

      const bridgePath = path.join(planningDir, '.context-budget.json');
      expect(fs.existsSync(bridgePath)).toBe(true);
    });

    test('increments tool_calls on subsequent calls', () => {
      updateBridge(planningDir, {});
      updateBridge(planningDir, {});
      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.tool_calls).toBe(3);
    });

    test('uses real context percent when provided (context_percent)', () => {
      const { bridge } = updateBridge(planningDir, { context_percent: 55 });
      expect(bridge.estimated_percent).toBe(55);
      expect(bridge.source).toBe('bridge');
    });

    test('uses real context percent when provided (usage_percent)', () => {
      const { bridge } = updateBridge(planningDir, { usage_percent: 72 });
      expect(bridge.estimated_percent).toBe(72);
      expect(bridge.source).toBe('bridge');
    });

    test('uses real context percent when provided (context.percent)', () => {
      const { bridge } = updateBridge(planningDir, { context: { percent: 33 } });
      expect(bridge.estimated_percent).toBe(33);
      expect(bridge.source).toBe('bridge');
    });

    test('falls back to heuristic when no context data in stdin', () => {
      // Seed tracker with some chars
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 160000 }));

      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.source).toBe('heuristic');
      expect(bridge.estimated_percent).toBe(20); // 160000/800000 = 20%
    });

    test('emits no warning for PEAK tier', () => {
      const { output } = updateBridge(planningDir, { context_percent: 10 });
      expect(output).toBeNull();
    });

    test('emits no warning for GOOD tier', () => {
      const { output } = updateBridge(planningDir, { context_percent: 40 });
      expect(output).toBeNull();
    });

    test('emits DEGRADING warning on first escalation', () => {
      const { output } = updateBridge(planningDir, { context_percent: 55 });
      expect(output).not.toBeNull();
      expect(output.additionalContext).toContain('DEGRADING');
      expect(output.additionalContext).toContain('55%');
      expect(output.additionalContext).toContain('subagents');
    });

    test('emits POOR warning on first escalation', () => {
      const { output } = updateBridge(planningDir, { context_percent: 80 });
      expect(output).not.toBeNull();
      expect(output.additionalContext).toContain('POOR');
      expect(output.additionalContext).toContain('80%');
      expect(output.additionalContext).toContain('/pbr:pause');
    });

    test('debounces same-tier warnings', () => {
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

    test('bypasses debounce on tier escalation', () => {
      // Escalate to DEGRADING
      const r1 = updateBridge(planningDir, { context_percent: 55 });
      expect(r1.output).not.toBeNull();

      // Immediately escalate to POOR — should bypass debounce
      const r2 = updateBridge(planningDir, { context_percent: 75 });
      expect(r2.output).not.toBeNull();
      expect(r2.output.additionalContext).toContain('POOR');
    });

    test('records warnings in bridge state', () => {
      updateBridge(planningDir, { context_percent: 55 });
      const { bridge } = updateBridge(planningDir, { context_percent: 75 });
      expect(bridge.warnings_issued.length).toBe(2);
      expect(bridge.warnings_issued[0].tier).toBe('DEGRADING');
      expect(bridge.warnings_issued[1].tier).toBe('POOR');
    });

    test('limits warnings_issued to 20 entries', () => {
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

    test('reads chars_read from context-tracker file', () => {
      const trackerPath = path.join(planningDir, '.context-tracker');
      fs.writeFileSync(trackerPath, JSON.stringify({ total_chars: 42000, reads: 5, files: [] }));

      const { bridge } = updateBridge(planningDir, {});
      expect(bridge.chars_read).toBe(42000);
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

    test('exits silently when no .planning directory', () => {
      fs.rmSync(planningDir, { recursive: true, force: true });
      const output = run({});
      expect(output).toBe('');
    });

    test('creates bridge file when run as CLI', () => {
      run({});
      const bridgePath = path.join(planningDir, '.context-budget.json');
      expect(fs.existsSync(bridgePath)).toBe(true);
    });

    test('outputs warning for DEGRADING tier via CLI', () => {
      const output = run({ context_percent: 55 });
      const parsed = JSON.parse(output);
      expect(parsed.additionalContext).toContain('DEGRADING');
    });

    test('outputs warning for POOR tier via CLI', () => {
      const output = run({ context_percent: 80 });
      const parsed = JSON.parse(output);
      expect(parsed.additionalContext).toContain('POOR');
    });

    test('no output for PEAK tier via CLI', () => {
      const output = run({ context_percent: 10 });
      expect(output).toBe('');
    });

    test('no output for GOOD tier via CLI', () => {
      const output = run({ context_percent: 40 });
      expect(output).toBe('');
    });

    test('handles empty stdin gracefully', () => {
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
