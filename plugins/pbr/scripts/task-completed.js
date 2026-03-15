#!/usr/bin/env node

/**
 * TaskCompleted hook: Logs agent task completion with output summary.
 *
 * Fires when a Task() sub-agent finishes (distinct from SubagentStop).
 * Logs the completion event and agent type for workflow tracking.
 * Returns continue:false if a verifier finds critical gaps or an executor
 * produces no SUMMARY.md — preventing the orchestrator from silently moving on.
 *
 * Non-blocking — exits 0 always.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

/**
 * Read current_phase from STATE.md frontmatter.
 * Lightweight — avoids heavy stateLoad() which parses roadmap/config too.
 */
function readCurrentPhase(planningDir) {
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    if (!fs.existsSync(statePath)) return null;
    const content = fs.readFileSync(statePath, 'utf8');
    const match = content.match(/^current_phase:\s*(\d+)/m);
    return match ? match[1] : null;
  } catch (_e) {
    return null;
  }
}

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

/**
 * Check whether a halt signal should be emitted after a PBR agent completes.
 * Returns null (no halt) or { continue: false, stopReason: "..." }.
 *
 * @param {object} data - parsed stdin JSON from the TaskCompleted event
 * @param {string} planningDir - absolute path to the .planning directory
 * @returns {{ continue: false, stopReason: string }|null}
 */
function checkHaltConditions(data, planningDir) {
  const agentType = data.agent_type || data.subagent_type || null;
  if (!agentType) return null;

  // --- Verifier: halt if VERIFICATION.md reports gaps_found or failed ---
  if (agentType === 'pbr:verifier') {
    try {
      const rawPhase = readCurrentPhase(planningDir);
      const phaseNum = rawPhase ? String(rawPhase).padStart(2, '0') : null;
      if (phaseNum) {
        const phasesDir = path.join(planningDir, 'phases');
        const candidates = fs.readdirSync(phasesDir).filter(d => d.startsWith(phaseNum + '-'));
        const target = candidates.length > 0 ? path.join(phasesDir, candidates[0], 'VERIFICATION.md') : null;
        if (target && fs.existsSync(target)) {
          const content = fs.readFileSync(target, 'utf8');
          const statusMatch = content.match(/^status:\s*(.+)$/m);
          const status = statusMatch ? statusMatch[1].trim() : null;
          if (status === 'gaps_found' || status === 'failed') {
            return {
              continue: false,
              stopReason: `Verifier found critical gaps in Phase ${phaseNum} (status: ${status}). Run /pbr:verify-work to address gaps before continuing.`
            };
          }
        }
      }
    } catch (_e) { /* non-fatal — fall through to normal exit */ }
  }

  // --- Executor: halt if SUMMARY.md is missing from current phase dir ---
  if (agentType === 'pbr:executor') {
    try {
      const rawPhase = readCurrentPhase(planningDir);
      const phaseNum = rawPhase ? String(rawPhase).padStart(2, '0') : null;
      if (phaseNum) {
        const phasesDir = path.join(planningDir, 'phases');
        const candidates = fs.readdirSync(phasesDir).filter(d => d.startsWith(phaseNum + '-'));
        const target = candidates.length > 0 ? path.join(phasesDir, candidates[0], 'SUMMARY.md') : null;
        if (target && !fs.existsSync(target)) {
          return {
            continue: false,
            stopReason: `Executor completed Phase ${phaseNum} but produced no SUMMARY.md. Review executor output and re-run /pbr:execute-phase.`
          };
        }
      }
    } catch (_e) { /* non-fatal */ }
  }

  return null;
}

function main() {
  const data = readStdin();
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  logHook('task-completed', 'TaskCompleted', 'completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    duration_ms: data.duration_ms || null
  });

  logEvent('agent', 'task-completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    duration_ms: data.duration_ms || null
  });

  if (fs.existsSync(planningDir)) {
    const halt = checkHaltConditions(data, planningDir);
    if (halt) {
      logHook('task-completed', 'TaskCompleted', 'halting', halt);
      process.stdout.write(JSON.stringify(halt));
      process.exit(0);
    }
  }

  process.exit(0);
}

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, ... }.
 * Must NOT call process.exit().
 * @param {{ data: object, planningDir: string }} reqBody
 * @returns {{ continue: false, stopReason: string }|null}
 */
function handleHttp(reqBody) {
  const data = reqBody.data || {};
  const planningDir = reqBody.planningDir;

  logHook('task-completed', 'TaskCompleted', 'completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    duration_ms: data.duration_ms || null
  });

  logEvent('agent', 'task-completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    duration_ms: data.duration_ms || null
  });

  if (planningDir && fs.existsSync(planningDir)) {
    const halt = checkHaltConditions(data, planningDir);
    if (halt) {
      logHook('task-completed', 'TaskCompleted', 'halting', halt);
      return halt;
    }
  }

  return null;
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main, checkHaltConditions, readCurrentPhase, handleHttp };
