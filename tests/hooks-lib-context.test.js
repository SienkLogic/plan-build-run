/**
 * Tests for hooks/lib/context.js — Context triage for orchestrator decision-making.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ctx-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const {
  contextTriage,
  readBridgeData,
  readTrackerData,
  getHeuristicThresholds
} = require('../plugins/pbr/scripts/lib/context');

// --- getHeuristicThresholds ---

describe('getHeuristicThresholds', () => {
  it('returns default thresholds when no config exists', () => {
    const t = getHeuristicThresholds(planningDir);
    expect(t).toHaveProperty('proceed');
    expect(t).toHaveProperty('checkpoint');
    expect(t).toHaveProperty('compact');
    expect(t.proceed).toBeLessThan(t.checkpoint);
    expect(t.checkpoint).toBeLessThan(t.compact);
  });

  it('scales thresholds when config has larger context_window_tokens', () => {
    // Write a config with 1M tokens
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ context_window_tokens: 1000000 })
    );
    const t = getHeuristicThresholds(planningDir);
    // 1M tokens = 5x base (200k), so thresholds should be ~5x the base values
    expect(t.proceed).toBeGreaterThan(30000);
    expect(t.checkpoint).toBeGreaterThan(60000);
  });
});

// --- readBridgeData ---

describe('readBridgeData', () => {
  it('returns null when bridge file does not exist', () => {
    expect(readBridgeData(planningDir)).toBeNull();
  });

  it('reads and parses bridge data with stale flag', () => {
    const bridgePath = path.join(planningDir, '.context-budget.json');
    fs.writeFileSync(bridgePath, JSON.stringify({
      percentage: 42,
      tier: 'GOOD',
      chars_read: 12000
    }));
    const data = readBridgeData(planningDir);
    expect(data).not.toBeNull();
    expect(data.percentage).toBe(42);
    expect(data.tier).toBe('GOOD');
    // Just written, should not be stale
    expect(data.stale).toBe(false);
  });

  it('returns null for corrupt JSON bridge file', () => {
    fs.writeFileSync(path.join(planningDir, '.context-budget.json'), '{invalid');
    expect(readBridgeData(planningDir)).toBeNull();
  });
});

// --- readTrackerData ---

describe('readTrackerData', () => {
  it('returns null when tracker file does not exist', () => {
    expect(readTrackerData(planningDir)).toBeNull();
  });

  it('reads and parses tracker data', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-tracker'),
      JSON.stringify({ total_chars: 5000, unique_files: 10 })
    );
    const data = readTrackerData(planningDir);
    expect(data).not.toBeNull();
    expect(data.total_chars).toBe(5000);
    expect(data.unique_files).toBe(10);
  });

  it('returns null for corrupt JSON tracker file', () => {
    fs.writeFileSync(path.join(planningDir, '.context-tracker'), 'not json');
    expect(readTrackerData(planningDir)).toBeNull();
  });
});

// --- contextTriage ---

describe('contextTriage', () => {
  it('returns PROCEED with no data sources', () => {
    const result = contextTriage({}, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.data_source).toBe('heuristic');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('percentage');
  });

  it('returns PROCEED when bridge shows low percentage', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-budget.json'),
      JSON.stringify({ percentage: 20, tier: 'PEAK' })
    );
    const result = contextTriage({}, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.data_source).toBe('bridge');
  });

  it('returns CHECKPOINT for mid-range bridge percentage', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-budget.json'),
      JSON.stringify({ percentage: 55, tier: 'DEGRADING' })
    );
    const result = contextTriage({}, planningDir);
    expect(result.recommendation).toBe('CHECKPOINT');
  });

  it('returns COMPACT for high bridge percentage', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-budget.json'),
      JSON.stringify({ percentage: 85, tier: 'POOR' })
    );
    const result = contextTriage({}, planningDir);
    expect(result.recommendation).toBe('COMPACT');
  });

  it('uses heuristic when bridge data is missing', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-tracker'),
      JSON.stringify({ total_chars: 5000 })
    );
    const result = contextTriage({}, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.data_source).toBe('heuristic');
  });

  it('returns heuristic COMPACT for high char count', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-tracker'),
      JSON.stringify({ total_chars: 200000 })
    );
    const result = contextTriage({}, planningDir);
    expect(result.recommendation).toBe('COMPACT');
    expect(result.data_source).toBe('heuristic');
  });

  it('overrides to PROCEED on cleanup/finalize step', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-budget.json'),
      JSON.stringify({ percentage: 85, tier: 'POOR' })
    );
    const result = contextTriage({ currentStep: 'finalize summary' }, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.reason).toContain('finalize');
  });

  it('relaxes tier when near completion', () => {
    fs.writeFileSync(
      path.join(planningDir, '.context-budget.json'),
      JSON.stringify({ percentage: 55, tier: 'DEGRADING' })
    );
    const result = contextTriage({ agentsDone: 9, plansTotal: 10 }, planningDir);
    // CHECKPOINT relaxed to PROCEED
    expect(result.recommendation).toBe('PROCEED');
    expect(result.reason).toContain('Near completion');
  });

  it('includes agents_done and plans_total in result', () => {
    const result = contextTriage({ agentsDone: 3, plansTotal: 5 }, planningDir);
    expect(result.agents_done).toBe(3);
    expect(result.plans_total).toBe(5);
  });

  it('handles null options gracefully', () => {
    const result = contextTriage(null, planningDir);
    expect(result.recommendation).toBeDefined();
  });
});
