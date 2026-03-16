/**
 * Unit tests for lib/phase.js — Phase operations (frontmatter, planIndex, phaseList).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { frontmatter, planIndex, phaseList } = require('../lib/phase');

// --- Minimal PLAN.md content ---
const PLAN_CONTENT = [
  '---',
  'phase: 01',
  'plan: 01',
  'type: execute',
  'wave: 1',
  'depends_on: []',
  'autonomous: true',
  '---',
  '',
  '<objective>',
  'Test objective here.',
  '</objective>',
  '',
  '<tasks>',
  '<task type="auto">',
  '  <name>Task 1: Do something</name>',
  '</task>',
  '</tasks>',
].join('\n');

const PLAN_CONTENT_CRLF = PLAN_CONTENT.replace(/\n/g, '\r\n');

// --- Minimal SUMMARY.md content ---
const SUMMARY_CONTENT = [
  '---',
  'phase: 01',
  'plan: 01',
  'status: complete',
  '---',
  '# Summary',
  '',
  'Tasks completed.',
].join('\n');

describe('frontmatter', () => {
  it('extracts frontmatter from a PLAN.md file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-test-'));
    const planPath = path.join(tmpDir, 'PLAN-01.md');
    fs.writeFileSync(planPath, PLAN_CONTENT, 'utf8');

    const result = frontmatter(planPath);
    assert.strictEqual(result.phase, 1);
    assert.strictEqual(result.plan, 1);
    assert.strictEqual(result.type, 'execute');
    assert.strictEqual(result.autonomous, true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns error for missing file', () => {
    const result = frontmatter('/nonexistent/file.md');
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  it('handles CRLF content in frontmatter parsing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-test-'));
    const planPath = path.join(tmpDir, 'PLAN-01.md');
    fs.writeFileSync(planPath, PLAN_CONTENT_CRLF, 'utf8');

    const result = frontmatter(planPath);
    assert.strictEqual(result.phase, 1);
    assert.strictEqual(result.plan, 1);
    assert.strictEqual(result.autonomous, true);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('planIndex', () => {
  it('returns plan inventory for a phase directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-test-'));
    const phasesDir = path.join(tmpDir, 'phases', '01-foundation');
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.writeFileSync(path.join(phasesDir, 'PLAN-01.md'), PLAN_CONTENT, 'utf8');

    const result = planIndex('1', tmpDir);
    assert.strictEqual(result.total_plans, 1);
    assert.strictEqual(result.plans[0].wave, 1);
    assert.strictEqual(result.plans[0].autonomous, true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns error when phases directory is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-test-'));
    const result = planIndex('1', tmpDir);
    assert.ok(result.error);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('phaseList', () => {
  it('lists phase directories with status', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-test-'));
    const phasesDir = path.join(tmpDir, 'phases');
    fs.mkdirSync(path.join(phasesDir, '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '02-templates'), { recursive: true });
    fs.writeFileSync(path.join(phasesDir, '01-foundation', 'PLAN-01.md'), PLAN_CONTENT, 'utf8');

    const result = phaseList(tmpDir);
    assert.strictEqual(result.phases.length, 2);
    assert.strictEqual(result.phases[0].num, 1);
    assert.strictEqual(result.phases[0].slug, 'foundation');
    assert.strictEqual(result.phases[0].hasPlan, true);
    assert.strictEqual(result.phases[1].hasPlan, false);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty when no phases directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-test-'));
    const result = phaseList(tmpDir);
    assert.deepStrictEqual(result.phases, []);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('phase path construction', () => {
  it('uses path.join for cross-platform safety', () => {
    // Verify that path.join produces valid paths on current platform
    const joined = path.join('phases', '01-foundation', 'PLAN-01.md');
    assert.ok(joined.includes('01-foundation'));
    assert.ok(joined.includes('PLAN-01.md'));
    // Should NOT contain double separators
    assert.ok(!joined.includes('//'));
    assert.ok(!joined.includes('\\\\'));
  });
});
