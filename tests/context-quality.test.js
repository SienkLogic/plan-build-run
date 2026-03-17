'use strict';

/**
 * Context Quality Scoring — Tests for context-quality.js
 * Tests scoreContext(), getQualityReport(), writeQualityReport(), and toggle gating.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-ctx-quality-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { scoreContext, getQualityReport, writeQualityReport } = require('../plugins/pbr/scripts/context-quality');

describe('scoreContext', () => {
  test('returns 100 for empty entries (no noise)', () => {
    const score = scoreContext([], {});
    expect(score).toBe(100);
  });

  test('scores >= 80 when all entries are fresh and in current phase', () => {
    const now = new Date().toISOString();
    const entries = Array.from({ length: 5 }, (_, i) => ({
      file: `/src/file${i}.js`,
      timestamp: now,
      est_tokens: 100,
      phase: '01-foundation',
      stale: false
    }));
    const config = {
      context_ledger: { stale_after_minutes: 60 },
      features: { context_quality_scoring: true }
    };
    const score = scoreContext(entries, config, '01-foundation');
    expect(score).toBeGreaterThanOrEqual(80);
  });

  test('scores < 60 when 3 of 5 entries are stale and mixed phases', () => {
    const now = Date.now();
    const staleTime = new Date(now - 90 * 60 * 1000).toISOString(); // 90 min ago
    const freshTime = new Date(now).toISOString();
    const entries = [
      { file: '/a.js', timestamp: staleTime, est_tokens: 100, phase: '01-foundation' },
      { file: '/b.js', timestamp: staleTime, est_tokens: 100, phase: '02-other' },
      { file: '/c.js', timestamp: staleTime, est_tokens: 100, phase: '02-other' },
      { file: '/d.js', timestamp: freshTime, est_tokens: 100, phase: '01-foundation' },
      { file: '/e.js', timestamp: freshTime, est_tokens: 100, phase: '01-foundation' },
    ];
    const config = { context_ledger: { stale_after_minutes: 60 } };
    const score = scoreContext(entries, config, '01-foundation');
    expect(score).toBeLessThan(60);
  });

  test('scores < 50 when 8 of 10 entries are from prior phases and stale', () => {
    const now = Date.now();
    const staleTime = new Date(now - 120 * 60 * 1000).toISOString(); // 2 hours ago
    const freshTime = new Date(now).toISOString();
    const entries = [];
    for (let i = 0; i < 8; i++) {
      entries.push({ file: `/old${i}.js`, timestamp: staleTime, est_tokens: 100, phase: '00-setup' });
    }
    for (let i = 0; i < 2; i++) {
      entries.push({ file: `/cur${i}.js`, timestamp: freshTime, est_tokens: 100, phase: '01-foundation' });
    }
    const config = { context_ledger: { stale_after_minutes: 60 } };
    const score = scoreContext(entries, config, '01-foundation');
    expect(score).toBeLessThan(50);
  });
});

describe('getQualityReport', () => {
  test('returns report with score, breakdown, timestamp, and entry_count', () => {
    // Write config with feature enabled
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { context_quality_scoring: true },
      context_ledger: { enabled: true, stale_after_minutes: 60 }
    }));
    // Write STATE.md for phase detection
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\nphase_name: "01-foundation"\n---\nPhase: 1 of 1');
    // Write ledger with some entries
    const now = new Date().toISOString();
    const ledger = [
      { file: '/a.js', timestamp: now, est_tokens: 200, phase: '01-foundation' },
      { file: '/b.js', timestamp: now, est_tokens: 200, phase: '01-foundation' },
    ];
    fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), JSON.stringify(ledger));

    const report = getQualityReport(planningDir);
    expect(report).not.toBeNull();
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.breakdown).toBeDefined();
    expect(report.breakdown.freshness).toBeDefined();
    expect(report.breakdown.relevance).toBeDefined();
    expect(report.breakdown.diversity).toBeDefined();
    expect(report.timestamp).toBeDefined();
    expect(report.entry_count).toBe(2);
  });

  test('returns null when context_quality_scoring is false', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { context_quality_scoring: false }
    }));

    const report = getQualityReport(planningDir);
    expect(report).toBeNull();
  });
});

describe('writeQualityReport', () => {
  test('writes .context-quality.json', () => {
    const report = {
      score: 85,
      breakdown: { freshness: 90, relevance: 80, diversity: 85 },
      timestamp: new Date().toISOString(),
      entry_count: 5
    };

    writeQualityReport(planningDir, report);

    const filePath = path.join(planningDir, '.context-quality.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(written.score).toBe(85);
    expect(written.breakdown.freshness).toBe(90);
  });
});
