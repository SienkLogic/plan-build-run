/**
 * Tests for hooks/lib/step-verify.js — Per-step checklist verifier.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { stepVerify, matchPredicate } = require('../plugins/pbr/scripts/lib/step-verify');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sv-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- matchPredicate ---

describe('matchPredicate', () => {
  it('checks SUMMARY exists (file present)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '---\n---\n');
    const result = matchPredicate('SUMMARY.md exists', {
      planningDir,
      phaseSlug: '01-setup',
      planId: '01-01'
    });
    expect(result.passed).toBe(true);
  });

  it('checks SUMMARY exists (file missing)', () => {
    const result = matchPredicate('SUMMARY.md exists', {
      planningDir,
      phaseSlug: '01-setup',
      planId: '99-99'
    });
    expect(result.passed).toBe(false);
  });

  it('checks STATE.md updated (file present)', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\n---\n');
    const result = matchPredicate('STATE.md updated', { planningDir });
    expect(result.passed).toBe(true);
  });

  it('checks STATE.md exists (file missing)', () => {
    const result = matchPredicate('STATE.md exists', { planningDir });
    expect(result.passed).toBe(false);
  });

  it('checks PLAN.md exists (file present)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '---\n---\n');
    const result = matchPredicate('PLAN.md exists', {
      planningDir,
      phaseSlug: '01-setup'
    });
    expect(result.passed).toBe(true);
  });

  it('checks ROADMAP.md updated (present)', () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');
    const result = matchPredicate('ROADMAP.md updated', { planningDir });
    expect(result.passed).toBe(true);
  });

  it('checks ROADMAP.md updated (missing)', () => {
    const result = matchPredicate('ROADMAP.md updated', { planningDir });
    expect(result.passed).toBe(false);
  });

  it('fails when phaseSlug not provided for SUMMARY check', () => {
    const result = matchPredicate('SUMMARY.md exists', { planningDir });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('phaseSlug');
  });

  it('returns no-match for unrecognized predicate', () => {
    const result = matchPredicate('some random thing', { planningDir });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No predicate matched');
  });
});

// --- stepVerify ---

describe('stepVerify', () => {
  it('returns all_passed=true when all items pass', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\n---\n');
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# R\n');
    const result = stepVerify('build', 'step-1', [
      'STATE.md updated',
      'ROADMAP.md updated'
    ], { planningDir });
    expect(result.all_passed).toBe(true);
    expect(result.passed).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(result.skill).toBe('build');
    expect(result.step).toBe('step-1');
  });

  it('returns all_passed=false when some items fail', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '---\n---\n');
    const result = stepVerify('build', 'step-2', [
      'STATE.md updated',
      'ROADMAP.md updated'  // Missing
    ], { planningDir });
    expect(result.all_passed).toBe(false);
    expect(result.passed).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
  });

  it('returns error for invalid checklist (not array)', () => {
    const result = stepVerify('build', 'step-1', 'not-an-array', { planningDir });
    expect(result.error).toContain('Invalid checklist');
  });

  it('handles empty checklist', () => {
    const result = stepVerify('build', 'step-1', [], { planningDir });
    expect(result.all_passed).toBe(true);
    expect(result.passed).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('handles unrecognized checklist items as failures', () => {
    const result = stepVerify('build', 'step-1', ['some unknown check'], { planningDir });
    expect(result).toHaveProperty('all_passed');
    expect(result.all_passed).toBe(false);
    expect(result.failed).toContain('some unknown check');
  });
});
