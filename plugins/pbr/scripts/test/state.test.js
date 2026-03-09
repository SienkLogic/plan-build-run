/**
 * Unit tests for lib/state.js — STATE.md parsing and mutation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseStateMd, updateLegacyStateField, updateFrontmatterField, syncBodyLine, buildProgressBar } = require('../lib/state');

// --- Minimal valid STATE.md content (v2 frontmatter format) ---
const STATE_V2 = [
  '---',
  'version: 2',
  'current_phase: 3',
  'status: "building"',
  'progress_percent: 45',
  'last_activity: "2026-03-01"',
  'last_command: "/pbr:build 3"',
  'blockers: []',
  'plans_complete: 2',
  'plans_total: 5',
  'phase_slug: "pre-condition-gates"',
  '---',
  '# Project State',
  '',
  '## Current Position',
  'Phase: 3 of 8 (Pre Condition Gates)',
  'Status: Building',
  'Plan: 2 of 5 in current phase',
  'Progress: [█████████░░░░░░░░░░░] 45%',
  'Last activity: 2026-03-01',
].join('\n');

const STATE_V2_CRLF = STATE_V2.replace(/\n/g, '\r\n');

// --- Minimal valid STATE.md content (v1 legacy format) ---
const STATE_V1 = [
  '# Project State',
  '',
  '## Current Position',
  'Phase: 2 of 6 -- Foundation Setup',
  'Status: planned',
  'Plan: 1 of 3 in current phase',
  'Progress: [████░░░░░░░░░░░░░░░░] 20%',
  'Last Activity: 2026-02-15',
].join('\n');

describe('parseStateMd', () => {
  it('returns structured object from valid v2 STATE.md content', () => {
    const result = parseStateMd(STATE_V2);
    assert.strictEqual(result.format, 'frontmatter');
    assert.strictEqual(result.current_phase, 3);
    assert.strictEqual(result.status, 'building');
    assert.strictEqual(result.progress, 45);
    assert.strictEqual(result.plans_complete, 2);
    assert.strictEqual(result.plans_total, 5);
    assert.strictEqual(result.phase_name, 'pre-condition-gates');
  });

  it('handles CRLF line endings identically to LF', () => {
    const lfResult = parseStateMd(STATE_V2);
    const crlfResult = parseStateMd(STATE_V2_CRLF);
    assert.strictEqual(crlfResult.format, lfResult.format);
    assert.strictEqual(crlfResult.current_phase, lfResult.current_phase);
    assert.strictEqual(crlfResult.status, lfResult.status);
    assert.strictEqual(crlfResult.progress, lfResult.progress);
    assert.strictEqual(crlfResult.plans_complete, lfResult.plans_complete);
  });

  it('parses legacy v1 format correctly', () => {
    // Suppress the deprecation warning to stderr
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const result = parseStateMd(STATE_V1);
      assert.strictEqual(result.format, 'legacy');
      assert.strictEqual(result.current_phase, 2);
      assert.strictEqual(result.status, 'planned');
      assert.strictEqual(result.progress, 20);
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it('returns defaults for empty content', () => {
    const result = parseStateMd('');
    assert.strictEqual(result.current_phase, null);
    assert.strictEqual(result.status, null);
    assert.strictEqual(result.format, 'legacy');
  });
});

describe('updateFrontmatterField', () => {
  it('updates an existing field in YAML frontmatter', () => {
    const updated = updateFrontmatterField(STATE_V2, 'status', 'built');
    assert.ok(updated.includes('status: "built"'));
    assert.ok(!updated.includes('status: "building"'));
  });

  it('adds a new field if not present', () => {
    const minimal = '---\nversion: 2\n---\n# State';
    const updated = updateFrontmatterField(minimal, 'status', 'planned');
    assert.ok(updated.includes('status: "planned"'));
  });

  it('formats integers without quotes', () => {
    const updated = updateFrontmatterField(STATE_V2, 'current_phase', 5);
    assert.ok(updated.includes('current_phase: 5'));
  });
});

describe('syncBodyLine', () => {
  it('updates Status line in body', () => {
    const updated = syncBodyLine(STATE_V2, 'status', 'built');
    assert.ok(updated.includes('Status: Built'));
  });

  it('updates Plan count in body', () => {
    const updated = syncBodyLine(STATE_V2, 'plans_complete', 4);
    assert.ok(updated.includes('Plan: 4 of'));
  });

  it('updates Progress bar in body', () => {
    const updated = syncBodyLine(STATE_V2, 'progress_percent', 80);
    assert.ok(updated.includes('80%'));
  });

  it('returns content unchanged for unknown field', () => {
    const updated = syncBodyLine(STATE_V2, 'nonexistent_field', 'value');
    assert.strictEqual(updated, STATE_V2);
  });
});

describe('buildProgressBar', () => {
  it('generates correct bar for 0%', () => {
    const bar = buildProgressBar(0);
    assert.strictEqual(bar, '[░░░░░░░░░░░░░░░░░░░░] 0%');
  });

  it('generates correct bar for 100%', () => {
    const bar = buildProgressBar(100);
    assert.strictEqual(bar, '[████████████████████] 100%');
  });

  it('generates correct bar for 50%', () => {
    const bar = buildProgressBar(50);
    assert.ok(bar.includes('50%'));
    assert.ok(bar.includes('██████████'));
  });
});

describe('updateLegacyStateField', () => {
  it('updates status field in legacy format', () => {
    // Suppress deprecation warning
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const updated = updateLegacyStateField(STATE_V1, 'status', 'building');
      assert.ok(updated.includes('Status: building'));
    } finally {
      process.stderr.write = origWrite;
    }
  });
});
