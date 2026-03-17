/**
 * Risk classifier — categorizes task descriptions into low/medium/high risk
 * with corresponding ceremony level recommendations.
 *
 * Pure function: no side effects, no file I/O. Consumable by /pbr:do and prompt-routing hook.
 */

'use strict';

const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

const CEREMONY_MAP = {
  low: 'inline',
  medium: 'lightweight-plan',
  high: 'full-plan-build-verify'
};

const HIGH_SIGNALS = [
  'migrate', 'redesign', 'refactor across', 'refactor', 'architecture',
  'security', 'database schema', 'database', 'breaking change',
  'entire', 'across'
];

const MEDIUM_SIGNALS = [
  'implement', 'create', 'integrate', 'add feature',
  'new endpoint', 'write test', 'add', 'endpoint', 'api'
];

const LOW_SIGNALS = [
  'typo', 'rename', 'config', 'update', 'fix typo',
  'comment', 'readme', 'docs'
];

/**
 * Match text against signal patterns and return score adjustment + signal descriptions.
 * @param {string} text - Lowercase normalized input
 * @param {string[]} patterns - Signal patterns to match
 * @param {number} weight - Score per match
 * @returns {{ score: number, signals: string[] }}
 */
function matchSignals(text, patterns, weight) {
  let score = 0;
  const signals = [];
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      score += weight;
      signals.push(pattern);
    }
  }
  return { score, signals };
}

/**
 * Classify risk level for a task description.
 *
 * @param {string} text - Task description
 * @param {object} [context={}] - Optional context signals
 * @param {number} [context.fileCount] - Number of files affected
 * @param {number} [context.subsystems] - Number of subsystems involved
 * @param {boolean} [context.hasTests] - Whether existing tests exist
 * @returns {{ risk: string, ceremony: string, signals: string[] }}
 */
function classifyRisk(text, context) {
  if (context === undefined) context = {};
  const normalized = text.toLowerCase();

  let score = 0;
  const signals = [];

  // Keyword scoring
  const high = matchSignals(normalized, HIGH_SIGNALS, 3);
  score += high.score;
  signals.push(...high.signals.map(s => 'high-signal: ' + s));

  const medium = matchSignals(normalized, MEDIUM_SIGNALS, 1);
  score += medium.score;
  signals.push(...medium.signals.map(s => 'medium-signal: ' + s));

  const low = matchSignals(normalized, LOW_SIGNALS, -1);
  score += low.score;
  signals.push(...low.signals.map(s => 'low-signal: ' + s));

  // Context scoring
  if (context.fileCount >= 8) {
    score += 3;
    signals.push('8+ files affected');
  } else if (context.fileCount >= 3) {
    score += 1;
    signals.push('3+ files affected');
  }

  if (context.subsystems >= 3) {
    score += 5;
    signals.push('3+ subsystems');
  }

  if (context.hasTests === false) {
    score += 1;
    signals.push('no existing tests');
  }

  // Threshold mapping
  let risk;
  if (score >= 4) {
    risk = RISK_LEVELS.HIGH;
  } else if (score >= 1) {
    risk = RISK_LEVELS.MEDIUM;
  } else {
    risk = RISK_LEVELS.LOW;
  }

  return {
    risk,
    ceremony: CEREMONY_MAP[risk],
    signals
  };
}

module.exports = { classifyRisk, CEREMONY_MAP, RISK_LEVELS };
