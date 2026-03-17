/**
 * trust-tracker.js — Per-agent pass/fail trust scoring.
 *
 * Tracks agent outcomes by type and task category, persisting scores
 * to .planning/trust/agent-scores.json. Used by confidence calibration
 * to weight deliverable confidence based on historical accuracy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TRUST_DIR = 'trust';
const TRUST_FILE = 'agent-scores.json';

const HIGH_THRESHOLD = 0.9;
const MEDIUM_THRESHOLD = 0.7;

/**
 * Load trust scores from disk.
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} Parsed scores or empty object
 */
function loadScores(planningDir) {
  const filePath = path.join(planningDir, TRUST_DIR, TRUST_FILE);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/**
 * Save trust scores to disk (creates dir if needed).
 * @param {string} planningDir - Path to .planning directory
 * @param {object} scores - Scores object to persist
 */
function saveScores(planningDir, scores) {
  const dirPath = path.join(planningDir, TRUST_DIR);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, TRUST_FILE),
    JSON.stringify(scores, null, 2),
    'utf8'
  );
}

/**
 * Record a pass or fail outcome for an agent+category.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} agentType - Agent identifier (e.g. "executor")
 * @param {string} taskCategory - Task category (e.g. "build")
 * @param {boolean} passed - Whether the outcome was a pass
 */
function recordOutcome(planningDir, agentType, taskCategory, passed) {
  const scores = loadScores(planningDir);
  if (!scores[agentType]) scores[agentType] = {};
  if (!scores[agentType][taskCategory]) {
    scores[agentType][taskCategory] = { pass: 0, fail: 0, rate: 0 };
  }
  const entry = scores[agentType][taskCategory];
  if (passed) {
    entry.pass++;
  } else {
    entry.fail++;
  }
  const total = entry.pass + entry.fail;
  entry.rate = total > 0 ? entry.pass / total : 0;
  saveScores(planningDir, scores);
}

/**
 * Get confidence data for an agent+category.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} agentType - Agent identifier
 * @param {string} taskCategory - Task category
 * @returns {{ rate: number, total: number, label: string } | null}
 */
function getConfidence(planningDir, agentType, taskCategory) {
  const scores = loadScores(planningDir);
  if (!scores[agentType] || !scores[agentType][taskCategory]) return null;
  const entry = scores[agentType][taskCategory];
  const total = entry.pass + entry.fail;
  let label;
  if (entry.rate >= HIGH_THRESHOLD) {
    label = 'high';
  } else if (entry.rate >= MEDIUM_THRESHOLD) {
    label = 'medium';
  } else {
    label = 'low';
  }
  return { rate: entry.rate, total, label };
}

/**
 * Delete the trust scores file.
 * @param {string} planningDir - Path to .planning directory
 */
function resetScores(planningDir) {
  const filePath = path.join(planningDir, TRUST_DIR, TRUST_FILE);
  try {
    fs.unlinkSync(filePath);
  } catch (_err) {
    // File doesn't exist — no-op
  }
}

module.exports = {
  loadScores,
  recordOutcome,
  getConfidence,
  resetScores,
  TRUST_DIR,
  TRUST_FILE
};
