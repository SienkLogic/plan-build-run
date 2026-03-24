/**
 * Tests for checkAssumptionStaleness() in lib/verify.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkAssumptionStaleness } = require('../plugins/pbr/scripts/lib/verify');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-assumptions-'));
}

function writeAssumptions(dir, content) {
  const refsDir = path.join(dir, 'references');
  fs.mkdirSync(refsDir, { recursive: true });
  fs.writeFileSync(path.join(refsDir, 'assumptions.md'), content, 'utf-8');
}

function formatDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

describe('checkAssumptionStaleness', () => {
  test('returns empty result for missing file', () => {
    const tmpDir = makeTempDir();
    try {
      const result = checkAssumptionStaleness(tmpDir);
      expect(result).toEqual({ stale: [], neverValidated: [], total: 0, fresh: 0 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detects fresh, stale, and never-validated entries', () => {
    const tmpDir = makeTempDir();
    const freshDate = formatDate(10);   // 10 days ago = fresh
    const staleDate = formatDate(120);  // 120 days ago = stale
    try {
      writeAssumptions(tmpDir, [
        '---',
        'component: assumptions',
        'version: 1',
        'last_updated: 2026-03-24',
        '---',
        '',
        '| Component | Type | Assumption | Added | Model | Last Validated |',
        '|---|---|---|---|---|---|',
        `| fresh-hook.js | PreToolUse | LLM does something | 2026-01 | Sonnet 3.5 | ${freshDate} |`,
        `| stale-hook.js | PostToolUse | LLM does another thing | 2026-01 | Sonnet 3.5 | ${staleDate} |`,
        '| never-hook.js | gate | LLM skips step | 2026-02 | Opus 4 | - |',
      ].join('\n'));

      const result = checkAssumptionStaleness(tmpDir);
      expect(result.total).toBe(3);
      expect(result.fresh).toBe(1);
      expect(result.stale).toEqual(['stale-hook.js']);
      expect(result.neverValidated).toEqual(['never-hook.js']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('respects custom threshold', () => {
    const tmpDir = makeTempDir();
    const date50DaysAgo = formatDate(50);
    try {
      writeAssumptions(tmpDir, [
        '---',
        'component: assumptions',
        'version: 1',
        '---',
        '',
        '| Component | Type | Assumption | Added | Model | Last Validated |',
        '|---|---|---|---|---|---|',
        `| border-hook.js | PreToolUse | LLM test | 2026-01 | Sonnet 3.5 | ${date50DaysAgo} |`,
      ].join('\n'));

      // Default 90-day threshold: 50 days ago is fresh
      const resultDefault = checkAssumptionStaleness(tmpDir);
      expect(resultDefault.fresh).toBe(1);
      expect(resultDefault.stale).toEqual([]);

      // Custom 30-day threshold: 50 days ago is stale
      const resultStrict = checkAssumptionStaleness(tmpDir, 30);
      expect(resultStrict.stale).toEqual(['border-hook.js']);
      expect(resultStrict.fresh).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('finds file under plugins/pbr/references path', () => {
    const tmpDir = makeTempDir();
    const refsDir = path.join(tmpDir, 'plugins', 'pbr', 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    try {
      fs.writeFileSync(path.join(refsDir, 'assumptions.md'), [
        '---',
        'component: assumptions',
        'version: 1',
        '---',
        '',
        '| Component | Type | Assumption | Added | Model | Last Validated |',
        '|---|---|---|---|---|---|',
        '| test-hook.js | PreToolUse | LLM test | 2026-01 | Sonnet 3.5 | - |',
      ].join('\n'), 'utf-8');

      const result = checkAssumptionStaleness(tmpDir);
      expect(result.total).toBe(1);
      expect(result.neverValidated).toEqual(['test-hook.js']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
