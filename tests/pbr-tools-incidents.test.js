/**
 * Tests for incidents CLI subcommands in pbr-tools.js.
 * Covers list, summary, query, and error handling.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { list, query, summary } = require('../plan-build-run/bin/lib/incidents.cjs');

let tmpDir;
let planningDir;

// Sample incident entries with varying type, severity, source
const sampleEntries = [
  {
    timestamp: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
    session_id: 'sess-001',
    source: 'hook',
    type: 'block',
    severity: 'error',
    issue: 'Pre-bash hook blocked dangerous command',
    context: { file: 'test.js' },
    auto_fixed: false,
    resolution: null,
    duration_ms: null
  },
  {
    timestamp: new Date(Date.now() - 7200 * 1000).toISOString(), // 2 hours ago
    session_id: 'sess-001',
    source: 'hook',
    type: 'warn',
    severity: 'warning',
    issue: 'STATE.md desync detected',
    context: { file: 'STATE.md' },
    auto_fixed: true,
    resolution: 'auto-synced',
    duration_ms: 50
  },
  {
    timestamp: new Date(Date.now() - 86400 * 1000 * 2).toISOString(), // 2 days ago
    session_id: 'sess-002',
    source: 'agent',
    type: 'block',
    severity: 'error',
    issue: 'Executor failed on task T3',
    context: { phase: '10' },
    auto_fixed: false,
    resolution: null,
    duration_ms: null
  },
  {
    timestamp: new Date(Date.now() - 86400 * 1000 * 5).toISOString(), // 5 days ago
    session_id: 'sess-003',
    source: 'hook',
    type: 'warn',
    severity: 'warning',
    issue: 'Context budget exceeded 80%',
    context: {},
    auto_fixed: false,
    resolution: null,
    duration_ms: null
  },
  {
    timestamp: new Date(Date.now() - 86400 * 1000 * 10).toISOString(), // 10 days ago
    session_id: 'sess-004',
    source: 'cli',
    type: 'warn',
    severity: 'info',
    issue: 'Stale research data detected',
    context: { dir: 'research/' },
    auto_fixed: false,
    resolution: null,
    duration_ms: null
  }
];

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-incidents-test-'));
  planningDir = path.join(tmpDir, '.planning');
  const incidentsDir = path.join(planningDir, 'incidents');
  fs.mkdirSync(incidentsDir, { recursive: true });

  // Group entries by date and write to JSONL files
  const byDate = {};
  for (const entry of sampleEntries) {
    const dateStr = entry.timestamp.slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(entry);
  }
  for (const [dateStr, entries] of Object.entries(byDate)) {
    const filePath = path.join(incidentsDir, `incidents-${dateStr}.jsonl`);
    const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(filePath, content);
  }
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('incidents CLI subcommands', () => {
  describe('incidents list', () => {
    test('returns array of all incidents', () => {
      const result = list({ planningDir, limit: Infinity });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(5);
    });

    test('respects --limit', () => {
      const result = list({ planningDir, limit: 2 });
      expect(result.length).toBe(2);
    });

    test('entries have timestamp field', () => {
      const result = list({ planningDir, limit: 1 });
      expect(result[0]).toHaveProperty('timestamp');
    });

    test('default order is newest first (across days)', () => {
      const result = list({ planningDir, limit: Infinity });
      // Check that the first entry is more recent than the last
      const firstTime = new Date(result[0].timestamp).getTime();
      const lastTime = new Date(result[result.length - 1].timestamp).getTime();
      expect(firstTime).toBeGreaterThan(lastTime);
    });
  });

  describe('incidents summary', () => {
    test('returns object with total, by_type, by_source, by_severity', () => {
      const result = summary({ planningDir });
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('by_type');
      expect(result).toHaveProperty('by_source');
      expect(result).toHaveProperty('by_severity');
    });

    test('total matches entry count', () => {
      const result = summary({ planningDir });
      expect(result.total).toBe(5);
    });

    test('by_type counts are correct', () => {
      const result = summary({ planningDir });
      expect(result.by_type.block).toBe(2);
      expect(result.by_type.warn).toBe(3);
    });

    test('by_source counts are correct', () => {
      const result = summary({ planningDir });
      expect(result.by_source.hook).toBe(3);
      expect(result.by_source.agent).toBe(1);
      expect(result.by_source.cli).toBe(1);
    });

    test('by_severity counts are correct', () => {
      const result = summary({ planningDir });
      expect(result.by_severity.error).toBe(2);
      expect(result.by_severity.warning).toBe(2);
      expect(result.by_severity.info).toBe(1);
    });

    test('includes oldest and newest timestamps', () => {
      const result = summary({ planningDir });
      expect(result.oldest).toBeTruthy();
      expect(result.newest).toBeTruthy();
      expect(new Date(result.oldest).getTime()).toBeLessThan(new Date(result.newest).getTime());
    });
  });

  describe('incidents query', () => {
    test('filters by --type block', () => {
      const result = query({ type: 'block' }, { planningDir });
      expect(result.length).toBe(2);
      expect(result.every(e => e.type === 'block')).toBe(true);
    });

    test('filters by --severity error', () => {
      const result = query({ severity: 'error' }, { planningDir });
      expect(result.length).toBe(2);
      expect(result.every(e => e.severity === 'error')).toBe(true);
    });

    test('filters by --source hook', () => {
      const result = query({ source: 'hook' }, { planningDir });
      expect(result.length).toBe(3);
      expect(result.every(e => e.source === 'hook')).toBe(true);
    });

    test('filters by --last 1d (time window)', () => {
      const result = query({ last: '1d' }, { planningDir });
      // Only entries from last 24 hours (the 2 recent ones)
      expect(result.length).toBe(2);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      expect(result.every(e => new Date(e.timestamp).getTime() >= cutoff)).toBe(true);
    });

    test('filters by --last 7d', () => {
      const result = query({ last: '7d' }, { planningDir });
      // Entries from last 7 days (first 4, not the 10-day-old one)
      expect(result.length).toBe(4);
    });

    test('combined filters work', () => {
      const result = query({ type: 'block', last: '1d' }, { planningDir });
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('block');
    });

    test('returns empty array when no matches', () => {
      const result = query({ type: 'nonexistent' }, { planningDir });
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    test('list returns empty array for missing incidents dir', () => {
      const emptyDir = path.join(tmpDir, 'empty', '.planning');
      fs.mkdirSync(emptyDir, { recursive: true });
      const result = list({ planningDir: emptyDir });
      expect(result).toEqual([]);
    });

    test('summary returns zero total for missing incidents dir', () => {
      const emptyDir = path.join(tmpDir, 'empty2', '.planning');
      fs.mkdirSync(emptyDir, { recursive: true });
      const result = summary({ planningDir: emptyDir });
      expect(result.total).toBe(0);
    });
  });

  describe('wrapper function planningDir passing', () => {
    test('wrapper passes planningDir correctly to list', () => {
      // Verify the wrapper pattern works by calling with planningDir in opts
      const result = list({ planningDir, limit: 1 });
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('issue');
    });

    test('wrapper passes planningDir correctly to query', () => {
      const result = query({ type: 'warn' }, { planningDir });
      expect(result.length).toBeGreaterThan(0);
    });

    test('wrapper passes planningDir correctly to summary', () => {
      const result = summary({ planningDir });
      expect(result.total).toBe(5);
    });
  });
});
