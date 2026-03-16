'use strict';

/**
 * lib/step-verify.cjs -- Per-step completion checklist verifier for Plan-Build-Run.
 *
 * Provides stepVerify(skill, step, checklist, context) which maps checklist item
 * strings to filesystem predicates using keyword matching and returns a structured
 * pass/fail result.
 *
 * Usage (CLI via pbr-tools.cjs):
 *   node pbr-tools.cjs step-verify build step-6f '["STATE.md updated","SUMMARY.md exists"]'
 *
 * Returns: { skill, step, passed: string[], failed: string[], all_passed: boolean }
 * On invalid checklist: { error: 'Invalid checklist JSON' }
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Match a single checklist item string to a filesystem predicate.
 *
 * @param {string} item - Checklist item string (e.g. "STATE.md updated")
 * @param {object} context - { planningDir, phaseSlug, planId }
 * @returns {{ passed: boolean, reason: string }}
 */
function matchPredicate(item, context) {
  const lower = item.toLowerCase();
  const { planningDir, phaseSlug, planId } = context;

  const phasesDir = path.join(planningDir, 'phases');
  const phaseDir = phaseSlug ? path.join(phasesDir, phaseSlug) : null;

  // SUMMARY.md exists: check phaseDir for SUMMARY-{planId}.md or SUMMARY.md
  if (lower.includes('summary') && lower.includes('exist')) {
    if (!phaseDir) {
      return { passed: false, reason: 'phaseSlug not provided in context' };
    }
    const summaryNamedPath = planId
      ? path.join(phaseDir, `SUMMARY-${planId}.md`)
      : null;
    const summaryGenericPath = path.join(phaseDir, 'SUMMARY.md');
    const exists =
      (summaryNamedPath && fs.existsSync(summaryNamedPath)) ||
      fs.existsSync(summaryGenericPath);
    return {
      passed: exists,
      reason: exists ? 'SUMMARY file found' : 'No SUMMARY file in phase dir'
    };
  }

  // STATE.md updated or exists: check planningDir/STATE.md
  if (lower.includes('state') && (lower.includes('update') || lower.includes('exist'))) {
    const statePath = path.join(planningDir, 'STATE.md');
    const exists = fs.existsSync(statePath);
    return {
      passed: exists,
      reason: exists ? 'STATE.md found' : 'STATE.md not found in planningDir'
    };
  }

  // PLAN.md exists: check phaseDir has at least one PLAN*.md file
  if (lower.includes('plan') && lower.includes('exist')) {
    if (!phaseDir) {
      return { passed: false, reason: 'phaseSlug not provided in context' };
    }
    let planFiles = [];
    try {
      planFiles = fs.readdirSync(phaseDir).filter(f => /^PLAN.*\.md$/i.test(f));
    } catch (_e) {
      return { passed: false, reason: 'Phase directory not accessible' };
    }
    const exists = planFiles.length > 0;
    return {
      passed: exists,
      reason: exists ? `Found: ${planFiles.join(', ')}` : 'No PLAN*.md files in phase dir'
    };
  }

  // ROADMAP.md updated: check planningDir/ROADMAP.md
  if (lower.includes('roadmap') && lower.includes('update')) {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    const exists = fs.existsSync(roadmapPath);
    return {
      passed: exists,
      reason: exists ? 'ROADMAP.md found' : 'ROADMAP.md not found in planningDir'
    };
  }

  // commit made: spawn 'git log --oneline -1'; pass if stdout non-empty
  if (lower.includes('commit')) {
    const result = spawnSync('git', ['log', '--oneline', '-1'], {
      encoding: 'utf8',
      timeout: 5000
    });
    const output = (result.stdout || '').trim();
    const passed = output.length > 0;
    return {
      passed,
      reason: passed ? `Last commit: ${output}` : 'git log returned no output'
    };
  }

  // No predicate matched
  return {
    passed: false,
    reason: 'No predicate matched'
  };
}

/**
 * Verify a list of checklist items for a given skill step.
 *
 * @param {string} skill - Skill name (e.g. 'build')
 * @param {string} step - Step label (e.g. 'step-6f')
 * @param {Array<string>|*} checklist - Array of checklist item strings
 * @param {object} context - { planningDir, phaseSlug, planId }
 * @returns {{ skill, step, passed: string[], failed: string[], all_passed: boolean }
 *           | { error: string }}
 */
function stepVerify(skill, step, checklist, context) {
  if (!Array.isArray(checklist)) {
    return { error: 'Invalid checklist JSON' };
  }

  const passed = [];
  const failed = [];

  for (const item of checklist) {
    const { passed: itemPassed } = matchPredicate(item, context || {});
    if (itemPassed) {
      passed.push(item);
    } else {
      failed.push(item);
    }
  }

  return {
    skill,
    step,
    passed,
    failed,
    all_passed: failed.length === 0
  };
}

// matchPredicate exported for unit testing of individual predicate branches
module.exports = { stepVerify, matchPredicate };
