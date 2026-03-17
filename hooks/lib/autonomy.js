'use strict';

/**
 * lib/autonomy.js — Progressive autonomy level resolver.
 *
 * Maps autonomy levels to concrete behavior flags that skills and agents
 * use to decide approval gates, UAT skipping, and retry behavior.
 *
 * Levels:
 *   supervised    — Human approves all actions
 *   guided        — AI acts, human reviews asynchronously
 *   collaborative — AI handles routine, escalates novel
 *   adaptive      — AI adjusts own level per task confidence
 */

/** All valid autonomy levels. */
const AUTONOMY_LEVELS = ['supervised', 'guided', 'collaborative', 'adaptive'];

/** Confidence thresholds for adaptive mode. */
const ADAPTIVE_THRESHOLDS = {
  HIGH: 0.90,
  LOW: 0.70
};

/** Behavior preset for each static level. */
const LEVEL_BEHAVIORS = {
  supervised: {
    requiresApproval: true,
    skipUAT: false,
    autoRetry: false
  },
  guided: {
    requiresApproval: false,
    skipUAT: true,
    autoRetry: false
  },
  collaborative: {
    requiresApproval: false,
    skipUAT: true,
    autoRetry: true
  }
};

/**
 * Resolve the autonomy behavior for a given level and task confidence.
 *
 * @param {string} [level] - Autonomy level (supervised/guided/collaborative/adaptive). Defaults to supervised.
 * @param {number} [taskConfidence=0.5] - Task confidence score 0-1 (used by adaptive mode).
 * @returns {{ requiresApproval: boolean, skipUAT: boolean, autoRetry: boolean, effectiveLevel: string }}
 */
function resolveAutonomyBehavior(level, taskConfidence) {
  const confidence = typeof taskConfidence === 'number' ? taskConfidence : 0.5;

  // Adaptive: route based on confidence
  if (level === 'adaptive') {
    let effectiveLevel;
    if (confidence > ADAPTIVE_THRESHOLDS.HIGH) {
      effectiveLevel = 'collaborative';
    } else if (confidence < ADAPTIVE_THRESHOLDS.LOW) {
      effectiveLevel = 'supervised';
    } else {
      effectiveLevel = 'guided';
    }
    return {
      ...LEVEL_BEHAVIORS[effectiveLevel],
      effectiveLevel
    };
  }

  // Static levels (supervised, guided, collaborative)
  const behavior = LEVEL_BEHAVIORS[level];
  if (behavior) {
    return {
      ...behavior,
      effectiveLevel: level
    };
  }

  // Unknown or undefined level — default to supervised
  return {
    ...LEVEL_BEHAVIORS.supervised,
    effectiveLevel: 'supervised'
  };
}

module.exports = {
  resolveAutonomyBehavior,
  AUTONOMY_LEVELS,
  ADAPTIVE_THRESHOLDS,
  LEVEL_BEHAVIORS
};
