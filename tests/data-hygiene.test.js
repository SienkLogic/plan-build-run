/**
 * Tests for lib/data-hygiene.js — dataStatus and dataPrune functions.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { dataStatus, dataPrune } = require('../plugins/pbr/scripts/lib/data-hygiene');

let tmpDir;
let planningDir;

beforeAll(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'data-hygiene-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir);

  // --- research/ ---
  const researchDir = path.join(planningDir, 'research');
  fs.mkdirSync(researchDir);
  // SUMMARY.md (protected)
  fs.writeFileSync(path.join(researchDir, 'SUMMARY.md'), '# Summary\nResearch summary content');
  // Old file (backdate to 30 days ago)
  const oldFile = path.join(researchDir, 'old-research.md');
  fs.writeFileSync(oldFile, '# Old Research\nStale content');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, thirtyDaysAgo, thirtyDaysAgo);
  // New file
  fs.writeFileSync(path.join(researchDir, 'new-research.md'), '# New Research\nFresh content');

  // --- intel/ ---
  const intelDir = path.join(planningDir, 'intel');
  fs.mkdirSync(intelDir);
  fs.writeFileSync(
    path.join(intelDir, '.last-refresh.json'),
    JSON.stringify({ timestamp: '2026-03-17T05:09:39.189Z', version: 1 })
  );
  fs.writeFileSync(path.join(intelDir, 'apis.json'), '{"apis": []}');

  // --- codebase/ ---
  const codebaseDir = path.join(planningDir, 'codebase');
  fs.mkdirSync(codebaseDir);
  fs.writeFileSync(path.join(codebaseDir, 'graph.json'), '{"nodes": [], "edges": []}');
  fs.writeFileSync(path.join(codebaseDir, 'deps.md'), '# Dependencies\nSome deps');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('dataStatus', () => {
  test('returns object with research, intel, codebase, checked_at keys', () => {
    const result = dataStatus(planningDir);
    expect(result).toHaveProperty('research');
    expect(result).toHaveProperty('intel');
    expect(result).toHaveProperty('codebase');
    expect(result).toHaveProperty('checked_at');
  });

  test('each sub-object has files, size_kb, newest_mtime fields', () => {
    const result = dataStatus(planningDir);
    for (const key of ['research', 'intel', 'codebase']) {
      expect(result[key]).toHaveProperty('files');
      expect(result[key]).toHaveProperty('size_kb');
      expect(result[key]).toHaveProperty('newest_mtime');
      expect(typeof result[key].files).toBe('number');
      expect(typeof result[key].size_kb).toBe('number');
    }
  });

  test('research has correct file count (SUMMARY.md + old + new)', () => {
    const result = dataStatus(planningDir);
    expect(result.research.files).toBe(3);
  });

  test('intel entry reads .last-refresh.json timestamp', () => {
    const result = dataStatus(planningDir);
    expect(result.intel.last_refresh).toBe('2026-03-17T05:09:39.189Z');
  });

  test('codebase entry has graph_mtime', () => {
    const result = dataStatus(planningDir);
    expect(result.codebase.graph_mtime).toBeTruthy();
  });

  test('research has summary_mtime', () => {
    const result = dataStatus(planningDir);
    expect(result.research.summary_mtime).toBeTruthy();
  });

  test('handles missing directory gracefully', () => {
    const emptyDir = path.join(tmpDir, '.planning-empty');
    fs.mkdirSync(emptyDir);
    const result = dataStatus(emptyDir);
    expect(result.research.files).toBe(0);
    expect(result.research.stale).toBe(true);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('dataPrune', () => {
  test('dryRun returns archived list but files remain', () => {
    const result = dataPrune(planningDir, {
      before: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      dryRun: true
    });
    expect(result.dry_run).toBe(true);
    expect(result.archived.length).toBeGreaterThan(0);
    // The old file should still exist
    expect(fs.existsSync(path.join(planningDir, 'research', 'old-research.md'))).toBe(true);
  });

  test('SUMMARY.md and graph.json are never archived (in skipped list)', () => {
    const result = dataPrune(planningDir, {
      before: new Date().toISOString(), // everything is "before" now
      dryRun: true
    });
    const skippedNames = result.skipped.map(s => s.split(' ')[0]);
    expect(skippedNames).toContain('research/SUMMARY.md');
    expect(skippedNames).toContain('codebase/graph.json');
  });

  test('with before date: old files moved to archive/ subdirectory', () => {
    // Ensure old-research.md still exists before pruning
    expect(fs.existsSync(path.join(planningDir, 'research', 'old-research.md'))).toBe(true);

    const result = dataPrune(planningDir, {
      before: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      dryRun: false
    });
    expect(result.dry_run).toBe(false);
    expect(result.archived.some(a => a.from === 'research/old-research.md')).toBe(true);
    // File should now be in archive/
    expect(fs.existsSync(path.join(planningDir, 'research', 'archive', 'old-research.md'))).toBe(true);
    // Original should be gone
    expect(fs.existsSync(path.join(planningDir, 'research', 'old-research.md'))).toBe(false);
  });

  test('returns error for missing --before date', () => {
    const result = dataPrune(planningDir, {});
    expect(result.error).toMatch(/Invalid/);
  });
});
