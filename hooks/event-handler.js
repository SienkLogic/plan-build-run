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
  return agentType === 'pbr:executor';
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
  const agentType = data.agent_type || data.subagent_type || '';
  const planningDir = path.join(process.cwd(), '.planning');

  // Decision extraction runs for ALL agent types (not just executor)
  if (agentType && fs.existsSync(planningDir)) {
    const agentOutput = data.output || data.stdout || data.last_assistant_message || '';
    try {
      handleDecisionExtraction(planningDir, agentOutput, agentType.replace('pbr:', ''));
    } catch (_e) { /* non-fatal */ }
  }

  // Only handle executor agent completions for auto-verify
  if (!isExecutorAgent(data)) {
    process.exit(0);
  }

  logHook('event-handler', 'SubagentStop', 'executor-complete', { agent_type: agentType });
  logEvent('workflow', 'executor-complete', { agent_type: agentType });

  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  const stateInfo = getPhaseFromState(planningDir);
  if (!stateInfo || stateInfo.status !== 'building') {
    logHook('event-handler', 'SubagentStop', 'skip-verify', {
      reason: stateInfo ? `status=${stateInfo.status}` : 'no-state'
    });
    process.exit(0);
  }

  // Increment session phase counter (before auto-verify gate)
  try { incrementTracker(planningDir); } catch (_e) { /* non-fatal */ }

  if (!shouldAutoVerify(planningDir)) {
    logHook('event-handler', 'SubagentStop', 'skip-verify', { reason: 'config/depth' });
    process.exit(0);
  }

  writeAutoVerifySignal(planningDir, stateInfo.phase);

  // Extract last_assistant_message for verification context hints
  const lastMsg = data.last_assistant_message || '';
  let verifyHint = '';
  if (lastMsg) {
    // Look for error/failure indicators that might inform verification priority
    const lowerMsg = lastMsg.toLowerCase();
    if (lowerMsg.includes('error') || lowerMsg.includes('failed') || lowerMsg.includes('warning')) {
      verifyHint = ' Note: executor output mentions errors/warnings — verification should pay close attention.';
    }
  }

  const output = {
    additionalContext: `Executor complete. Auto-verification queued for Phase ${stateInfo.phase}.${verifyHint}`
  };
  process.stdout.write(JSON.stringify(output));
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
  const agentType = data.agent_type || data.subagent_type || '';
  const planningDir = reqBody.planningDir;

  // Decision extraction runs for ALL agent types
  if (agentType && planningDir && fs.existsSync(planningDir)) {
    const agentOutput = data.output || data.stdout || data.last_assistant_message || '';
    try {
      handleDecisionExtraction(planningDir, agentOutput, agentType.replace('pbr:', ''));
    } catch (_e) { /* non-fatal */ }
  }

  if (!isExecutorAgent(data)) return null;

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
  try { incrementTracker(planningDir); } catch (_e) { /* non-fatal */ }

  if (!shouldAutoVerify(planningDir)) {
    logHook('event-handler', 'SubagentStop', 'skip-verify', { reason: 'config/depth' });
    return null;
  }

  writeAutoVerifySignal(planningDir, stateInfo.phase);

  const lastMsg = data.last_assistant_message || '';
  let verifyHint = '';
  if (lastMsg) {
    const lowerMsg = lastMsg.toLowerCase();
    if (lowerMsg.includes('error') || lowerMsg.includes('failed') || lowerMsg.includes('warning')) {
      verifyHint = ' Note: executor output mentions errors/warnings — verification should pay close attention.';
    }
  }

  return {
    additionalContext: `Executor complete. Auto-verification queued for Phase ${stateInfo.phase}.${verifyHint}`
  };
}

// ─── Decision Extraction ─────────────────────────────────────────────────────

/**
 * Decision pattern definitions. Each entry has a regex and extraction logic.
 * Patterns are designed to minimize false positives on common prose.
 */
