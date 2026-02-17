#!/usr/bin/env node

/**
 * SubagentStop event handler for auto-verification triggering.
 *
 * Detects executor agent completion and conditionally queues verification
 * by writing a .auto-verify signal file. Respects depth profile and
 * config.features.goal_verification setting.
 *
 * Non-blocking — exits 0 always.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
// configLoad not used here to avoid mtime-based cache issues across directories.
// Config is read directly in shouldAutoVerify().

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
 * Check if the stdin data represents an executor agent completion.
 * @param {object} data - Parsed stdin JSON from SubagentStop event
 * @returns {boolean}
 */
function isExecutorAgent(data) {
  const agentType = data.agent_type || data.subagent_type || null;
  return agentType === 'dev:towline-executor';
}

/**
 * Determine whether auto-verification should run based on config.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function shouldAutoVerify(planningDir) {
  // Read config directly instead of using configLoad to avoid mtime-based
  // cache issues when called repeatedly with different planning directories.
  const configPath = path.join(planningDir, 'config.json');
  let config;
  try {
    if (!fs.existsSync(configPath)) return false;
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_e) {
    return false;
  }
  if (config === null) return false;

  // Check explicit goal_verification toggle
  if (config.features && config.features.goal_verification === false) return false;

  // Check depth profile
  const depth = (config.depth || 'standard').toLowerCase();
  if (depth === 'quick') return false;

  // "standard", "comprehensive", and any other depth default to true
  return true;
}

/**
 * Parse current phase info from STATE.md.
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ phase: number, total: number, status: string } | null}
 */
function getPhaseFromState(planningDir) {
  const statePath = path.join(planningDir, 'STATE.md');
  try {
    if (!fs.existsSync(statePath)) return null;
    const content = fs.readFileSync(statePath, 'utf8');

    const phaseMatch = content.match(/Phase:\s*(\d+)\s+of\s+(\d+)/);
    if (!phaseMatch) return null;

    const statusMatch = content.match(/\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?(\w+)["']?/i);
    const status = statusMatch ? statusMatch[1] : null;

    return {
      phase: parseInt(phaseMatch[1], 10),
      total: parseInt(phaseMatch[2], 10),
      status: status
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Write signal file for orchestrator to pick up and spawn verifier.
 * @param {string} planningDir - Path to .planning directory
 * @param {number} phaseNumber - Current phase number
 */
function writeAutoVerifySignal(planningDir, phaseNumber) {
  const signalPath = path.join(planningDir, '.auto-verify');
  const payload = {
    phase: phaseNumber,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(signalPath, JSON.stringify(payload, null, 2), 'utf8');
}

function main() {
  const data = readStdin();

  // Only handle executor agent completions
  if (!isExecutorAgent(data)) {
    process.exit(0);
  }

  const agentType = data.agent_type || data.subagent_type;

  logHook('event-handler', 'SubagentStop', 'executor-complete', { agent_type: agentType });
  logEvent('workflow', 'executor-complete', { agent_type: agentType });

  const planningDir = path.join(process.cwd(), '.planning');
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  if (!shouldAutoVerify(planningDir)) {
    logHook('event-handler', 'SubagentStop', 'skip-verify', { reason: 'config/depth' });
    process.exit(0);
  }

  const stateInfo = getPhaseFromState(planningDir);
  if (!stateInfo || stateInfo.status !== 'building') {
    logHook('event-handler', 'SubagentStop', 'skip-verify', {
      reason: stateInfo ? `status=${stateInfo.status}` : 'no-state'
    });
    process.exit(0);
  }

  writeAutoVerifySignal(planningDir, stateInfo.phase);

  const output = {
    message: `Executor complete. Auto-verification queued for Phase ${stateInfo.phase}.`
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

module.exports = { isExecutorAgent, shouldAutoVerify, getPhaseFromState };
if (require.main === module) { main(); }
