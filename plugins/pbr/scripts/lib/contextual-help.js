'use strict';

/**
 * lib/contextual-help.cjs — Activity-aware contextual help suggestions.
 *
 * Reads STATE.md status and recent hook logs to produce workflow-relevant
 * suggestions for the current development activity.
 *
 * Provides:
 *   getContextualHelp(planningDir, config) — suggestions based on current state
 */

const fs = require('fs');
const path = require('path');

// ─── Help templates ────────────────────────────────────────────────────────────

const HELP_TEMPLATES = {
  planning: [
    'Use /pbr:plan-phase to start or refine the plan for the current phase.',
    'Check .planning/ROADMAP.md to confirm phase dependencies before planning.',
    'Use /pbr:discuss to talk through design decisions before committing to a plan.',
    'Ensure PLAN.md tasks have clear <files>, <action>, and <verify> elements.',
    'Run `pbr-tools validate health` to confirm .planning/ integrity before building.',
  ],
  building: [
    'Follow TDD: write failing tests first (RED), then implement (GREEN), then clean up (REFACTOR).',
    'Use atomic commits — one task per commit with `feat/fix/test({scope}): description` format.',
    'After each task, run the <verify> command from the plan to confirm correctness.',
    'Use /pbr:do for small inline tasks, /pbr:build for full phase execution.',
    'Check STATE.md blockers field if the build appears stuck.',
  ],
  executing: [
    'Follow TDD: write failing tests first (RED), then implement (GREEN), then clean up (REFACTOR).',
    'Use atomic commits — one task per commit with `feat/fix/test({scope}): description` format.',
    'After each task, run the <verify> command from the plan to confirm correctness.',
    'Check STATE.md blockers field if the build appears stuck.',
    'Run `pbr-tools validate health` periodically to detect drift.',
  ],
  verifying: [
    'Use /pbr:review to run the verifier agent on a completed plan.',
    'Check must_haves in PLAN.md frontmatter — all must be DONE in SUMMARY.md.',
    'Run `pbr-tools verify plan-structure <plan-file>` for structural validation.',
    'Check key_links: each link should be verifiable with grep commands.',
    'Review VERIFICATION.md if present for prior verifier findings.',
  ],
  blocked: [
    'Use /pbr:debug to diagnose failing tests or broken builds.',
    'Check STATE.md blockers array for the root cause.',
    'Run `pbr-tools validate health` to identify .planning/ integrity issues.',
    'Check .planning/logs/hooks.jsonl for recent hook errors.',
    'Consider /pbr:discuss to think through the blocker before coding.',
  ],
  default: [
    'Use /pbr:status to get a current project overview.',
    'Run `pbr-tools validate health` to check .planning/ integrity.',
    'Use /pbr:plan-phase to plan the next phase.',
    'Use /pbr:build to execute the current phase.',
    'Run `pbr-tools suggest-next` for a routing recommendation.',
  ],
  blocker_extra: [
    'A blocker is preventing progress. Use /pbr:debug for diagnosis.',
    'Check .planning/logs/hooks.jsonl for error patterns.',
    'Consider reaching a CHECKPOINT if the blocker requires architectural decision.',
  ],
  error_extra: [
    'Recent hook errors detected in logs. Check .planning/logs/hooks.jsonl for details.',
    'Hook errors often indicate plan format issues or missing required fields.',
    'Run `pbr-tools validate health` to check for common issues.',
  ],
};

// ─── STATE.md parser ─────────────────────────────────────────────────────────

/**
 * Extract status and blockers from STATE.md frontmatter.
 * Returns a minimal object — does not use the heavy stateLoad function.
 *
 * @param {string} statePath - Path to STATE.md
 * @returns {{ status: string, blockers: string[] }}
 */
function parseStateFrontmatter(statePath) {
  const defaults = { status: 'unknown', blockers: [] };
  try {
    if (!fs.existsSync(statePath)) return defaults;
    const content = fs.readFileSync(statePath, 'utf8');
    // Extract frontmatter between --- delimiters
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return defaults;
    const fm = fmMatch[1];

    // Parse status
    const statusMatch = fm.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
    const status = statusMatch ? statusMatch[1].trim() : 'unknown';

    // Parse blockers array
    const blockers = [];
    const blockersMatch = fm.match(/^blockers:\s*\[(.*?)\]/ms);
    if (blockersMatch) {
      // Inline array format: blockers: ["item1", "item2"]
      const items = blockersMatch[1].match(/"([^"]+)"/g) || [];
      blockers.push(...items.map(i => i.replace(/"/g, '')));
    } else {
      // Multi-line array format
      const blockersSection = fm.match(/^blockers:\s*\r?\n((?:\s+- .*\r?\n?)*)/m);
      if (blockersSection) {
        const lines = blockersSection[1].split(/\r?\n/);
        for (const line of lines) {
          const item = line.match(/^\s+- ["']?(.+?)["']?\s*$/);
          if (item) blockers.push(item[1]);
        }
      }
    }

    return { status, blockers };
  } catch (_e) {
    return defaults;
  }
}

// ─── Recent hook errors ───────────────────────────────────────────────────────

/**
 * Check if recent hook log entries contain errors.
 * Reads the last 20 lines of hooks.jsonl.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {boolean} True if error-level entries found
 */
function hasRecentHookErrors(planningDir) {
  const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
  try {
    if (!fs.existsSync(logPath)) return false;
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const recent = lines.slice(-20);
    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        if (entry.level === 'error' || entry.type === 'error') return true;
      } catch (_e) {
        // skip malformed lines
      }
    }
    return false;
  } catch (_e) {
    return false;
  }
}

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Get contextual help suggestions based on current STATE.md status and logs.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object|null} config  - Parsed config object
 * @returns {{ enabled: boolean, activity: string, suggestions: string[], blockers: string[] }}
 */
function getContextualHelp(planningDir, config) {
  const features = (config && config.features) || {};

  // Check feature toggle (default: enabled)
  if (features.contextual_help === false) {
    return { enabled: false, suggestions: [] };
  }

  const statePath = path.join(planningDir, 'STATE.md');
  const { status, blockers } = parseStateFrontmatter(statePath);

  // Select suggestions based on status
  const statusKey = status.toLowerCase();
  const baseSuggestions = HELP_TEMPLATES[statusKey] || HELP_TEMPLATES.default;
  const suggestions = [...baseSuggestions];

  // Prepend blocker-specific suggestions if blockers exist
  if (blockers.length > 0) {
    suggestions.unshift(...HELP_TEMPLATES.blocker_extra);
  }

  // Append error-context suggestions if recent hook errors found
  if (hasRecentHookErrors(planningDir)) {
    suggestions.push(...HELP_TEMPLATES.error_extra);
  }

  // Log audit evidence
  try {
    const { logAuditEvidence } = require('./progress-visualization');
    logAuditEvidence(planningDir, 'contextual_help', 'ok');
  } catch (_e) {
    // Non-fatal
  }

  return {
    enabled: true,
    activity: status,
    suggestions,
    blockers,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getContextualHelp,
  HELP_TEMPLATES,
};
