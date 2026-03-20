'use strict';

/**
 * Tests for cmdPlanValidate in plan-build-run/bin/lib/spot-check.cjs.
 * Covers: nonexistent phase, valid plan, missing fields, no tasks, no plan files,
 * and multi-file aggregation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { cmdPlanValidate } = require('../plan-build-run/bin/lib/spot-check.cjs');

function makeTmpProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-plan-validate-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

function makePhaseDir(tmpDir, slug) {
  const dir = path.join(tmpDir, '.planning', 'phases', slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeValidPlan(phaseDir, filename) {
  const content = [
    '---',
    'phase: "01-test"',
    'plan: "01-01"',
    'wave: 1',
    'depends_on: []',
    'files_modified:',
    '  - "src/index.js"',
    'must_haves:',
    '  truths:',
    '    - "thing works"',
    'tasks: 1',
    '---',
    '',
    '## Tasks',
    '',
    '<task id="01-01-T1" type="auto">',
    '<name>Do something</name>',
    '<action>',
    '1. Step one',
    '</action>',
    '<verify>',
    'echo "ok"',
    '</verify>',
    '<done>',
    'It is done.',
    '</done>',
    '</task>'
  ].join('\n');
  fs.writeFileSync(path.join(phaseDir, filename || 'PLAN-01.md'), content, 'utf8');
}

describe('cmdPlanValidate', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('returns error for nonexistent phase', () => {
    tmpDir = makeTmpProject();
    const result = cmdPlanValidate(tmpDir, '99');
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns passed for well-formed plan', () => {
    tmpDir = makeTmpProject();
    const phaseDir = makePhaseDir(tmpDir, '01-test');
    writeValidPlan(phaseDir);

    const result = cmdPlanValidate(tmpDir, '01');
    expect(result.passed).toBe(true);
    expect(result.spot_check.passed).toBe(true);
    expect(result.structure).toHaveLength(1);
    expect(result.structure[0].valid).toBe(true);
    expect(result.structure[0].task_count).toBe(1);
    expect(result.plan_count).toBe(1);
    expect(result.phase).toBe('01-test');
  });

  it('returns failed for plan missing frontmatter fields', () => {
    tmpDir = makeTmpProject();
    const phaseDir = makePhaseDir(tmpDir, '02-incomplete');

    const content = [
      '---',
      'phase: "02-incomplete"',
      '---',
      '',
      '## Tasks',
      '',
      '<task id="02-01-T1" type="auto">',
      '<name>Do something</name>',
      '<action>Step one</action>',
      '<verify>echo ok</verify>',
      '<done>Done</done>',
      '</task>'
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), content, 'utf8');

    const result = cmdPlanValidate(tmpDir, '02');
    expect(result.passed).toBe(false);
    expect(result.structure[0].errors.length).toBeGreaterThan(0);
    expect(result.structure[0].valid).toBe(false);
  });

  it('returns warning for plan with no task elements', () => {
    tmpDir = makeTmpProject();
    const phaseDir = makePhaseDir(tmpDir, '03-notasks');

    const content = [
      '---',
      'phase: "03-notasks"',
      'plan: "03-01"',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'must_haves:',
      '  truths: []',
      '---',
      '',
      '## Tasks',
      '',
      'No tasks yet.'
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), content, 'utf8');

    const result = cmdPlanValidate(tmpDir, '03');
    // The spot_check should fail because the task section has no <task> elements
    expect(result.passed).toBe(false);
  });

  it('returns failed when no PLAN files exist', () => {
    tmpDir = makeTmpProject();
    makePhaseDir(tmpDir, '04-empty');

    const result = cmdPlanValidate(tmpDir, '04');
    expect(result.passed).toBe(false);
    expect(result.spot_check.passed).toBe(false);
    expect(result.plan_count).toBe(0);
  });

  it('aggregates results across multiple PLAN files', () => {
    tmpDir = makeTmpProject();
    const phaseDir = makePhaseDir(tmpDir, '05-multi');

    // PLAN-01.md is valid
    writeValidPlan(phaseDir, 'PLAN-01.md');

    // PLAN-02.md is invalid (missing required fields)
    const invalidContent = [
      '---',
      'phase: "05-multi"',
      '---',
      '',
      '## Tasks',
      '',
      '<task id="05-02-T1" type="auto">',
      '<name>Something</name>',
      '<action>Do it</action>',
      '<verify>echo ok</verify>',
      '<done>Done</done>',
      '</task>'
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-02.md'), invalidContent, 'utf8');

    const result = cmdPlanValidate(tmpDir, '05');
    expect(result.passed).toBe(false);
    expect(result.plan_count).toBe(2);

    // One should be valid, one invalid
    const validEntries = result.structure.filter(s => s.valid);
    const invalidEntries = result.structure.filter(s => !s.valid);
    expect(validEntries.length).toBe(1);
    expect(invalidEntries.length).toBe(1);
  });

  it('detects missing task elements in individual tasks', () => {
    tmpDir = makeTmpProject();
    const phaseDir = makePhaseDir(tmpDir, '06-badtask');

    const content = [
      '---',
      'phase: "06-badtask"',
      'plan: "06-01"',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'must_haves:',
      '  truths: []',
      'tasks: 1',
      '---',
      '',
      '## Tasks',
      '',
      '<task id="06-01-T1" type="auto">',
      '<name>Incomplete task</name>',
      '</task>'
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), content, 'utf8');

    const result = cmdPlanValidate(tmpDir, '06');
    expect(result.passed).toBe(false);
    expect(result.structure[0].valid).toBe(false);
    // Should report missing action, verify, done
    const errors = result.structure[0].errors;
    expect(errors.some(e => e.includes('action'))).toBe(true);
    expect(errors.some(e => e.includes('verify'))).toBe(true);
    expect(errors.some(e => e.includes('done'))).toBe(true);
  });
});
