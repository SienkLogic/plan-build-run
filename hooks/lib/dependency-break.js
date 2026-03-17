#!/usr/bin/env node

/**
 * Dependency break detection module.
 *
 * Detects when upstream SUMMARY.md changes invalidate downstream plans
 * by comparing MD5 fingerprints stored in plan frontmatter against
 * the current SUMMARY.md content.
 *
 * Pure function — no side effects, no file writes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Compute an 8-char MD5 fingerprint of a file's content.
 * @param {string} filePath - Absolute path to file
 * @returns {string|null} 8-char hex fingerprint, or null if file missing
 */
function computeFingerprint(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  } catch (_e) {
    return null;
  }
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Extracts dependency_fingerprints and plan fields.
 * @param {string} content - File content
 * @returns {{ plan: string, dependency_fingerprints: Object<string, string> }}
 */
function parsePlanFrontmatter(content) {
  const result = { plan: '', dependency_fingerprints: {} };

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];

  // Extract plan ID
  const planMatch = fm.match(/plan:\s*"?([^"\n]+)"?/);
  if (planMatch) result.plan = planMatch[1].trim();

  // Extract dependency_fingerprints — stored as JSON object in YAML
  const fpMatch = fm.match(/dependency_fingerprints:\s*(\{[^}]+\})/);
  if (fpMatch) {
    try {
      // Parse JSON-style object: { "3": "abc123" }
      const parsed = JSON.parse(fpMatch[1].replace(/'/g, '"'));
      result.dependency_fingerprints = parsed;
    } catch (_e) {
      // Malformed — return empty
    }
  }

  return result;
}

/**
 * Check for dependency breaks when an upstream phase's SUMMARY.md changes.
 *
 * Scans all downstream plans for dependency_fingerprints that reference
 * the changed phase, and returns breaks where fingerprints don't match.
 *
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {number} changedPhaseNum - Phase number whose SUMMARY.md changed
 * @returns {Array<{ plan: string, dependsOn: number, expected: string, actual: string }>}
 */
function checkDependencyBreaks(planningDir, changedPhaseNum) {
  const breaks = [];

  // Find the changed phase's SUMMARY.md
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return breaks;

  let summaryPath = null;
  const paddedNum = String(changedPhaseNum).padStart(2, '0');

  try {
    const phaseDirs = fs.readdirSync(phasesDir);
    for (const dir of phaseDirs) {
      if (dir.startsWith(paddedNum + '-')) {
        const candidate = path.join(phasesDir, dir, 'SUMMARY.md');
        if (fs.existsSync(candidate)) {
          summaryPath = candidate;
          break;
        }
      }
    }
  } catch (_e) {
    return breaks;
  }

  // No SUMMARY.md for the changed phase — nothing to fingerprint
  if (!summaryPath) return breaks;

  const actualFingerprint = computeFingerprint(summaryPath);
  if (!actualFingerprint) return breaks;

  // Scan all phase directories for PLAN*.md files with dependency_fingerprints
  try {
    const phaseDirs = fs.readdirSync(phasesDir);
    for (const dir of phaseDirs) {
      const phaseDir = path.join(phasesDir, dir);
      const stat = fs.statSync(phaseDir);
      if (!stat.isDirectory()) continue;

      const files = fs.readdirSync(phaseDir);
      for (const file of files) {
        if (!file.match(/^PLAN.*\.md$/i)) continue;

        const planPath = path.join(phaseDir, file);
        try {
          const content = fs.readFileSync(planPath, 'utf8');
          const parsed = parsePlanFrontmatter(content);

          // Check if this plan has a fingerprint for the changed phase
          const phaseKey = String(changedPhaseNum);
          if (parsed.dependency_fingerprints[phaseKey]) {
            const expectedFp = parsed.dependency_fingerprints[phaseKey];
            if (expectedFp !== actualFingerprint) {
              breaks.push({
                plan: parsed.plan || file.replace('.md', ''),
                dependsOn: changedPhaseNum,
                expected: expectedFp,
                actual: actualFingerprint
              });
            }
          }
        } catch (_e) {
          // Skip unreadable plans
        }
      }
    }
  } catch (_e) {
    // Return whatever breaks we found so far
  }

  return breaks;
}

module.exports = { checkDependencyBreaks, computeFingerprint };
