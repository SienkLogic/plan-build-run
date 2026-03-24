'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { parseCostLine, loadCostEntries, aggregateCosts, phaseSummary } = require('../plugins/pbr/scripts/lib/benchmark');

// ─── parseCostLine ───────────────────────────────────────────────────────────

describe('parseCostLine', () => {
  test('parses valid JSON line with all fields', () => {
    const line = '{"ts":1000,"type":"executor","ms":5000,"phase":"3","skill":"build"}';
    const result = parseCostLine(line);
    expect(result).toEqual({
      ts: 1000,
      type: 'executor',
      ms: 5000,
      phase: '3',
      skill: 'build'
    });
  });

  test('parses valid JSON line with missing optional fields', () => {
    const line = '{"ts":1000,"type":"planner","ms":2000}';
    const result = parseCostLine(line);
    expect(result).toEqual({
      ts: 1000,
      type: 'planner',
      ms: 2000,
      phase: null,
      skill: null
    });
  });

  test('returns null for invalid JSON', () => {
    expect(parseCostLine('not json')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseCostLine('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseCostLine(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(parseCostLine(undefined)).toBeNull();
  });

  test('defaults type to unknown when missing', () => {
    const result = parseCostLine('{"ts":1,"ms":100}');
    expect(result.type).toBe('unknown');
  });

  test('defaults ms to 0 when missing', () => {
    const result = parseCostLine('{"ts":1,"type":"exec"}');
    expect(result.ms).toBe(0);
  });

  test('handles line with trailing whitespace', () => {
    const result = parseCostLine('{"ts":1,"type":"exec","ms":100}  \n');
    expect(result).not.toBeNull();
    expect(result.type).toBe('exec');
  });
});

// ─── aggregateCosts ──────────────────────────────────────────────────────────

describe('aggregateCosts', () => {
  const sampleEntries = [
    { ts: 1, type: 'executor', ms: 1000, phase: '3', skill: 'build' },
    { ts: 2, type: 'planner', ms: 2000, phase: '3', skill: 'plan' },
    { ts: 3, type: 'executor', ms: 3000, phase: '4', skill: 'build' },
    { ts: 4, type: 'verifier', ms: 500, phase: '4', skill: 'review' },
    { ts: 5, type: 'executor', ms: 1500, phase: '3', skill: 'build' }
  ];

  test('groups by phase', () => {
    const result = aggregateCosts(sampleEntries, 'phase');
    expect(result.groups['3'].count).toBe(3);
    expect(result.groups['3'].total_ms).toBe(4500);
    expect(result.groups['3'].avg_ms).toBe(1500);
    expect(result.groups['4'].count).toBe(2);
    expect(result.groups['4'].total_ms).toBe(3500);
    expect(result.totals.count).toBe(5);
    expect(result.totals.total_ms).toBe(8000);
  });

  test('groups by agent', () => {
    const result = aggregateCosts(sampleEntries, 'agent');
    expect(result.groups['executor'].count).toBe(3);
    expect(result.groups['planner'].count).toBe(1);
    expect(result.groups['verifier'].count).toBe(1);
  });

  test('groups by skill', () => {
    const result = aggregateCosts(sampleEntries, 'skill');
    expect(result.groups['build'].count).toBe(3);
    expect(result.groups['plan'].count).toBe(1);
    expect(result.groups['review'].count).toBe(1);
  });

  test('handles empty entries array', () => {
    const result = aggregateCosts([], 'phase');
    expect(result.groups).toEqual({});
    expect(result.totals).toEqual({ count: 0, total_ms: 0 });
  });

  test('entries with null phase grouped as unknown', () => {
    const entries = [{ ts: 1, type: 'exec', ms: 100, phase: null, skill: null }];
    const result = aggregateCosts(entries, 'phase');
    expect(result.groups['unknown'].count).toBe(1);
  });

  test('computes correct avg_ms', () => {
    const entries = [
      { ts: 1, type: 'exec', ms: 100, phase: '1', skill: null },
      { ts: 2, type: 'exec', ms: 300, phase: '1', skill: null }
    ];
    const result = aggregateCosts(entries, 'phase');
    expect(result.groups['1'].avg_ms).toBe(200);
  });
});

// ─── loadCostEntries ─────────────────────────────────────────────────────────

describe('loadCostEntries', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bench-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loads entries from root tracker file', () => {
    const line1 = JSON.stringify({ ts: 1, type: 'executor', ms: 1000, phase: '1', skill: 'build' });
    const line2 = JSON.stringify({ ts: 2, type: 'planner', ms: 2000, phase: '1', skill: 'plan' });
    fs.writeFileSync(path.join(tmpDir, '.agent-cost-tracker'), line1 + '\n' + line2 + '\n');

    const entries = loadCostEntries(tmpDir);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('executor');
    expect(entries[1].type).toBe('planner');
  });

  test('loads entries from session-scoped tracker files', () => {
    const sessDir = path.join(tmpDir, '.sessions', 'sess-abc');
    fs.mkdirSync(sessDir, { recursive: true });
    const line = JSON.stringify({ ts: 1, type: 'verifier', ms: 500, phase: '2', skill: 'review' });
    fs.writeFileSync(path.join(sessDir, '.agent-cost-tracker'), line + '\n');

    const entries = loadCostEntries(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('verifier');
  });

  test('combines root and session trackers', () => {
    // Root
    fs.writeFileSync(
      path.join(tmpDir, '.agent-cost-tracker'),
      JSON.stringify({ ts: 1, type: 'exec', ms: 100 }) + '\n'
    );
    // Session
    const sessDir = path.join(tmpDir, '.sessions', 'sess-1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessDir, '.agent-cost-tracker'),
      JSON.stringify({ ts: 2, type: 'plan', ms: 200 }) + '\n'
    );

    const entries = loadCostEntries(tmpDir);
    expect(entries).toHaveLength(2);
  });

  test('returns empty array for nonexistent planningDir', () => {
    const entries = loadCostEntries(path.join(tmpDir, 'nope'));
    expect(entries).toEqual([]);
  });

  test('returns empty array for null planningDir', () => {
    expect(loadCostEntries(null)).toEqual([]);
  });

  test('skips malformed lines in tracker files', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.agent-cost-tracker'),
      'bad line\n' + JSON.stringify({ ts: 1, type: 'exec', ms: 100 }) + '\n'
    );
    const entries = loadCostEntries(tmpDir);
    expect(entries).toHaveLength(1);
  });
});

