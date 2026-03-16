/**
 * Unit tests for lib/roadmap.js — ROADMAP.md parsing and table operations.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseRoadmapMd, findRoadmapRow, updateTableRow } = require('../lib/roadmap');

// --- Minimal valid ROADMAP.md content ---
const ROADMAP_CONTENT = [
  '# Roadmap',
  '',
  '## Phase Overview',
  '',
  '| Phase | Name | Goal | Plans | Wave | Status |',
  '|-------|------|------|-------|------|--------|',
  '| 01 | Foundation | Setup base | 2/2 | 1 | Complete |',
  '| 02 | Templates | Create templates | 1/3 | 1 | Building |',
  '| 03 | Research | Research pipeline | 0/0 | 2 | Pending |',
  '',
  '## Progress',
  '',
  '| 1. Foundation | 2/2 | Complete |',
  '| 2. Templates | 1/3 | Building |',
  '| 3. Research | 0/0 | Pending |',
].join('\n');

const ROADMAP_CRLF = ROADMAP_CONTENT.replace(/\n/g, '\r\n');

describe('parseRoadmapMd', () => {
  it('extracts phase list with status from ROADMAP.md content', () => {
    const result = parseRoadmapMd(ROADMAP_CONTENT);
    assert.strictEqual(result.phases.length, 3);
    assert.strictEqual(result.phases[0].number, '01');
    assert.strictEqual(result.phases[0].name, 'Foundation');
    assert.strictEqual(result.phases[0].goal, 'Setup base');
    assert.strictEqual(result.phases[0].status, 'Complete');
    assert.strictEqual(result.phases[1].status, 'Building');
    assert.strictEqual(result.phases[2].status, 'Pending');
  });

  it('detects progress table', () => {
    const result = parseRoadmapMd(ROADMAP_CONTENT);
    assert.strictEqual(result.has_progress_table, true);
  });

  it('returns empty phases for content without Phase Overview', () => {
    const result = parseRoadmapMd('# Roadmap\n\nNo phases here.');
    assert.strictEqual(result.phases.length, 0);
    assert.strictEqual(result.has_progress_table, false);
  });

  it('CRLF content produces same result as LF content', () => {
    const lfResult = parseRoadmapMd(ROADMAP_CONTENT);
    const crlfResult = parseRoadmapMd(ROADMAP_CRLF);
    assert.strictEqual(crlfResult.phases.length, lfResult.phases.length);
    for (let i = 0; i < lfResult.phases.length; i++) {
      assert.strictEqual(crlfResult.phases[i].number, lfResult.phases[i].number);
      assert.strictEqual(crlfResult.phases[i].name, lfResult.phases[i].name);
      assert.strictEqual(crlfResult.phases[i].status, lfResult.phases[i].status);
    }
    assert.strictEqual(crlfResult.has_progress_table, lfResult.has_progress_table);
  });
});

describe('findRoadmapRow', () => {
  it('finds the correct row index for a phase number', () => {
    const lines = ROADMAP_CONTENT.split('\n');
    const idx = findRoadmapRow(lines, '02');
    assert.ok(idx > 0);
    assert.ok(lines[idx].includes('Templates'));
  });

  it('returns -1 for non-existent phase', () => {
    const lines = ROADMAP_CONTENT.split('\n');
    const idx = findRoadmapRow(lines, '99');
    assert.strictEqual(idx, -1);
  });
});

describe('updateTableRow', () => {
  it('updates a specific column value', () => {
    const row = '| 01 | Foundation | Setup base | 2/2 | 1 | Complete |';
    const updated = updateTableRow(row, 5, 'Verified');
    assert.ok(updated.includes('Verified'));
    assert.ok(updated.includes('Foundation'));
  });

  it('preserves other columns', () => {
    const row = '| 01 | Foundation | Setup base | 2/2 | 1 | Complete |';
    const updated = updateTableRow(row, 3, '3/3');
    assert.ok(updated.includes('3/3'));
    assert.ok(updated.includes('Foundation'));
    assert.ok(updated.includes('Complete'));
  });
});
