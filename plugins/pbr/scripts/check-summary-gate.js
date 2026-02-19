#!/usr/bin/env node

/**
 * PreToolUse hook (Write|Edit): Blocks STATE.md updates that advance
 * phase status to "built" or "verified" unless a SUMMARY file exists
 * for the current phase.
 *
 * This prevents the scenario where verification runs and STATE.md is
 * updated but the executor never wrote a SUMMARY — leaving the project
 * in an inconsistent state.
 *
 * Trigger: Write|Edit to STATE.md (via pre-write-dispatch.js)
 *
 * Logic:
 *   1. Only fires when the target file is STATE.md
 *   2. Reads the new content being written (from tool_input)
 *   3. Extracts the phase slug and status from frontmatter
 *   4. If status is advancing to "built", "verified", or "complete",
 *      checks that a SUMMARY-*.md file exists in the phase directory
 *   5. Blocks (exit 2) if no SUMMARY found
 *
 * Exit codes:
 *   0 = allowed or not applicable
 *   2 = blocked (no SUMMARY exists for advancing phase)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

// Statuses that indicate a phase has been executed
const ADVANCED_STATUSES = ['built', 'verified', 'complete', 'building'];

/**
 * Extract YAML frontmatter values from markdown content.
 * Returns an object with parsed key-value pairs.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w_]*):\s*"?([^"\r\n]*)"?$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

/**
 * Check if a SUMMARY file exists for the given phase directory.
 */
function hasSummaryFile(phaseDir) {
  if (!fs.existsSync(phaseDir)) return false;
  try {
    const files = fs.readdirSync(phaseDir);
    return files.some(f => /^SUMMARY.*\.md$/i.test(f));
  } catch (_e) {
    return false;
  }
}

/**
 * Find the phase directory matching a slug or phase number.
 */
function findPhaseDir(planningDir, phaseSlug, phaseNumber) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return null;

  try {
    const dirs = fs.readdirSync(phasesDir);

    // Try exact slug match first
    if (phaseSlug) {
      const match = dirs.find(d => d === phaseSlug);
      if (match) return path.join(phasesDir, match);
    }

    // Fall back to phase number prefix
    if (phaseNumber) {
      const padded = String(phaseNumber).padStart(2, '0');
      const match = dirs.find(d => d.startsWith(padded + '-'));
      if (match) return path.join(phasesDir, match);
    }
  } catch (_e) {
    // best-effort
  }
  return null;
}

function checkSummaryGate(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  // Only check STATE.md writes
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath.endsWith('.planning/STATE.md')) return null;

  // Get the new content being written
  // For Write: tool_input.content
  // For Edit: tool_input.new_string (partial — check for status changes)
  const content = data.tool_input?.content || '';
  const newString = data.tool_input?.new_string || '';
  const textToCheck = content || newString;

  if (!textToCheck) return null;

  // Parse frontmatter from the content
  const fm = parseFrontmatter(textToCheck);
  const newStatus = (fm.status || '').toLowerCase();

  // For Edit operations, check if the new_string contains a status advancement
  let editAdvancing = false;
  if (!content && newString) {
    const statusMatch = newString.match(/status:\s*"?(\w+)"?/);
    if (statusMatch) {
      const editStatus = statusMatch[1].toLowerCase();
      editAdvancing = ADVANCED_STATUSES.includes(editStatus);
    }
  }

  // Only gate on status advancement
  if (!ADVANCED_STATUSES.includes(newStatus) && !editAdvancing) return null;

  // Determine phase from content
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const phaseSlug = fm.phase_slug || '';
  const phaseNumber = fm.current_phase || '';

  // Also try to extract from body text for Edit operations
  let effectiveSlug = phaseSlug;
  let effectiveNumber = phaseNumber;
  if (!effectiveSlug && !effectiveNumber) {
    const slugMatch = textToCheck.match(/phase_slug:\s*"?([^"\r\n]+)"?/);
    const numMatch = textToCheck.match(/current_phase:\s*(\d+)/);
    if (slugMatch) effectiveSlug = slugMatch[1].trim();
    if (numMatch) effectiveNumber = numMatch[1];
  }

  // For Edit operations where we only see the diff, read current STATE.md
  if (!effectiveSlug && !effectiveNumber) {
    try {
      const currentState = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf8');
      const currentFm = parseFrontmatter(currentState);
      effectiveSlug = currentFm.phase_slug || '';
      effectiveNumber = currentFm.current_phase || '';
    } catch (_e) {
      // Can't determine phase — allow the write
      return null;
    }
  }

  const phaseDir = findPhaseDir(planningDir, effectiveSlug, effectiveNumber);
  if (!phaseDir) return null; // Can't find phase dir — don't block

  if (hasSummaryFile(phaseDir)) return null; // SUMMARY exists — all good

  const effectiveStatus = editAdvancing
    ? (newString.match(/status:\s*"?(\w+)"?/) || [])[1]
    : newStatus;

  logHook('check-summary-gate', 'PreToolUse', 'block', {
    status: effectiveStatus,
    phase: effectiveSlug || effectiveNumber,
    phaseDir: path.basename(phaseDir)
  });

  return {
    exitCode: 2,
    output: {
      decision: 'block',
      reason: `SUMMARY gate: Cannot set status to "${effectiveStatus}" — no SUMMARY file found in ${path.basename(phaseDir)}/.\n\nThe executor must write a SUMMARY-{plan_id}.md before STATE.md can advance. This prevents inconsistent state where a phase appears complete but has no build receipt.\n\nTo fix:\n  1. Run the executor to generate the SUMMARY file\n  2. Or manually create SUMMARY-{plan_id}.md in .planning/phases/${path.basename(phaseDir)}/`
    }
  };
}

// Standalone mode
function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = checkSummaryGate(data);
      if (result) {
        process.stdout.write(JSON.stringify(result.output));
        process.exit(result.exitCode || 0);
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

module.exports = { checkSummaryGate, parseFrontmatter, hasSummaryFile, findPhaseDir, ADVANCED_STATUSES };
if (require.main === module || process.argv[1] === __filename) { main(); }