const DECISION_PATTERNS = [
  {
    // "Locked Decision: ..." or "DECISION: ..."
    name: 'explicit',
    regex: /(?:Locked Decision|DECISION):\s*(.+?)(?:\n|$)/gi,
    extract(match) {
      const full = match[1].trim();
      // Split on "because", "since", "due to" for rationale
      const rationaleMatch = full.match(/\b(?:because|since|due to)\s+(.+)$/i);
      const decision = rationaleMatch ? full.slice(0, rationaleMatch.index).trim() : full;
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : '';
      return { decision, rationale };
    }
  },
  {
    // "chose X over Y because Z" — requires "over" to avoid false positives
    name: 'chose-over',
    regex: /\bchose\s+(.+?)\s+over\s+(.+?)\s+(?:because|since|due to)\s+(.+?)(?:\.|$)/gi,
    extract(match) {
      const decision = `chose ${match[1].trim()} over ${match[2].trim()}`;
      const rationale = match[3].trim();
      return { decision, rationale, alternatives: [match[2].trim()] };
    }
  },
  {
    // "selected X instead of Y because Z" — requires "instead of" to avoid false positives
    name: 'selected-instead',
    regex: /\bselected\s+(.+?)\s+instead of\s+(.+?)\s+(?:because|since|due to)\s+(.+?)(?:\.|$)/gi,
    extract(match) {
      const decision = `selected ${match[1].trim()} instead of ${match[2].trim()}`;
      const rationale = match[3].trim();
      return { decision, rationale, alternatives: [match[2].trim()] };
    }
  },
  {
    // "Deviation: ..." — deviation justifications
    name: 'deviation',
    regex: /Deviation:\s*(.+?)(?:\n|$)/gi,
    extract(match) {
      const full = match[1].trim();
      const rationaleMatch = full.match(/\b(?:because|since|due to)\s+(.+)$/i);
      const decision = rationaleMatch ? full.slice(0, rationaleMatch.index).trim() : full;
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : '';
      return { decision, rationale };
    }
  }
];

/**
 * Extract decisions from agent output text.
 * @param {string} agentOutput - Raw text output from an agent
 * @param {string} agentType - Agent type identifier (e.g. 'executor', 'planner')
 * @returns {Array<{decision: string, rationale: string, context: string, agent: string, alternatives?: string[]}>}
 */
function extractDecisions(agentOutput, agentType) {
  if (!agentOutput || typeof agentOutput !== 'string') return [];

  const results = [];
  const lines = agentOutput.split('\n');

  for (const pattern of DECISION_PATTERNS) {
    // Reset regex lastIndex for each pattern
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(agentOutput)) !== null) {
      const extracted = pattern.extract(match);
      if (!extracted.decision) continue;

      // Truncate decision title to 80 chars
      const decision = extracted.decision.length > 80
        ? extracted.decision.slice(0, 80)
        : extracted.decision;

      // Get surrounding context (2 lines before/after the match)
      const matchLine = agentOutput.slice(0, match.index).split('\n').length - 1;
      const contextStart = Math.max(0, matchLine - 2);
      const contextEnd = Math.min(lines.length, matchLine + 3);
      const context = lines.slice(contextStart, contextEnd).join('\n');

      results.push({
        decision,
        rationale: extracted.rationale || '',
        context,
        agent: agentType,
        alternatives: extracted.alternatives || []
      });
    }
  }

  return results;
}

/**
 * Handle decision extraction for a planning directory.
 * Checks config, extracts decisions from output, and records them.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} agentOutput - Raw agent output text
 * @param {string} agentType - Agent type identifier
 */
function handleDecisionExtraction(planningDir, agentOutput, agentType) {
  // Check config for feature toggle
  const configPath = path.join(planningDir, 'config.json');
  let config;
  try {
    if (!fs.existsSync(configPath)) return;
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_e) {
    return;
  }

  if (!config || !config.features || !config.features.decision_journal) return;

  const decisions = extractDecisions(agentOutput, agentType);
  if (decisions.length === 0) return;

  // Lazy-load decisions module — path relative to plugin root
  let recordDecision;
  try {
    const decisionsModule = require(path.join(__dirname, '..', '..', '..', 'plan-build-run', 'bin', 'lib', 'decisions.cjs'));
    recordDecision = decisionsModule.recordDecision;
  } catch (_e) {
    // decisions.cjs not available — skip silently
    return;
  }

  // Get phase from STATE.md
  const stateInfo = getPhaseFromState(planningDir);
  const phase = stateInfo ? String(stateInfo.phase) : '';

  for (const d of decisions) {
    try {
      recordDecision(planningDir, {
        decision: d.decision,
        rationale: d.rationale,
        context: d.context,
        agent: d.agent,
        phase,
        alternatives: d.alternatives || [],
      });
    } catch (_e) {
      // Non-fatal — log and continue
      try {
        logHook('event-handler', 'SubagentStop', 'decision-record-error', { error: _e.message });
      } catch (_logErr) { /* ignore */ }
    }
  }

  try {
    logHook('event-handler', 'SubagentStop', 'decisions-extracted', {
      count: decisions.length,
      agent: agentType
    });
  } catch (_e) { /* non-fatal */ }
}

module.exports = { isExecutorAgent, shouldAutoVerify, getPhaseFromState, handleHttp, extractDecisions, handleDecisionExtraction };
if (require.main === module || process.argv[1] === __filename) { main(); }
