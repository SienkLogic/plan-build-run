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
const { incrementTracker } = require('./session-tracker');
const { shouldAutoVerify, getPhaseFromState, writeAutoVerifySignal, isTrustTrackingEnabled } = require('./lib/auto-verify');
const { handleDecisionExtraction, extractDecisions } = require('./lib/decision-extraction');

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
 * Check if the stdin data represents an executor agent completion.
 * @param {object} data - Parsed stdin JSON from SubagentStop event
 * @returns {boolean}
 */
function isExecutorAgent(data) {
  const agentType = data.agent_type || data.subagent_type || null;
  return agentType === 'pbr:executor';
}

/**
 * Check if the stdin data represents a verifier agent completion.
 * @param {object} data - Parsed stdin JSON from SubagentStop event
 * @returns {boolean}
 */
function isVerifierAgent(data) {
  const agentType = data.agent_type || data.subagent_type || null;
  return agentType === 'pbr:verifier';
}

/**
 * Build verify hint from executor output for downstream context.
 * @param {string} lastMsg - last_assistant_message from agent output
 * @returns {string}
 */
function buildVerifyHint(lastMsg) {
  if (!lastMsg) return '';
  const lowerMsg = lastMsg.toLowerCase();
  if (lowerMsg.includes('error') || lowerMsg.includes('failed') || lowerMsg.includes('warning')) {
    return ' Note: executor output mentions errors/warnings — verification should pay close attention.';
  }
  return '';
}

/**
 * Core logic for handling executor completion and auto-verify queueing.
 * Shared between main() (stdin mode) and handleHttp (server mode).
 * @param {object} data - Parsed event data
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ additionalContext: string }|null}
 */
function processExecutorCompletion(data, planningDir) {
  const agentType = data.agent_type || data.subagent_type || '';

  logHook('event-handler', 'SubagentStop', 'executor-complete', { agent_type: agentType });
  logEvent('workflow', 'executor-complete', { agent_type: agentType });

  if (!planningDir || !fs.existsSync(planningDir)) return null;

  const stateInfo = getPhaseFromState(planningDir);
  if (!stateInfo || stateInfo.status !== 'building') {
    logHook('event-handler', 'SubagentStop', 'skip-verify', {
      reason: stateInfo ? `status=${stateInfo.status}` : 'no-state'
    });
    return null;
  }

  // Increment session phase counter (before auto-verify gate)
  try {
    incrementTracker(planningDir);
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'increment-tracker-error', { error: e.message });
  }

  if (!shouldAutoVerify(planningDir)) {
    logHook('event-handler', 'SubagentStop', 'skip-verify', { reason: 'config/depth' });
    return null;
  }

  writeAutoVerifySignal(planningDir, stateInfo.phase);

  const verifyHint = buildVerifyHint(data.last_assistant_message || '');
  return {
    additionalContext: `Executor complete. Auto-verification queued for Phase ${stateInfo.phase}.${verifyHint}`
  };
}

/**
 * Handle verifier agent completion — log trust-update-queued.
 * @param {object} data - Parsed event data
 * @param {string|null} planningDir - Path to .planning directory
 */
function processVerifierCompletion(data, planningDir) {
  const agentType = data.agent_type || data.subagent_type;
  logHook('event-handler', 'SubagentStop', 'verifier-complete', { agent_type: agentType });
  logEvent('workflow', 'verifier-complete', { agent_type: agentType });

  if (planningDir && fs.existsSync(planningDir) && isTrustTrackingEnabled(planningDir)) {
    logEvent(planningDir, 'trust-update-queued', { agent: 'pbr:verifier' });
  }
}

/**
 * Handle decision extraction for any agent type.
 * @param {object} data - Parsed event data
 * @param {string} planningDir - Path to .planning directory
 */
function processDecisionExtraction(data, planningDir) {
  const agentType = data.agent_type || data.subagent_type || '';
  if (!agentType || !planningDir || !fs.existsSync(planningDir)) return;

  const agentOutput = data.output || data.stdout || data.last_assistant_message || '';
  try {
    handleDecisionExtraction(planningDir, agentOutput, agentType.replace('pbr:', ''));
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'decision-extraction-error', { error: e.message });
  }
}

function main() {
  const data = readStdin();
  const planningDir = path.join(process.cwd(), '.planning');

  // Decision extraction runs for ALL agent types (not just executor)
  processDecisionExtraction(data, planningDir);

  // Handle verifier agent completions — log trust-update-queued
  if (isVerifierAgent(data)) {
    processVerifierCompletion(data, planningDir);
    process.exit(0);
  }

  // Only handle executor agent completions for auto-verify
  if (!isExecutorAgent(data)) {
    process.exit(0);
  }

  const result = processExecutorCompletion(data, planningDir);
  if (result) {
    process.stdout.write(JSON.stringify(result));
  }
  process.exit(0);
}

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, ... }.
 * Must NOT call process.exit().
 * @param {{ data: object, planningDir: string }} reqBody
 * @returns {{ additionalContext: string }|null}
 */
function handleHttp(reqBody) {
  const data = reqBody.data || {};
  const planningDir = reqBody.planningDir;

  // Decision extraction runs for ALL agent types
  processDecisionExtraction(data, planningDir);

  // Handle verifier completions — log trust-update-queued
  if (isVerifierAgent(data)) {
    processVerifierCompletion(data, planningDir);
    return null;
  }

  if (!isExecutorAgent(data)) return null;

  return processExecutorCompletion(data, planningDir);
}

module.exports = {
  isExecutorAgent,
  isVerifierAgent,
  shouldAutoVerify,
  getPhaseFromState,
  handleHttp,
  extractDecisions,
  handleDecisionExtraction,
  // New exports for internal use
  writeAutoVerifySignal,
  isTrustTrackingEnabled,
};
if (require.main === module || process.argv[1] === __filename) { main(); }