// ─── phaseSummary ────────────────────────────────────────────────────────────

describe('phaseSummary', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bench-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('aggregates by phase and pairs quality from VERIFICATION.md', () => {
    // Create cost tracker
    const entries = [
      { ts: 1, type: 'executor', ms: 1000, phase: '42', skill: 'build' },
      { ts: 2, type: 'verifier', ms: 500, phase: '42', skill: 'review' }
    ];
    fs.writeFileSync(
      path.join(tmpDir, '.agent-cost-tracker'),
      entries.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    // Create phase dir with VERIFICATION.md
    const phaseDir = path.join(tmpDir, 'phases', '42-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), '---\nstatus: passed\n---\nVerification results');

    const result = phaseSummary(tmpDir);
    expect(result.phases['42'].count).toBe(2);
    expect(result.phases['42'].total_ms).toBe(1500);
    expect(result.phases['42'].quality).toBe('passed');
    expect(result.totals.count).toBe(2);
  });

  test('returns null quality when no VERIFICATION.md exists', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.agent-cost-tracker'),
      JSON.stringify({ ts: 1, type: 'exec', ms: 100, phase: '99', skill: 'build' }) + '\n'
    );

    const result = phaseSummary(tmpDir);
    expect(result.phases['99'].quality).toBeNull();
  });

  test('handles empty planning dir gracefully', () => {
    const result = phaseSummary(tmpDir);
    expect(result.phases).toEqual({});
    expect(result.totals).toEqual({ count: 0, total_ms: 0 });
  });
});
