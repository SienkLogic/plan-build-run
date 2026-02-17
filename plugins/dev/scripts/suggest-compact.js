#!/usr/bin/env node

/**
 * PostToolUse hook on Write|Edit: Tracks tool call count per session
 * and suggests /compact when approaching context limits.
 *
 * Counter stored in .planning/.compact-counter (JSON).
 * Threshold configurable via config.json hooks.compactThreshold (default: 50).
 * After first suggestion, re-suggests every 25 calls.
 * Counter resets on SessionStart (via progress-tracker.js).
 *
 * Exit codes:
 *   0 = always (advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { configLoad } = require('./towline-tools');

const DEFAULT_THRESHOLD = 50;
const REMINDER_INTERVAL = 25;

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');
      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      const result = checkCompaction(planningDir, cwd);
      if (result) {
        process.stdout.write(JSON.stringify(result));
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

/**
 * Increment tool call counter and return a suggestion if threshold is reached.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {string} cwd - Current working directory (for config loading)
 * @returns {Object|null} Hook output with additionalContext, or null
 */
function checkCompaction(planningDir, cwd) {
  const counterPath = path.join(planningDir, '.compact-counter');
  const counter = loadCounter(counterPath);
  const threshold = getThreshold(cwd);

  counter.count += 1;
  saveCounter(counterPath, counter);

  if (counter.count < threshold) return null;

  const isFirstSuggestion = !counter.lastSuggested;
  const callsSinceSuggestion = counter.count - (counter.lastSuggested || 0);

  if (isFirstSuggestion || callsSinceSuggestion >= REMINDER_INTERVAL) {
    counter.lastSuggested = counter.count;
    saveCounter(counterPath, counter);

    logHook('suggest-compact', 'PostToolUse', 'suggest', {
      count: counter.count,
      threshold
    });

    return {
      additionalContext: `[Context Budget] ${counter.count} tool calls this session (threshold: ${threshold}). Consider running /compact to free context space before quality degrades.`
    };
  }

  return null;
}

function loadCounter(counterPath) {
  try {
    const content = fs.readFileSync(counterPath, 'utf8');
    const data = JSON.parse(content);
    return { count: data.count || 0, lastSuggested: data.lastSuggested || 0 };
  } catch (_e) {
    return { count: 0, lastSuggested: 0 };
  }
}

function saveCounter(counterPath, counter) {
  try {
    fs.writeFileSync(counterPath, JSON.stringify(counter), 'utf8');
  } catch (_e) {
    // Best-effort
  }
}

function getThreshold(cwd) {
  const planningDir = path.join(cwd, '.planning');
  const config = configLoad(planningDir);
  if (!config) return DEFAULT_THRESHOLD;
  return config.hooks?.compactThreshold || DEFAULT_THRESHOLD;
}

function resetCounter(planningDir) {
  const counterPath = path.join(planningDir, '.compact-counter');
  try {
    if (fs.existsSync(counterPath)) {
      fs.unlinkSync(counterPath);
    }
  } catch (_e) {
    // Best-effort
  }
}

module.exports = { checkCompaction, loadCounter, saveCounter, getThreshold, resetCounter, DEFAULT_THRESHOLD, REMINDER_INTERVAL };
if (require.main === module) { main(); }
