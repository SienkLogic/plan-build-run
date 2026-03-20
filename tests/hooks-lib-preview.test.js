/**
 * Tests for hooks/lib/preview.js — Dry-run preview for phases.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildPreview, groupByWave } = require('../plugins/pbr/scripts/lib/preview');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-preview-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- groupByWave ---

describe('groupByWave', () => {
  it('groups plans by wave number', () => {
    const plans = [
      { id: 'a', wave: 1 },
      { id: 'b', wave: 2 },
      { id: 'c', wave: 1 }
    ];
    const waves = groupByWave(plans);
    expect(waves).toHaveLength(2);
    expect(waves[0].wave).toBe(1);
    expect(waves[0].plans).toHaveLength(2);
    expect(waves[0].parallel).toBe(true);
    expect(waves[1].wave).toBe(2);
    expect(waves[1].plans).toHaveLength(1);
    expect(waves[1].parallel).toBe(false);
  });

  it('returns empty array for empty plans', () => {
    expect(groupByWave([])).toEqual([]);
  });

  it('defaults to wave 1 when wave is missing', () => {
    const plans = [{ id: 'a' }, { id: 'b' }];
    const waves = groupByWave(plans);
    expect(waves).toHaveLength(1);
    expect(waves[0].wave).toBe(1);
    expect(waves[0].plans).toHaveLength(2);
  });

  it('sorts waves in ascending order', () => {
    const plans = [
      { id: 'a', wave: 3 },
      { id: 'b', wave: 1 },
      { id: 'c', wave: 2 }
    ];
    const waves = groupByWave(plans);
    expect(waves.map(w => w.wave)).toEqual([1, 2, 3]);
  });
});

// --- buildPreview ---

describe('buildPreview', () => {
  it('returns error when phase not found', () => {
    const result = buildPreview('nonexistent', {}, planningDir, tmpDir);
    expect(result.error).toContain('not found');
  });

  it('returns empty plans for phase with no PLAN files', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'));
    const result = buildPreview('01-setup', {}, planningDir, tmpDir);
    expect(result.plans).toEqual([]);
    expect(result.waves).toEqual([]);
    expect(result.agent_count).toBe(0);
  });

  it('builds preview from plan files', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, 'PLAN-01.md'),
      '---\nplan: "01-01"\nwave: 1\ndepends_on: []\nfiles_modified:\n  - "src/a.js"\n  - "src/b.js"\n---\n\n<task id="T1">test</task>\n<task id="T2">test2</task>\n'
    );
    fs.writeFileSync(
      path.join(phaseDir, 'PLAN-02.md'),
      '---\nplan: "01-02"\nwave: 2\ndepends_on:\n  - "01-01"\nfiles_modified:\n  - "src/c.js"\n---\n\n<task id="T3">test3</task>\n'
    );

    const result = buildPreview('01-setup', {}, planningDir, tmpDir);
    expect(result.phase).toBe('01-setup');
    expect(result.plans).toHaveLength(2);
    expect(result.waves).toHaveLength(2);
    expect(result.agent_count).toBe(3); // 2 + 1 tasks
    expect(result.files_affected).toContain('src/a.js');
    expect(result.files_affected).toContain('src/c.js');
    expect(result.critical_path).toHaveLength(2);
    expect(result.dependency_chain).toHaveLength(2);
  });

  it('matches phase by partial slug', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '05-advanced-features'));
    fs.writeFileSync(
      path.join(planningDir, 'phases', '05-advanced-features', 'PLAN-01.md'),
      '---\nplan: "05-01"\nwave: 1\n---\n\n<task id="T1">t</task>\n'
    );
    const result = buildPreview('advanced-features', {}, planningDir, tmpDir);
    expect(result.phase).toBe('05-advanced-features');
  });

  it('handles single-wave plan set', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(phaseDir, 'PLAN-01.md'),
      '---\nplan: "01-01"\nwave: 1\n---\n\n<task id="T1">t</task>\n'
    );
    fs.writeFileSync(
      path.join(phaseDir, 'PLAN-02.md'),
      '---\nplan: "01-02"\nwave: 1\n---\n\n<task id="T2">t</task>\n'
    );

    const result = buildPreview('01-setup', {}, planningDir, tmpDir);
    expect(result.waves).toHaveLength(1);
    expect(result.waves[0].parallel).toBe(true);
  });

  it('returns error when phases dir is inaccessible', () => {
    // Remove the phases directory entirely
    fs.rmSync(path.join(planningDir, 'phases'), { recursive: true, force: true });
    const result = buildPreview('anything', {}, planningDir, tmpDir);
    expect(result.error).toBeDefined();
  });
});
