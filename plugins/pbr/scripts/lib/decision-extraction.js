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
    logHook('decision-extraction', 'SubagentStop', 'config-read-error', { error: e.message });
    return;
  }

  if (!config || !config.features || !config.features.decision_journal) return;

  const decisions = extractDecisions(agentOutput, agentType);
  if (decisions.length === 0) return;

  // Lazy-load decisions module — path relative to hooks/lib/
  let recordDecision;
  try {
    const decisionsModule = require(path.join(__dirname, '..', '..', '..', '..', 'plan-build-run', 'bin', 'lib', 'decisions.cjs'));
    recordDecision = decisionsModule.recordDecision;
  } catch (e) {
    logHook('decision-extraction', 'SubagentStop', 'decisions-module-load-error', { error: e.message });
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
        logHook('decision-extraction', 'SubagentStop', 'decision-record-error', { error: _e.message });
      } catch (_logErr) {
        // Intentional: logHook itself failed, nothing more we can do
      }
    }
  }

  try {
    logHook('decision-extraction', 'SubagentStop', 'decisions-extracted', {
      feature: 'decision_journal',
      action: 'extract',
      count: decisions.length,
      agent: agentType
    });
  } catch (e) {
    logHook('decision-extraction', 'SubagentStop', 'log-error', { error: e.message });
  }
}

/**
 * Extract negative knowledge entries from VERIFICATION.md gaps.
 * Parses both section format (### Gap: ...) and table format (| Gap | Files | Evidence |).
 * @param {string} planningDir - Path to .planning directory
 * @param {string} phaseDir - Path to the specific phase directory
 * @param {object} config - Parsed config.json object
 */
function extractNegativeKnowledge(planningDir, phaseDir, config) {
  if (!config || !config.features || !config.features.negative_knowledge) return;

  const verificationPath = path.join(phaseDir, 'VERIFICATION.md');
  if (!fs.existsSync(verificationPath)) return;

  const content = fs.readFileSync(verificationPath, 'utf8');

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return;

  const fmText = fmMatch[1];
  const statusMatch = fmText.match(/^status:\s*(.+)$/m);
  const status = statusMatch ? statusMatch[1].trim() : '';

  const gapsInFm = fmText.match(/^gaps:\s*\n((?:\s+-\s+.+\n?)*)/m);
  if (!gapsInFm && status !== 'failed') return;
  if (status !== 'failed' && !gapsInFm) return;

  const body = content.slice(fmMatch[0].length);
  const bodyNorm = body.replace(/\r\n/g, '\n');

  // Parse gaps — section format: ### Gap: {title}\nFiles: {files}\n{evidence}
  const sectionGaps = [];
  const sectionRegex = /###\s*Gap:\s*(.+)\nFiles:\s*(.+)\n([\s\S]*?)(?=\n###|\n##|\s*$)/g;
  let match;
  while ((match = sectionRegex.exec(bodyNorm)) !== null) {
    sectionGaps.push({ title: match[1].trim(), files: match[2].trim().split(/,\s*/), evidence: match[3].trim() });
  }

  // Parse gaps — table format: | Gap | Files | Evidence |
  const tableGaps = [];
  const tableRows = bodyNorm.split('\n').filter(line => line.includes('|') && !line.includes('---'));
  if (tableRows.length >= 2) {
    const headerRow = tableRows[0];
    const isGapTable = /gap/i.test(headerRow) && /files/i.test(headerRow);
    if (isGapTable) {
      for (let i = 1; i < tableRows.length; i++) {
        const cols = tableRows[i].split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 3) {
          tableGaps.push({ title: cols[0], files: cols[1].split(/,\s*/), evidence: cols[2] });
        }
      }
    }
  }

  const gaps = sectionGaps.length > 0 ? sectionGaps : tableGaps;
  if (gaps.length === 0) return;

  let recordFailure;
  try {
    const nkModule = require(path.join(__dirname, '..', '..', '..', '..', 'plan-build-run', 'bin', 'lib', 'negative-knowledge.cjs'));
    recordFailure = nkModule.recordFailure;
  } catch (e) {
    logHook('decision-extraction', 'SubagentStop', 'negative-knowledge-module-load-error', { error: e.message });
    return;
  }

  const phaseName = path.basename(phaseDir);
  const phaseMatch = phaseName.match(/^(\d+)/);
  const phase = phaseMatch ? phaseMatch[1] : '';

  for (const gap of gaps) {
    try {
      recordFailure(planningDir, { title: gap.title, category: 'verification-gap', filesInvolved: gap.files, whatTried: gap.title, whyFailed: gap.evidence || gap.title, phase });
    } catch (e) {
      logHook('decision-extraction', 'SubagentStop', 'negative-knowledge-record-error', { error: e.message });
    }
  }

  try {
    logHook('decision-extraction', 'SubagentStop', 'negative-knowledge-extracted', { feature: 'negative_knowledge', action: 'extract', count: gaps.length, phase });
  } catch (e) {
    logHook('decision-extraction', 'SubagentStop', 'log-error', { error: e.message });
  }
}

module.exports = { DECISION_PATTERNS, extractDecisions, handleDecisionExtraction, extractNegativeKnowledge };
