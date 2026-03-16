'use strict';

/**
 * alternatives.cjs -- Conversational error recovery helpers for PBR skills.
 *
 * Provides structured JSON responses for three error scenarios:
 *   phaseAlternatives(slug, planningDir)      -- phase-not-found recovery
 *   prerequisiteAlternatives(phase, planningDir) -- missing-prereq recovery
 *   configAlternatives(field, value, planningDir) -- config-invalid recovery
 */

const fs = require('fs');
const path = require('path');

// Known config fields and their valid values
const KNOWN_CONFIG_FIELDS = {
  'depth': ['quick', 'standard', 'deep'],
  'git.branching': ['phase', 'main', 'off'],
  'gates.confirm_plan': [true, false, 'true', 'false'],
  'gates.confirm_execute': [true, false, 'true', 'false'],
  'gates.confirm_review': [true, false, 'true', 'false'],
  'gates.confirm_milestone': [true, false, 'true', 'false'],
  'parallelism': ['off', 'wave', 'full'],
  'models.default': ['haiku', 'sonnet', 'inherit'],
  'models.planner': ['haiku', 'sonnet', 'inherit'],
  'models.executor': ['haiku', 'sonnet', 'inherit'],
  'models.verifier': ['haiku', 'sonnet', 'inherit']
};

/**
 * Score similarity between two strings using character overlap.
 * Returns a value between 0 and 1 (higher = more similar).
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function scoreSlug(a, b) {
  if (!a || !b) return 0;
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  // Count shared characters (by frequency)
  const freqA = {};
  for (const ch of lowerA) freqA[ch] = (freqA[ch] || 0) + 1;
  let shared = 0;
  const freqB = {};
  for (const ch of lowerB) freqB[ch] = (freqB[ch] || 0) + 1;
  for (const ch of Object.keys(freqA)) {
    if (freqB[ch]) shared += Math.min(freqA[ch], freqB[ch]);
  }
  // Also boost score when one string contains the other as substring
  let substringBonus = 0;
  if (lowerB.includes(lowerA) || lowerA.includes(lowerB)) substringBonus = 0.2;
  const score = shared / Math.max(lowerA.length, lowerB.length) + substringBonus;
  return Math.min(score, 1);
}

/**
 * Generate alternatives for a phase-not-found error.
 *
 * @param {string} slug - The unknown phase slug
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ error_type: string, slug: string, available: string[], suggestions: string[] }}
 */
function phaseAlternatives(slug, planningDir) {
  const phasesDir = path.join(planningDir, 'phases');
  let available = [];

  try {
    if (fs.existsSync(phasesDir)) {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      available = entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
    }
  } catch (_e) {
    available = [];
  }

  let suggestions = [];
  if (slug && slug.length > 0 && available.length > 0) {
    const scored = available
      .map(name => ({ name, score: scoreSlug(slug, name) }))
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.name);
    suggestions = scored;
  }

  return {
    error_type: 'phase-not-found',
    slug,
    available,
    suggestions
  };
}

/**
 * Generate alternatives for a missing-prerequisite error.
 *
 * @param {string} phase - The phase slug to check
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ error_type: string, phase: string, existing_summaries: string[], missing_summaries: string[], suggested_action: string }}
 */
function prerequisiteAlternatives(phase, planningDir) {
  const phasesDir = path.join(planningDir, 'phases');

  // Find the phase directory (exact match or prefix match)
  let phaseDir = null;
  try {
    if (fs.existsSync(phasesDir)) {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const match = entries.find(e => e.isDirectory() && (e.name === phase || e.name.endsWith('-' + phase) || e.name === phase));
      if (match) {
        phaseDir = path.join(phasesDir, match.name);
      } else {
        // Try exact slug match
        const exact = path.join(phasesDir, phase);
        if (fs.existsSync(exact)) phaseDir = exact;
      }
    }
  } catch (_e) { /* best effort */ }

  const existing_summaries = [];
  const missing_summaries = [];

  if (phaseDir && fs.existsSync(phaseDir)) {
    try {
      const files = fs.readdirSync(phaseDir);
      const planFiles = files.filter(f => /^PLAN-\d+\.md$/i.test(f) || /^\d+-\d+-PLAN\.md$/i.test(f));

      for (const planFile of planFiles) {
        const match = planFile.match(/^PLAN-(\d+)\.md$/i) || planFile.match(/^\d+-(\d+)-PLAN\.md$/i);
        if (!match) continue;
        const planNum = match[1];

        const summaryFiles = files.filter(f => {
          const sm = f.match(/^SUMMARY[-.](.*?)\.md$/i);
          if (!sm) return false;
          return sm[1].endsWith('-' + planNum) || sm[1] === planNum;
        });

        if (summaryFiles.length > 0) {
          existing_summaries.push(summaryFiles[0]);
        } else {
          const dirMatch = (phaseDir.split(path.sep).pop() || '').match(/^(\d+)-/);
          const phaseNum = dirMatch ? dirMatch[1] : '';
          const expectedId = phaseNum ? `${phaseNum}-${planNum}` : planNum;
          missing_summaries.push(`SUMMARY-${expectedId}.md`);
        }
      }
    } catch (_e) { /* best effort */ }
  }

  return {
    error_type: 'missing-prereq',
    phase,
    existing_summaries,
    missing_summaries,
    suggested_action: `Run /pbr:execute-phase ${phase} to generate missing summaries`
  };
}

/**
 * Generate alternatives for a config-invalid error.
 *
 * @param {string} field - The config field name
 * @param {string} value - The current invalid value
 * @param {string} _planningDir - Path to .planning directory (unused, for API consistency)
 * @returns {{ error_type: string, field: string, current_value: string, valid_values: Array, suggested_fix: string }}
 */
function configAlternatives(field, value, _planningDir) {
  const knownValues = KNOWN_CONFIG_FIELDS[field];

  if (knownValues !== undefined) {
    const validStrings = knownValues
      .filter(v => typeof v === 'string')
      .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
    return {
      error_type: 'config-invalid',
      field,
      current_value: value,
      valid_values: validStrings.length > 0 ? validStrings : knownValues.filter(v => typeof v !== 'boolean'),
      suggested_fix: `Set ${field} to one of: ${validStrings.join(', ')}`
    };
  }

  return {
    error_type: 'config-invalid',
    field,
    current_value: value,
    valid_values: [],
    suggested_fix: 'Remove this field from config.json or check spelling'
  };
}

module.exports = { phaseAlternatives, prerequisiteAlternatives, configAlternatives };
