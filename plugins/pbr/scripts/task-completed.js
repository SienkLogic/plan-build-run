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
const { performance } = require('perf_hooks');

/**
 * Read current_phase from STATE.md frontmatter.
 * Lightweight — avoids heavy stateLoad() which parses roadmap/config too.
 * Uses direct readFileSync (no existsSync) to avoid double stat.
 */
function readCurrentPhase(planningDir) {
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    const content = fs.readFileSync(statePath, 'utf8');
    const match = content.match(/^current_phase:\s*(\d+)/m);
    return match ? match[1] : null;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logHook('task-completed', 'TaskCompleted', 'state-read-error', { error: e.message });
    }
    return null;
  }
}

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // Intentional silence: stdin may be empty or non-JSON, this is expected
  }
  return {};
}

/**
 * Resolve the phase directory for a given phase number.
 * Caches readdirSync result for repeated calls.
 * @param {string} phasesDir - Path to the phases directory
 * @param {string} phaseNum - Zero-padded phase number (e.g., "03")
 * @returns {string|null} - Full path to the matching phase dir, or null
 */
function resolvePhaseDir(phasesDir, phaseNum) {
  try {
    const entries = fs.readdirSync(phasesDir);
    const prefix = phaseNum + '-';
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].startsWith(prefix)) {
        return path.join(phasesDir, entries[i]);
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logHook('task-completed', 'TaskCompleted', 'phases-read-error', { error: e.message });
    }
  }
  return null;
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

  // Only check for pbr:verifier and pbr:executor
  if (agentType !== 'pbr:verifier' && agentType !== 'pbr:executor') return null;

  // Read phase once for both checks
  const rawPhase = readCurrentPhase(planningDir);
  const phaseNum = rawPhase ? String(rawPhase).padStart(2, '0') : null;
  if (!phaseNum) return null;

  const phasesDir = path.join(planningDir, 'phases');
  const phaseDir = resolvePhaseDir(phasesDir, phaseNum);
  if (!phaseDir) return null;

  // --- Verifier: halt if VERIFICATION.md reports gaps_found or failed ---
  if (agentType === 'pbr:verifier') {
    try {
      const target = path.join(phaseDir, 'VERIFICATION.md');
      const content = fs.readFileSync(target, 'utf8');
      const statusMatch = content.match(/^status:\s*(.+)$/m);
      const status = statusMatch ? statusMatch[1].trim() : null;
      if (status === 'gaps_found' || status === 'failed') {
        return {
          continue: false,
          stopReason: `Verifier found critical gaps in Phase ${phaseNum} (status: ${status}). Run /pbr:verify-work to address gaps before continuing.`
        };
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        logHook('task-completed', 'TaskCompleted', 'verification-read-error', { error: e.message });
      }
    }
  }

  // --- Executor: halt if SUMMARY.md is missing from current phase dir ---
  if (agentType === 'pbr:executor') {
    const target = path.join(phaseDir, 'SUMMARY.md');
    try {
      fs.accessSync(target, fs.constants.F_OK);
    } catch (_e) {
      return {
        continue: false,
        stopReason: `Executor completed Phase ${phaseNum} but produced no SUMMARY.md. Review executor output and re-run /pbr:execute-phase.`
      };
    }
  }

  return null;
}

function main() {
  const t0 = performance.now();
  const data = readStdin();
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  logHook('task-completed', 'TaskCompleted', 'completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    agent_duration_ms: data.duration_ms || null
  });

  logEvent('agent', 'task-completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    agent_duration_ms: data.duration_ms || null
  });

  try {
    fs.accessSync(planningDir, fs.constants.F_OK);
    const halt = checkHaltConditions(data, planningDir);
    if (halt) {
      logHook('task-completed', 'TaskCompleted', 'halting', halt);
      process.stdout.write(JSON.stringify(halt));
      logHook('task-completed', 'TaskCompleted', 'hook_ms', { ms: Math.round(performance.now() - t0) });
      process.exit(0);
    }
  } catch (_e) {
    // planningDir does not exist — no halt checks needed
  }

  logHook('task-completed', 'TaskCompleted', 'hook_ms', { ms: Math.round(performance.now() - t0) });
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
  const t0 = performance.now();
  const data = reqBody.data || {};
  const planningDir = reqBody.planningDir;

  logHook('task-completed', 'TaskCompleted', 'completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    agent_duration_ms: data.duration_ms || null
  });

  logEvent('agent', 'task-completed', {
    agent_type: data.agent_type || data.subagent_type || null,
    agent_id: data.agent_id || null,
    agent_duration_ms: data.duration_ms || null
  });

  if (planningDir && fs.existsSync(planningDir)) {
    const halt = checkHaltConditions(data, planningDir);
    if (halt) {
      logHook('task-completed', 'TaskCompleted', 'halting', halt);
      logHook('task-completed', 'TaskCompleted', 'hook_ms', { ms: Math.round(performance.now() - t0) });
      return halt;
    }
  }

  logHook('task-completed', 'TaskCompleted', 'hook_ms', { ms: Math.round(performance.now() - t0) });
  return null;
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main, checkHaltConditions, readCurrentPhase, handleHttp };
