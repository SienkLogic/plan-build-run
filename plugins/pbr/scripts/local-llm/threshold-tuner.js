'use strict';

const fs = require('fs');
const path = require('path');

// --- Constants ---

/** Minimum shadow log entries per operation before suggesting an adjustment */
const MIN_SAMPLES = 20;

/** Step size for each threshold adjustment */
const ADJUST_STEP = 0.05;

/** Clamp floor for suggested threshold */
const THRESHOLD_MIN = 0.5;

/** Clamp ceiling for suggested threshold */
const THRESHOLD_MAX = 0.99;

/**
 * Failure rate above which local LLM is considered too unreliable.
 * Suggests raising the confidence_threshold so fewer calls are routed locally.
 */
const HIGH_FAILURE_RATE = 0.20;

/**
 * Failure rate below which local LLM is considered very reliable.
 * Suggests lowering the confidence_threshold so more calls are routed locally.
 */
const LOW_FAILURE_RATE = 0.05;

/**
 * Reads the shadow agreement log and returns advisory threshold adjustments
 * per operation type.
 *
 * Only emits a suggestion for an operation when it has >= MIN_SAMPLES entries.
 * All suggestions are ±ADJUST_STEP clamped to [THRESHOLD_MIN, THRESHOLD_MAX].
 * Never writes to config — purely advisory.
 *
 * @param {string} planningDir - Absolute path to the .planning directory
 * @param {number} currentThreshold - Current confidence_threshold from config
 * @returns {Array<{operation: string, current: number, suggested: number, sample_count: number, agreement_rate: number}>}
 */
function computeThresholdAdjustments(planningDir, currentThreshold) {
  try {
    const shadowLogPath = path.join(planningDir, 'logs', 'local-llm-shadow.jsonl');

    if (!fs.existsSync(shadowLogPath)) {
      return [];
    }

    const raw = fs.readFileSync(shadowLogPath, 'utf8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);

    // Parse lines, skip unparseable
    const entries = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') {
          entries.push(parsed);
        }
      } catch (_e) {
        // Skip malformed lines
      }
    }

    // Group by operation
    const groups = {};
    for (const entry of entries) {
      const op = entry.operation;
      if (!op) continue;
      if (!groups[op]) {
        groups[op] = { count: 0, agrees: 0 };
      }
      groups[op].count += 1;
      if (entry.agrees === true) {
        groups[op].agrees += 1;
      }
    }

    // Build suggestions for operations with enough samples
    const suggestions = [];
    for (const [operation, stats] of Object.entries(groups)) {
      if (stats.count < MIN_SAMPLES) continue;

      const agreementRate = stats.agrees / stats.count;
      const failureRate = 1 - agreementRate;

      let suggested;
      if (failureRate > HIGH_FAILURE_RATE) {
        // Local is too unreliable — raise threshold (fewer local calls)
        suggested = Math.min(THRESHOLD_MAX, currentThreshold + ADJUST_STEP);
      } else if (failureRate < LOW_FAILURE_RATE) {
        // Local is very reliable — lower threshold (more local calls)
        suggested = Math.max(THRESHOLD_MIN, currentThreshold - ADJUST_STEP);
      } else {
        // Within acceptable range — no change
        suggested = currentThreshold;
      }

      suggestions.push({
        operation,
        current: currentThreshold,
        suggested,
        sample_count: stats.count,
        agreement_rate: agreementRate
      });
    }

    return suggestions;
  } catch (_e) {
    // Never throws
    return [];
  }
}

module.exports = { computeThresholdAdjustments };
