/**
 * Tests for hooks/lib/suggest-next.js — suggestNext routing logic.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { suggestNext } = require('../hooks/lib/suggest-next');

let tmpDir, planningDir;

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
});

describe('suggestNext', () => {
  it('suggests begin when no .planning/ directory exists', () => {
    const result = suggestNext('/nonexistent/.planning');
    expect(result.command).toBe('/pbr:begin');
    expect(result.reason).toContain('No .planning/');
    expect(result.context.current_phase).toBeNull();
  });

  it('suggests begin when no state file and no phases exist', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:begin');
    expect(result.reason).toContain('No project initialized');
  });

  it('suggests plan when phases are empty', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 1\nstatus: planning\n---\n');

    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:plan');
    expect(result.reason).toContain('needs planning');
  });

  it('suggests build when phase is planned', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 1\nstatus: planned\n---\n');

    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nphase: "01-setup"\nplan: "01-01"\n---\n');

    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:build');
    expect(result.reason).toContain('planned');
  });

  it('suggests build when phase is building', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 1\nstatus: building\n---\n');

    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nphase: "01-setup"\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), '---\nphase: "01-setup"\nplan: "01-02"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nplan: "01-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n');

    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:build');
    expect(result.reason).toContain('build in progress');
  });

  it('suggests review when phase is built but not verified', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 1\nstatus: built\n---\n');

    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\nphase: "01-setup"\nplan: "01-01"\n---\n');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nplan: "01-01"\nstatus: complete\nrequires: []\nkey_files: []\ndeferred: []\n---\n');

    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:review');
    expect(result.reason).toContain('not verified');
  });

  it('suggests resume when paused work exists', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase: 1\nstatus: building\n---\n');

    // Create .continue-here.md at project root
    fs.writeFileSync(path.join(tmpDir, '.continue-here.md'), 'Paused at task 3');

    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:resume');
    expect(result.reason).toContain('Paused work');
  });

  it('suggests new-milestone when status is milestone-complete', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\nstatus: milestone-complete\n---\n');

    const result = suggestNext(planningDir);
    expect(result.command).toBe('/pbr:new-milestone');
  });

  it('includes alternatives for todos and notes', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    writePlanningFile(planningDir, 'STATE.md', '---\nstatus: building\ncurrent_phase: 1\n---\n');

    // Create pending todos
    const todosDir = path.join(planningDir, 'todos', 'pending');
    fs.mkdirSync(todosDir, { recursive: true });
    fs.writeFileSync(path.join(todosDir, '001-fix-bug.md'), '---\ntitle: Fix bug\n---\n');

    const result = suggestNext(planningDir);
    expect(result.alternatives.some(a => a.command.includes('todo'))).toBe(true);
  });

  it('returns result with context fields', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = suggestNext(planningDir);
    expect(result).toHaveProperty('command');
    expect(result).toHaveProperty('args');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('alternatives');
    expect(result).toHaveProperty('context');
  });
});
