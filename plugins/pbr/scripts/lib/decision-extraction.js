#!/usr/bin/env node

/**
 * Decision extraction and negative knowledge functions extracted from event-handler.js.
 *
 * Extracts architectural decisions from agent output using pattern matching,
 * records them via the decision journal, and handles negative knowledge
 * extraction from VERIFICATION.md gaps.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');

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
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'config-read-error', { error: e.message });
    return;
  }

  if (!config || !config.features || !config.features.decision_journal) return;

  const decisions = extractDecisions(agentOutput, agentType);
  if (decisions.length === 0) return;

  // Lazy-load decisions module — path relative to hooks/lib/
  let recordDecision;
  try {
    const decisionsModule = require(path.join(__dirname, 'decisions'));
    recordDecision = decisionsModule.recordDecision;
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'decisions-module-load-error', { error: e.message });
    return;
  }

  // Get phase from STATE.md — use inline require to avoid circular deps
  const { getPhaseFromState } = require('./auto-verify');
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
      } catch (_logErr) {
        // Intentional: logHook itself failed, nothing more we can do
      }
    }
  }

  try {
    logHook('event-handler', 'SubagentStop', 'decisions-extracted', {
      feature: 'decision_journal',
      action: 'extract',
      count: decisions.length,
      agent: agentType
    });
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'log-error', { error: e.message });
  }
}

module.exports = { DECISION_PATTERNS, extractDecisions, handleDecisionExtraction };
