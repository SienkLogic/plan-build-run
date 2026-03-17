/**
 * Tests for trust-tracker.js — per-agent pass/fail trust scoring.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadScores,
  recordOutcome,
  getConfidence,
  resetScores,
  TRUST_DIR,
  TRUST_FILE
} = require('../plugins/pbr/scripts/trust-tracker');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trust-tracker-'));
}

describe('trust-tracker', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadScores', () => {
    test('returns empty object when agent-scores.json does not exist', () => {
      const scores = loadScores(tmpDir);
      expect(scores).toEqual({});
    });

    test('returns parsed data when file exists', () => {
      const trustPath = path.join(tmpDir, TRUST_DIR);
      fs.mkdirSync(trustPath, { recursive: true });
      const data = { executor: { build: { pass: 5, fail: 1, rate: 0.8333 } } };
      fs.writeFileSync(path.join(trustPath, TRUST_FILE), JSON.stringify(data));
      const scores = loadScores(tmpDir);
      expect(scores).toEqual(data);
    });
  });

  describe('recordOutcome', () => {
    test('creates trust dir and file if missing', () => {
      recordOutcome(tmpDir, 'executor', 'build', true);
      const filePath = path.join(tmpDir, TRUST_DIR, TRUST_FILE);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('increments pass count when passed=true', () => {
      recordOutcome(tmpDir, 'executor', 'build', true);
      recordOutcome(tmpDir, 'executor', 'build', true);
      const scores = loadScores(tmpDir);
      expect(scores.executor.build.pass).toBe(2);
    });

    test('increments fail count when passed=false', () => {
      recordOutcome(tmpDir, 'executor', 'build', false);
      recordOutcome(tmpDir, 'executor', 'build', false);
      const scores = loadScores(tmpDir);
      expect(scores.executor.build.fail).toBe(2);
    });

    test('recalculates rate as pass/(pass+fail)', () => {
      recordOutcome(tmpDir, 'executor', 'build', true);
      recordOutcome(tmpDir, 'executor', 'build', true);
      recordOutcome(tmpDir, 'executor', 'build', false);
      const scores = loadScores(tmpDir);
      const entry = scores.executor.build;
      expect(entry.rate).toBeCloseTo(2 / 3, 4);
    });
  });

  describe('getConfidence', () => {
    test('returns null when no data exists for agent+category', () => {
      const result = getConfidence(tmpDir, 'verifier', 'lint');
      expect(result).toBeNull();
    });

    test('returns high label when rate >= 0.9', () => {
      // 9 pass, 1 fail => 0.9
      for (let i = 0; i < 9; i++) recordOutcome(tmpDir, 'executor', 'build', true);
      recordOutcome(tmpDir, 'executor', 'build', false);
      const result = getConfidence(tmpDir, 'executor', 'build');
      expect(result.rate).toBeCloseTo(0.9, 4);
      expect(result.total).toBe(10);
      expect(result.label).toBe('high');
    });

    test('returns medium label when rate >= 0.7 and < 0.9', () => {
      // 7 pass, 3 fail => 0.7
      for (let i = 0; i < 7; i++) recordOutcome(tmpDir, 'executor', 'test', true);
      for (let i = 0; i < 3; i++) recordOutcome(tmpDir, 'executor', 'test', false);
      const result = getConfidence(tmpDir, 'executor', 'test');
      expect(result.rate).toBeCloseTo(0.7, 4);
      expect(result.total).toBe(10);
      expect(result.label).toBe('medium');
    });

    test('returns low label when rate < 0.7', () => {
      // 1 pass, 3 fail => 0.25
      recordOutcome(tmpDir, 'planner', 'design', true);
      for (let i = 0; i < 3; i++) recordOutcome(tmpDir, 'planner', 'design', false);
      const result = getConfidence(tmpDir, 'planner', 'design');
      expect(result.rate).toBeCloseTo(0.25, 4);
      expect(result.total).toBe(4);
      expect(result.label).toBe('low');
    });

    test('returns correct structure { rate, total, label }', () => {
      recordOutcome(tmpDir, 'executor', 'build', true);
      const result = getConfidence(tmpDir, 'executor', 'build');
      expect(result).toHaveProperty('rate');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('label');
    });
  });

  describe('resetScores', () => {
    test('removes agent-scores.json', () => {
      recordOutcome(tmpDir, 'executor', 'build', true);
      const filePath = path.join(tmpDir, TRUST_DIR, TRUST_FILE);
      expect(fs.existsSync(filePath)).toBe(true);
      resetScores(tmpDir);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('does not throw when file does not exist', () => {
      expect(() => resetScores(tmpDir)).not.toThrow();
    });
  });
});
