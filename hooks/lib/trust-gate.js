/**
 * lib/trust-gate.js — Trust-gated verification depth selector.
 *
 * Reads agent trust scores from .planning/trust/scores.json and returns
 * the appropriate verification depth (light/standard/thorough) based on
 * historical pass rates.
 *
 * Thresholds:
 *   > 90% pass rate  -> "light"   (skip deep verification)
 *   >= 70% pass rate -> "standard" (normal verification)
 *   < 70% pass rate  -> "thorough" (extra scrutiny)
 *
 * Safe defaults: returns "standard" when no trust data exists,
 * data is malformed, or the feature is disabled.
 */

const fs = require('fs');
const path = require('path');

/** Pass rate above which verification is light (trusted agents). */
const LIGHT_THRESHOLD = 0.90;

/** Pass rate below which verification is thorough (untrusted agents). */
const THOROUGH_THRESHOLD = 0.70;

/**
 * Resolve the verification depth based on trust scores and config.
 *
 * @param {string} planningDir - Path to the .planning directory
 * @param {object} config - Config object with features.graduated_verification toggle
 * @returns {"light"|"standard"|"thorough"} Verification depth
 */
function resolveVerificationDepth(planningDir, config) {
  // Feature gate: if graduated_verification is disabled, always return standard
  if (!config || !config.features || !config.features.graduated_verification) {
    return 'standard';
  }

  // Read trust scores
  const scoresPath = path.join(planningDir, 'trust', 'scores.json');
  let scores;
  try {
    if (!fs.existsSync(scoresPath)) {
      return 'standard';
    }
    scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
  } catch (_e) {
    // Malformed JSON or read error — safe default
    return 'standard';
  }

  // Extract overall pass rate
  let passRate;
  if (typeof scores.overall_pass_rate === 'number') {
    passRate = scores.overall_pass_rate;
  } else if (scores.agents && typeof scores.agents === 'object') {
    // Compute average from individual agent pass rates
    const agents = Object.values(scores.agents);
    const rates = agents
      .map(a => a && typeof a.pass_rate === 'number' ? a.pass_rate : null)
      .filter(r => r !== null);
    if (rates.length === 0) {
      return 'standard';
    }
    passRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  } else {
    return 'standard';
  }

  // Apply thresholds
  if (passRate > LIGHT_THRESHOLD) {
    return 'light';
  }
  if (passRate < THOROUGH_THRESHOLD) {
    return 'thorough';
  }
  return 'standard';
}

module.exports = {
  resolveVerificationDepth,
  LIGHT_THRESHOLD,
  THOROUGH_THRESHOLD
};
