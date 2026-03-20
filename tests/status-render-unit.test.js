/**
 * Unit tests for hooks/lib/status-render.js
 *
 * Tests progressBar rendering, statusRender scanning, routing, milestone parsing,
 * todos/notes/quick counting, state warnings, and document inventory.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { statusRender, progressBar } = require('../plugins/pbr/scripts/lib/status-render');

describe('progressBar', () => {
  test('0% => all empty blocks', () => {
    const bar = progressBar(0);
    expect(bar).toContain('░'.repeat(20));
    expect(bar).toMatch(/0%$/);
  });

  test('100% => all filled blocks', () => {
    const bar = progressBar(100);
    expect(bar).toContain('█'.repeat(20));
    expect(bar).toMatch(/100%$/);
  });

  test('50% => 10 filled, 10 empty', () => {
    const bar = progressBar(50);
    expect(bar).toContain('█'.repeat(10));
    expect(bar).toContain('░'.repeat(10));
    expect(bar).toMatch(/50%$/);
  });

  test('25% => 5 filled, 15 empty', () => {
    const bar = progressBar(25);
    expect(bar).toContain('█'.repeat(5));
    expect(bar).toContain('░'.repeat(15));
    expect(bar).toMatch(/25%$/);
  });
});

describe('statusRender', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTmpPlanning());
  });

  afterEach(() => {
    cleanupTmp(tmpDir);
  });

  test('non-existent path => default object with /pbr:new-project', () => {
    const result = statusRender(path.join(tmpDir, 'nonexistent'));
    expect(result.project_name).toBeNull();
    expect(result.phases).toEqual([]);
    expect(result.progress.percentage).toBe(0);
    expect(result.routing.primary.command).toBe('/pbr:new-project');
  });

  test('empty .planning => phases=[], documents all false except existing', () => {
    const result = statusRender(planningDir);
    expect(result.phases).toEqual([]);
    expect(result.documents['PROJECT.md']).toBe(false);
    expect(result.documents['STATE.md']).toBe(false);
    expect(result.documents['config.json']).toBe(false);
  });

  describe('config.json handling', () => {
    test('valid config.json => project_name appears', () => {
      writePlanningFile(planningDir, 'config.json', JSON.stringify({ project_name: 'MyProj' }));
      const result = statusRender(planningDir);
      expect(result.project_name).toBe('MyProj');
    });

    test('malformed config.json => project_name falls back to null', () => {
      writePlanningFile(planningDir, 'config.json', '{broken');
      const result = statusRender(planningDir);
      expect(result.project_name).toBeNull();
    });
  });

  describe('phase scanning', () => {
    test('phase with PLAN only => status=planned', () => {
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      const result = statusRender(planningDir);
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].status).toBe('planned');
      expect(result.phases[0].plans_total).toBe(1);
    });

    test('phase with PLAN + SUMMARY => status=built', () => {
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01-01.md', '---\nstatus: complete\n---\n');
      const result = statusRender(planningDir);
      expect(result.phases[0].status).toBe('built');
    });

    test('phase with VERIFICATION result=passed => status=verified', () => {
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01-01.md', '---\nstatus: complete\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/VERIFICATION.md', '---\nresult: passed\n---\n');
      const result = statusRender(planningDir);
      expect(result.phases[0].status).toBe('verified');
    });
  });

  describe('progress calculation', () => {
    test('2 phases: 2/3 plans complete => percentage=67', () => {
      // Phase 1: 2 plans, 2 summaries
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-02.md', '---\nplan: "01-02"\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01-01.md', '---\nstatus: complete\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01-02.md', '---\nstatus: complete\n---\n');
      // Phase 2: 1 plan, 0 summaries
      writePlanningFile(planningDir, 'phases/02-build/PLAN-01.md', '---\nplan: "02-01"\n---\n');
      const result = statusRender(planningDir);
      expect(result.progress.total_plans).toBe(3);
      expect(result.progress.completed_plans).toBe(2);
      expect(result.progress.percentage).toBe(67);
    });
  });

  describe('milestone parsing', () => {
    test('COMPLETED milestone => status=completed', () => {
      writePlanningFile(planningDir, 'ROADMAP.md', '---\nproject: test\n---\n\n## Milestone: Test v1.0 — COMPLETED\n\n### Phase 1\n');
      const result = statusRender(planningDir);
      expect(result.milestones).toHaveLength(1);
      expect(result.milestones[0].status).toBe('completed');
    });

    test('ACTIVE milestone => current milestone set', () => {
      writePlanningFile(planningDir, 'ROADMAP.md', '---\nproject: test\n---\n\n## Milestone: Active (v2.0) — ACTIVE\n\n### Phase 1\n');
      const result = statusRender(planningDir);
      expect(result.milestones.length).toBeGreaterThanOrEqual(1);
      expect(result.milestone).not.toBeNull();
      expect(result.milestone.status).toBe('active');
    });
  });

  describe('routing integration', () => {
    test('paused work => /pbr:resume', () => {
      // .continue-here.md is checked relative to planningDir/..
      fs.writeFileSync(path.join(tmpDir, '.continue-here.md'), 'paused');
      const result = statusRender(planningDir);
      expect(result.routing.primary.command).toBe('/pbr:resume');
    });

    test('planned phase => /pbr:build', () => {
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      const result = statusRender(planningDir);
      expect(result.routing.primary.command).toBe('/pbr:build');
    });
  });

  describe('todos/notes/quick counting', () => {
    test('pending todo => todos_pending=1', () => {
      writePlanningFile(planningDir, 'todos/pending/001.md', '---\ntitle: fix\n---\n');
      const result = statusRender(planningDir);
      expect(result.todos_pending).toBe(1);
    });

    test('active note => notes_active=1', () => {
      writePlanningFile(planningDir, 'notes/note.md', '---\ndate: 2026-01-01\n---\n');
      const result = statusRender(planningDir);
      expect(result.notes_active).toBe(1);
    });

    test('quick tasks: in-progress and complete', () => {
      writePlanningFile(planningDir, 'quick/001-fix-bug/PLAN.md', '---\ntitle: Fix bug\n---\n');
      writePlanningFile(planningDir, 'quick/002-done/PLAN.md', '---\ntitle: Done task\n---\n');
      writePlanningFile(planningDir, 'quick/002-done/SUMMARY.md', '---\nstatus: complete\n---\n');
      const result = statusRender(planningDir);
      expect(result.quick_tasks).toHaveLength(2);
      const inProgress = result.quick_tasks.find(t => t.id === '001');
      const complete = result.quick_tasks.find(t => t.id === '002');
      expect(inProgress.status).toBe('in-progress');
      expect(complete.status).toBe('complete');
    });
  });

  describe('state warning', () => {
    test('STATE.md >150 lines => state_warning non-null', () => {
      const longState = '---\nstatus: building\n---\n' + 'line\n'.repeat(200);
      writePlanningFile(planningDir, 'STATE.md', longState);
      const result = statusRender(planningDir);
      expect(result.state_warning).not.toBeNull();
      expect(result.state_warning).toContain('150');
    });

    test('STATE.md <150 lines => state_warning null', () => {
      writePlanningFile(planningDir, 'STATE.md', '---\nstatus: building\n---\nshort');
      const result = statusRender(planningDir);
      expect(result.state_warning).toBeNull();
    });
  });

  describe('documents inventory', () => {
    test('all documents present => all true', () => {
      writePlanningFile(planningDir, 'PROJECT.md', '# Project');
      writePlanningFile(planningDir, 'REQUIREMENTS.md', '# Reqs');
      writePlanningFile(planningDir, 'ROADMAP.md', '---\nproject: test\n---\n');
      writePlanningFile(planningDir, 'STATE.md', '---\nstatus: building\n---\n');
      writePlanningFile(planningDir, 'config.json', '{}');
      const result = statusRender(planningDir);
      expect(result.documents['PROJECT.md']).toBe(true);
      expect(result.documents['REQUIREMENTS.md']).toBe(true);
      expect(result.documents['ROADMAP.md']).toBe(true);
      expect(result.documents['STATE.md']).toBe(true);
      expect(result.documents['config.json']).toBe(true);
    });
  });
});
