'use strict';

/**
 * tests/preview.test.js — TDD tests for lib/preview.js buildPreview()
 *
 * Uses mkdtempSync to create isolated temp dirs with mock PLAN.md files.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Under test
const { buildPreview } = require('../plan-build-run/bin/lib/preview.cjs');

const PLUGIN_ROOT = path.join(__dirname, '..', 'plan-build-run');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal temp .planning/ dir with the given phase structure.
 *
 * phaseSlug   — the directory name under phases/ (e.g. "42-my-phase")
 * plans       — array of { filename, frontmatter, taskCount }
 *               frontmatter is a plain JS object; taskCount is how many
 *               <task id= tags to embed in the body.
 */
function makeTestPlanningDir(phaseSlug, plans) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-preview-test-'));
  const phasesDir = path.join(tmpDir, 'phases');
  const phaseDir = path.join(phasesDir, phaseSlug);
  fs.mkdirSync(phaseDir, { recursive: true });

  for (const plan of plans) {
    const fmLines = ['---'];
    for (const [k, v] of Object.entries(plan.frontmatter)) {
      if (Array.isArray(v)) {
        fmLines.push(`${k}:`);
        for (const item of v) {
          fmLines.push(`  - ${item}`);
        }
      } else {
        fmLines.push(`${k}: ${v}`);
      }
    }
    fmLines.push('---');
    fmLines.push('');
    // Embed fake task tags
    const taskCount = plan.taskCount || 0;
    for (let i = 1; i <= taskCount; i++) {
      fmLines.push(`<task id="${plan.frontmatter.plan || 'XX'}-T${i}" type="auto">`);
      fmLines.push(`<name>Task ${i}</name>`);
      fmLines.push('</task>');
      fmLines.push('');
    }
    fs.writeFileSync(path.join(phaseDir, plan.filename), fmLines.join('\n'), 'utf8');
  }

  return tmpDir;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('buildPreview()', () => {

  // ── T1-a: return shape ──────────────────────────────────────────────────────
  test('a: returns object with required top-level keys', () => {
    const tmpDir = makeTestPlanningDir('01-simple', [
      {
        filename: 'PLAN-01.md',
        frontmatter: { phase: '"01-simple"', plan: '"01-01"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 2
      }
    ]);
    const result = buildPreview('simple', {}, tmpDir, PLUGIN_ROOT);
    expect(result).toHaveProperty('phase');
    expect(result).toHaveProperty('plans');
    expect(result).toHaveProperty('waves');
    expect(result).toHaveProperty('files_affected');
    expect(result).toHaveProperty('agent_count');
    expect(result).toHaveProperty('critical_path');
    expect(result).toHaveProperty('dependency_chain');
  });

  // ── T1-b: wave structure ────────────────────────────────────────────────────
  test('b: phase with 2 plans in wave 1 and 1 in wave 2 returns correct waves array', () => {
    const tmpDir = makeTestPlanningDir('02-waves', [
      {
        filename: 'PLAN-01.md',
        frontmatter: { phase: '"02-waves"', plan: '"02-01"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 1
      },
      {
        filename: 'PLAN-02.md',
        frontmatter: { phase: '"02-waves"', plan: '"02-02"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 1
      },
      {
        filename: 'PLAN-03.md',
        frontmatter: { phase: '"02-waves"', plan: '"02-03"', wave: 2, depends_on: '"02-01"', files_modified: [] },
        taskCount: 1
      }
    ]);
    const result = buildPreview('waves', {}, tmpDir, PLUGIN_ROOT);
    expect(result.waves).toHaveLength(2);
    expect(result.waves[0].wave).toBe(1);
    expect(result.waves[0].plans).toHaveLength(2);
    expect(result.waves[0].parallel).toBe(true);
    expect(result.waves[1].wave).toBe(2);
    expect(result.waves[1].plans).toHaveLength(1);
    expect(result.waves[1].parallel).toBe(false);
  });

  // ── T1-c: files_affected deduplication ─────────────────────────────────────
  test('c: files_affected is a deduplicated sorted array of all files_modified', () => {
    const tmpDir = makeTestPlanningDir('03-files', [
      {
        filename: 'PLAN-01.md',
        frontmatter: {
          phase: '"03-files"',
          plan: '"03-01"',
          wave: 1,
          depends_on: '[]'
        },
        taskCount: 1
      },
      {
        filename: 'PLAN-02.md',
        frontmatter: {
          phase: '"03-files"',
          plan: '"03-02"',
          wave: 1,
          depends_on: '[]'
        },
        taskCount: 1
      }
    ]);
    // Manually write plans with files_modified arrays
    const phaseDir = path.join(tmpDir, 'phases', '03-files');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'phase: "03-files"',
      'plan: "03-01"',
      'wave: 1',
      'depends_on: []',
      'files_modified:',
      '  - src/foo.js',
      '  - src/bar.js',
      '---',
      '',
      '<task id="03-01-T1" type="auto">',
      '</task>'
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), [
      '---',
      'phase: "03-files"',
      'plan: "03-02"',
      'wave: 1',
      'depends_on: []',
      'files_modified:',
      '  - src/bar.js',
      '  - src/baz.js',
      '---',
      '',
      '<task id="03-02-T1" type="auto">',
      '</task>'
    ].join('\n'), 'utf8');

    const result = buildPreview('files', {}, tmpDir, PLUGIN_ROOT);
    expect(result.files_affected).toEqual(['src/bar.js', 'src/baz.js', 'src/foo.js']);
  });

  // ── T1-d: agent_count from task tags ───────────────────────────────────────
  test('d: agent_count equals total task count across all plans', () => {
    const tmpDir = makeTestPlanningDir('04-agents', [
      {
        filename: 'PLAN-01.md',
        frontmatter: { phase: '"04-agents"', plan: '"04-01"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 3
      },
      {
        filename: 'PLAN-02.md',
        frontmatter: { phase: '"04-agents"', plan: '"04-02"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 2
      }
    ]);
    const result = buildPreview('agents', {}, tmpDir, PLUGIN_ROOT);
    expect(result.agent_count).toBe(5);
  });

  // ── T1-e: critical_path ─────────────────────────────────────────────────────
  test('e: critical_path is first plan ID from each wave in order', () => {
    const tmpDir = makeTestPlanningDir('05-crit', [
      {
        filename: 'PLAN-01.md',
        frontmatter: { phase: '"05-crit"', plan: '"05-01"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 1
      },
      {
        filename: 'PLAN-02.md',
        frontmatter: { phase: '"05-crit"', plan: '"05-02"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 1
      },
      {
        filename: 'PLAN-03.md',
        frontmatter: { phase: '"05-crit"', plan: '"05-03"', wave: 2, depends_on: '"05-01"', files_modified: [] },
        taskCount: 1
      }
    ]);
    const result = buildPreview('crit', {}, tmpDir, PLUGIN_ROOT);
    expect(result.critical_path).toEqual(['05-01', '05-03']);
  });

  // ── T1-f: dependency_chain ──────────────────────────────────────────────────
  test('f: dependency_chain is array of {id, wave, depends_on} per plan', () => {
    const tmpDir = makeTestPlanningDir('06-deps', [
      {
        filename: 'PLAN-01.md',
        frontmatter: { phase: '"06-deps"', plan: '"06-01"', wave: 1, depends_on: '[]', files_modified: [] },
        taskCount: 1
      },
      {
        filename: 'PLAN-02.md',
        frontmatter: { phase: '"06-deps"', plan: '"06-02"', wave: 2, depends_on: '"06-01"', files_modified: [] },
        taskCount: 1
      }
    ]);
    const result = buildPreview('deps', {}, tmpDir, PLUGIN_ROOT);
    expect(result.dependency_chain).toHaveLength(2);
    expect(result.dependency_chain[0]).toMatchObject({ wave: 1 });
    expect(result.dependency_chain[1]).toMatchObject({ wave: 2 });
  });

  // ── T1-g: nonexistent phase ─────────────────────────────────────────────────
  test('g: nonexistent phase slug returns error object', () => {
    const tmpDir = makeTestPlanningDir('07-exists', []);
    const result = buildPreview('does-not-exist-xyz', {}, tmpDir, PLUGIN_ROOT);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/Phase not found/);
  });

  // ── T1-h: zero PLAN files ───────────────────────────────────────────────────
  test('h: phase with zero PLAN files returns empty result', () => {
    const tmpDir = makeTestPlanningDir('08-empty', []);
    // phaseDir already created by makeTestPlanningDir but with no plans
    const result = buildPreview('empty', {}, tmpDir, PLUGIN_ROOT);
    expect(result.plans).toEqual([]);
    expect(result.waves).toEqual([]);
    expect(result.files_affected).toEqual([]);
    expect(result.agent_count).toBe(0);
    expect(result.critical_path).toEqual([]);
    expect(result.dependency_chain).toEqual([]);
  });

});
