/**
 * Tests for hooks/lib/status-render.js — statusRender, progressBar.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { statusRender, progressBar } = require('../hooks/lib/status-render');

let tmpDir, planningDir;

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
});

describe('progressBar', () => {
  it('returns 0% bar with all empty blocks', () => {
    const bar = progressBar(0);
    expect(bar).toContain('0%');
    expect(bar).toMatch(/\[░{20}\]/);
  });

  it('returns 50% bar with half filled', () => {
    const bar = progressBar(50);
    expect(bar).toContain('50%');
    expect(bar).toContain('█');
    expect(bar).toContain('░');
  });

  it('returns 100% bar fully filled', () => {
    const bar = progressBar(100);
    expect(bar).toContain('100%');
    expect(bar).toMatch(/\[█{20}\]/);
  });

  it('handles edge case: negative value throws', () => {
    // Negative repeat count throws RangeError
    expect(() => progressBar(-10)).toThrow();
  });

  it('handles edge case: value > 100 throws', () => {
    // repeat with negative empty count throws RangeError
    expect(() => progressBar(150)).toThrow();
  });
});

describe('statusRender', () => {
  it('returns default object when planningDir does not exist', () => {
    const result = statusRender('/nonexistent/path/.planning');
    expect(result.project_name).toBeNull();
    expect(result.phases).toEqual([]);
    expect(result.progress.percentage).toBe(0);
    expect(result.routing.primary.command).toBe('/pbr:new-project');
    expect(result.documents['STATE.md']).toBe(false);
  });

  it('returns status with STATE.md and ROADMAP.md present', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());

    writePlanningFile(planningDir, 'STATE.md', [
      '---',
      'current_phase: 1',
      'status: "building"',
      '---',
      '',
      '# Project State'
    ].join('\n'));

    writePlanningFile(planningDir, 'ROADMAP.md', [
      '---',
      'project: "TestProject"',
      '---',
      '',
      '## Milestone: Alpha (v1.0)',
      '',
      '### Phase 1: Setup'
    ].join('\n'));

    writePlanningFile(planningDir, 'config.json', JSON.stringify({ project_name: 'TestProject' }));

    const result = statusRender(planningDir);
    expect(result.project_name).toBe('TestProject');
    expect(result.documents['STATE.md']).toBe(true);
    expect(result.documents['ROADMAP.md']).toBe(true);
    expect(result.milestones.length).toBeGreaterThanOrEqual(1);
  });

  it('handles missing STATE.md gracefully', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const result = statusRender(planningDir);
    expect(result.documents['STATE.md']).toBe(false);
    expect(result.state_line_count).toBe(0);
  });

  it('handles missing ROADMAP.md gracefully', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const result = statusRender(planningDir);
    expect(result.documents['ROADMAP.md']).toBe(false);
    expect(result.milestones).toEqual([]);
  });

  it('scans phases from disk', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    // Create a phase directory with a plan
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nphase: "01-setup"\nplan: "01-01"\n---\n');

    const result = statusRender(planningDir);
    expect(result.phases.length).toBe(1);
    expect(result.phases[0].number).toBe(1);
    expect(result.phases[0].status).toBe('planned');
  });

  it('scans quick tasks', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const quickDir = path.join(planningDir, 'quick', '001-fix-bug');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), '---\ntitle: "Fix bug"\n---\n');

    const result = statusRender(planningDir);
    expect(result.quick_tasks.length).toBe(1);
    expect(result.quick_tasks[0].id).toBe('001');
  });

  it('detects state warning when STATE.md exceeds 150 lines', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const longState = '---\nstatus: building\n---\n' + 'line\n'.repeat(200);
    writePlanningFile(planningDir, 'STATE.md', longState);

    const result = statusRender(planningDir);
    expect(result.state_warning).toBeTruthy();
    expect(result.state_warning).toContain('150');
  });

  it('returns routing with primary command', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'config.json', '{}');

    const result = statusRender(planningDir);
    expect(result.routing).toBeDefined();
    expect(result.routing.primary).toBeDefined();
    expect(result.routing.primary.command).toBeTruthy();
  });
});
