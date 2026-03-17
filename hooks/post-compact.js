#!/usr/bin/env node

/**
 * PostCompact hook: Restores context after lossy compaction.
 *
 * After Claude Code compacts conversation context, this hook:
 * - Re-injects STATE.md summary + active phase context via additionalContext
 * - Resets context budget tracker counter (.context-tracker)
 * - Resets context ledger (.context-ledger.json) via resetLedger()
 * - Logs the compaction event to hooks.jsonl and events.jsonl
 *
 * Complementary to context-budget-check.js (PreCompact) which saves state
 * before compaction. This hook restores it after.
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { stateLoad } = require('../plan-build-run/bin/lib/state.cjs');
const { resetLedger } = require('./track-context-budget');

/**
 * Build a concise context string from STATE.md for post-compaction recovery.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {string} Context string or empty string if STATE.md missing
 */
function buildPostCompactContext(planningDir) {
  const stateFile = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(stateFile)) return '';

  const fullState = stateLoad(planningDir);
  const state = (fullState && fullState.state) || {};

  const phase = state.current_phase || 'unknown';
  const phaseName = state.phase_name || '';
  const status = state.status || 'unknown';

  const parts = [
    '[Post-Compaction Context Recovery]',
    `Phase: ${phase}${phaseName ? ' (' + phaseName + ')' : ''}`,
    `Status: ${status}`,
    '[PBR WORKFLOW REQUIRED — Route all work through PBR commands]\n- Fix a bug or small task → /pbr:quick\n- Plan a feature → /pbr:plan-phase N\n- Build from a plan → /pbr:execute-phase N\n- Explore or research → /pbr:explore\n- Freeform request → /pbr:do\n- Do NOT write source code or spawn generic agents without an active PBR skill.\n- Use PBR agents (pbr:researcher, pbr:executor, etc.) not Explore/general-purpose.',
    'Read .planning/STATE.md for full context.'
  ];

  return parts.join('\n');
}

/**
 * Reset context budget tracker files after compaction.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ trackerReset: boolean, ledgerReset: boolean }}
 */
function resetBudgetTracker(planningDir) {
  const result = { trackerReset: false, ledgerReset: false };

  // Delete .context-tracker file (best-effort)
  try {
    const trackerPath = path.join(planningDir, '.context-tracker');
    fs.unlinkSync(trackerPath);
    result.trackerReset = true;
  } catch (_e) {
    // File may not exist — that's fine
  }

  // Delete .context-ledger.json via resetLedger
  try {
    resetLedger(planningDir);
    result.ledgerReset = true;
  } catch (_e) {
    // Best-effort
  }

  return result;
}

/**
 * Main entry point for command-line execution.
 */
function main() {
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  // Not a PBR project — exit silently
  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  const context = buildPostCompactContext(planningDir);
  const resetResult = resetBudgetTracker(planningDir);

  logHook('post-compact', 'PostCompact', 'restored', { ...resetResult });
  logEvent('workflow', 'post-compact', { timestamp: new Date().toISOString() });

  if (context) {
    process.stdout.write(JSON.stringify({ additionalContext: context }));
  }

  process.exit(0);
}

/**
 * HTTP handler for hook-server.js interface.
 * reqBody = { event, tool, data, planningDir, cache }
 * Returns { additionalContext: "..." } or null. Never calls process.exit().
 */
function handleHttp(reqBody) {
  const planningDir = reqBody && reqBody.planningDir;
  if (!planningDir) return null;

  const stateFile = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(stateFile)) return null;

  const context = buildPostCompactContext(planningDir);
  const resetResult = resetBudgetTracker(planningDir);

  logHook('post-compact', 'PostCompact', 'restored', { ...resetResult });
  logEvent('workflow', 'post-compact', { timestamp: new Date().toISOString() });

  if (context) {
    return { additionalContext: context };
  }

  return null;
}

module.exports = { buildPostCompactContext, resetBudgetTracker, handleHttp };
if (require.main === module || process.argv[1] === __filename) { main(); }
