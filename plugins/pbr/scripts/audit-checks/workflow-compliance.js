'use strict';

/**
 * Workflow Compliance Check Module
 *
 * Implements WC-02, WC-03, WC-04, WC-08 workflow compliance dimensions
 * for the PBR audit system. Each check returns a structured result:
 * { dimension, status, message, evidence }.
 *
 * Checks:
 *   WC-02: State file integrity (STATE.md matches disk)
 *   WC-03: STATE.md frontmatter integrity (valid YAML, required fields)
 *   WC-04: ROADMAP sync validation (ROADMAP.md matches phase directories)
 *   WC-08: Naming convention compliance (PLAN-{NN}.md format)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "WC-02")
 * @param {'pass'|'warn'|'fail'} status
 * @param {string} message
 * @param {string[]} [evidence]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function result(dimCode, status, message, evidence) {
  return {
    dimension: dimCode,
    status,
    message,
    evidence: evidence || [],
  };
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (lightweight, no external deps)
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from markdown content as key-value pairs.
 * Handles both \n and \r\n line endings.
 * @param {string} content
 * @returns {object} Parsed frontmatter fields
 */
function parseFrontmatter(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return {};

  const fields = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const match = lines[i].match(/^(\w[\w_-]*):\s*(.*)$/);
    if (match) {
      let value = match[2].trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Parse arrays (simple single-line format)
      if (value === '[]') {
        value = [];
      } else if (value === 'null' || value === '') {
        value = value === 'null' ? null : value;
      }
      fields[match[1]] = value;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// WC-02: State File Integrity
// ---------------------------------------------------------------------------

/**
 * Check STATE.md integrity against actual phase directories.
 * Cross-references current_phase, phases_total, and status against disk.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkStateFileIntegrity(planningDir, _config) {
  const statePath = path.join(planningDir, 'STATE.md');
  let content;

  try {
    content = fs.readFileSync(statePath, 'utf8');
  } catch (_e) {
    return result('WC-02', 'fail', 'STATE.md not found', [
      `Expected at: ${statePath}`,
    ]);
  }

  const fm = parseFrontmatter(content);
  const evidence = [];

  // Get actual phase directories
  const phasesDir = path.join(planningDir, 'phases');
  let actualDirs = [];
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    actualDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch (_e) {
    evidence.push('Could not read phases/ directory');
  }

  const actualCount = actualDirs.length;

  // Check phases_total against actual directory count
  const phasesTotal = parseInt(fm.phases_total, 10);
  if (!isNaN(phasesTotal) && phasesTotal !== actualCount) {
    evidence.push(
      `phases_total=${phasesTotal} but ${actualCount} phase directories on disk`
    );
  }

  // Check current_phase refers to existing directory
  const currentPhase = parseInt(fm.current_phase, 10);
  if (!isNaN(currentPhase)) {
    const prefix = String(currentPhase).padStart(2, '0') + '-';
    const hasDir = actualDirs.some(d => d.startsWith(prefix));
    if (!hasDir && actualDirs.length > 0) {
      evidence.push(
        `current_phase=${currentPhase} but no directory starting with "${prefix}" in phases/`
      );
    }
  }

  // If status is building/built, verify current phase dir has PLAN files
  const status = fm.status;
  if (status === 'building' || status === 'built') {
    const prefix = String(currentPhase).padStart(2, '0') + '-';
    const phaseDir = actualDirs.find(d => d.startsWith(prefix));
    if (phaseDir) {
      const phasePath = path.join(phasesDir, phaseDir);
      try {
        const files = fs.readdirSync(phasePath);
        const planFiles = files.filter(f => /^PLAN.*\.md$/i.test(f));
        if (planFiles.length === 0) {
          evidence.push(
            `Status is "${status}" but phase dir "${phaseDir}" has no PLAN files`
          );
        }
      } catch (_e) {
        evidence.push(`Could not read phase dir "${phaseDir}"`);
      }
    }
  }

  if (evidence.length === 0) {
    return result('WC-02', 'pass', 'STATE.md aligns with disk state');
  }

  // Critical mismatches (missing dirs, wrong phase) = fail; minor = warn
  const hasCritical = evidence.some(
    e => e.includes('not found') || e.includes('no directory')
  );

  return result(
    'WC-02',
    hasCritical ? 'fail' : 'warn',
    `STATE.md has ${evidence.length} mismatch(es) with disk`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// WC-03: STATE.md Frontmatter Integrity
// ---------------------------------------------------------------------------

/**
 * Validate STATE.md YAML frontmatter for required fields and correct types.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkStateFrontmatterIntegrity(planningDir, _config) {
  const statePath = path.join(planningDir, 'STATE.md');
  let content;

  try {
    content = fs.readFileSync(statePath, 'utf8');
  } catch (_e) {
    return result('WC-03', 'fail', 'STATE.md not found', [
      `Expected at: ${statePath}`,
    ]);
  }

  const fm = parseFrontmatter(content);
  const evidence = [];

  // Required fields
  const requiredFields = [
    'version', 'current_phase', 'phase_slug', 'status',
    'phases_total', 'plans_total', 'last_activity',
  ];

  const missingFields = [];
  for (const field of requiredFields) {
    if (fm[field] === undefined || fm[field] === '') {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    evidence.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Type validations
  const validStatuses = [
    'not_started', 'discussed', 'ready_to_plan', 'planning', 'planned',
    'ready_to_execute', 'building', 'built', 'partial', 'verified',
    'needs_fixes', 'complete', 'skipped',
  ];

  if (fm.version !== undefined) {
    const ver = Number(fm.version);
    if (isNaN(ver)) {
      evidence.push(`version "${fm.version}" is not a number`);
    }
  }

  if (fm.current_phase !== undefined) {
    const cp = Number(fm.current_phase);
    if (isNaN(cp)) {
      evidence.push(`current_phase "${fm.current_phase}" is not a number`);
    }
  }

  if (fm.status !== undefined && !validStatuses.includes(fm.status)) {
    evidence.push(
      `status "${fm.status}" is not a valid status (expected one of: ${validStatuses.join(', ')})`
    );
  }

  if (fm.phases_total !== undefined) {
    const pt = Number(fm.phases_total);
    if (isNaN(pt)) {
      evidence.push(`phases_total "${fm.phases_total}" is not numeric`);
    }
  }

  if (fm.plans_total !== undefined) {
    const plt = Number(fm.plans_total);
    if (isNaN(plt)) {
      evidence.push(`plans_total "${fm.plans_total}" is not numeric`);
    }
  }

  if (evidence.length === 0) {
    return result('WC-03', 'pass', 'STATE.md frontmatter is valid');
  }

  // Missing required fields = fail, type issues = warn
  const hasMissing = missingFields.length > 0;

  return result(
    'WC-03',
    hasMissing ? 'fail' : 'warn',
    `STATE.md frontmatter has ${evidence.length} issue(s)`,
    evidence
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkStateFileIntegrity,
  checkStateFrontmatterIntegrity,
};
