'use strict';

/**
 * lib/premature-completion.js — Premature completion detection heuristics.
 *
 * Provides per-agent-type checks that fire advisory warnings when an agent
 * appears to have completed prematurely (too fast, too little output, missing
 * artifacts). Warnings require 2+ signals to avoid false positives.
 *
 * Implements REQ-HI-08.
 */

const fs = require('fs');
const path = require('path');

// Default baselines per agent type — projects can override via config.json agent_baselines
const DEFAULT_BASELINES = {
  executor: { min_duration_ms: 60000, min_output_chars: 500, min_must_have_coverage: 0.8 },
  verifier: { min_duration_ms: 30000, min_output_chars: 300, min_evidence_rows: 3 },
  planner: { min_duration_ms: 20000, min_tasks: 2 },
  researcher: { min_output_chars: 200, min_sections: 2 },
  synthesizer: { min_output_chars: 150, min_required_fields: 3 }
};

/**
 * Load baselines from config.json, merged over defaults.
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} Merged baselines
 */
function loadBaselines(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const overrides = config.agent_baselines || {};

    // Deep merge per agent type
    const merged = {};
    for (const [agent, defaults] of Object.entries(DEFAULT_BASELINES)) {
      merged[agent] = { ...defaults, ...(overrides[agent] || {}) };
    }

    // Graduated verification: scale baselines down for light-depth verification
    if (config.features?.graduated_verification) {
      try {
        const statePath = path.join(planningDir, 'STATE.md');
        const stateContent = fs.readFileSync(statePath, 'utf8');
        const trustMatch = stateContent.match(/trust_level:\s*"?(\w+)"?/mi);
        if (trustMatch && trustMatch[1] === 'high') {
          // Scale duration/char thresholds by 0.5 for trusted agents
          for (const agentKey of Object.keys(merged)) {
            if (merged[agentKey].min_duration_ms) {
              merged[agentKey].min_duration_ms = Math.round(merged[agentKey].min_duration_ms * 0.5);
            }
            if (merged[agentKey].min_output_chars) {
              merged[agentKey].min_output_chars = Math.round(merged[agentKey].min_output_chars * 0.5);
            }
          }
        }
      } catch (_e) { /* STATE.md read failure is non-fatal */ }
    }

    return merged;
  } catch (_e) {
    // Config missing or malformed — use defaults
    return { ...DEFAULT_BASELINES };
  }
}

/**
 * Find the current phase directory path.
 * @param {string} planningDir
 * @returns {string|null}
 */
function findCurrentPhaseDir(planningDir) {
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const phaseMatch = stateContent.match(/^current_phase:\s*(\d+)/m);
    if (!phaseMatch) return null;

    const phaseNum = phaseMatch[1].padStart(2, '0');
    const phasesDir = path.join(planningDir, 'phases');
    if (!fs.existsSync(phasesDir)) return null;

    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(phaseNum));
    if (dirs.length === 0) return null;

    return path.join(phasesDir, dirs[0]);
  } catch (_e) {
    return null;
  }
}

/**
 * Check executor for premature completion.
 * Signals: fast duration, short output, low must-have coverage in SUMMARY.
 */
function checkExecutor(data, baselines, planningDir) {
  const signals = [];
  const bl = baselines.executor;

  // Signal 1: Too fast
  if (data.duration_ms != null && data.duration_ms < bl.min_duration_ms) {
    signals.push(`duration ${data.duration_ms}ms < ${bl.min_duration_ms}ms minimum`);
  }

  // Signal 2: Short output
  const outputLen = (data.tool_output || '').length;
  if (outputLen < bl.min_output_chars) {
    signals.push(`output ${outputLen} chars < ${bl.min_output_chars} minimum`);
  }

  // Signal 3: Low must-have coverage in SUMMARY.md
  const phaseDir = findCurrentPhaseDir(planningDir);
  if (phaseDir) {
    try {
      const files = fs.readdirSync(phaseDir).filter(f => /^SUMMARY/i.test(f));
      if (files.length > 0) {
        // Check the most recent SUMMARY file
        const summaryPath = path.join(phaseDir, files[files.length - 1]);
        const content = fs.readFileSync(summaryPath, 'utf8');
        // Count items with DONE/complete vs total checklist items
        const allItems = content.match(/- \[[ x]\]/g) || [];
        const doneItems = content.match(/- \[x\]/gi) || [];
        if (allItems.length > 0) {
          const coverage = doneItems.length / allItems.length;
          if (coverage < bl.min_must_have_coverage) {
            signals.push(`must-have coverage ${(coverage * 100).toFixed(0)}% < ${(bl.min_must_have_coverage * 100).toFixed(0)}% minimum`);
          }
        }
      }
    } catch (_e) { /* best-effort */ }
  }

  if (signals.length >= 2) {
    return { warning: `Executor may have completed prematurely (${signals.length} signals)`, signals };
  }
  return null;
}

/**
 * Check verifier for premature completion.
 * Signals: fast duration, short output, few evidence rows in VERIFICATION.md.
 */
function checkVerifier(data, baselines, planningDir) {
  const signals = [];
  const bl = baselines.verifier;

  if (data.duration_ms != null && data.duration_ms < bl.min_duration_ms) {
    signals.push(`duration ${data.duration_ms}ms < ${bl.min_duration_ms}ms minimum`);
  }

  const outputLen = (data.tool_output || '').length;
  if (outputLen < bl.min_output_chars) {
    signals.push(`output ${outputLen} chars < ${bl.min_output_chars} minimum`);
  }

  // Signal 3: Few evidence rows in VERIFICATION.md
  const phaseDir = findCurrentPhaseDir(planningDir);
  if (phaseDir) {
    try {
      const verFile = path.join(phaseDir, 'VERIFICATION.md');
      if (fs.existsSync(verFile)) {
        const content = fs.readFileSync(verFile, 'utf8');
        const evidenceRows = (content.match(/\|\s*#|\|\s*\d+/g) || []).length;
        if (evidenceRows < bl.min_evidence_rows) {
          signals.push(`evidence rows ${evidenceRows} < ${bl.min_evidence_rows} minimum`);
        }
      }
    } catch (_e) { /* best-effort */ }
  }

  if (signals.length >= 2) {
    return { warning: `Verifier may have completed prematurely (${signals.length} signals)`, signals };
  }
  return null;
}

/**
 * Check planner for premature completion.
 * Signals: fast duration, low task count, missing must_haves in PLAN.md.
 */
function checkPlanner(data, baselines, planningDir) {
  const signals = [];
  const bl = baselines.planner;

  if (data.duration_ms != null && data.duration_ms < bl.min_duration_ms) {
    signals.push(`duration ${data.duration_ms}ms < ${bl.min_duration_ms}ms minimum`);
  }

  // Signal 2: Low task count in newest PLAN.md
  const phaseDir = findCurrentPhaseDir(planningDir);
  if (phaseDir) {
    try {
      const planFiles = fs.readdirSync(phaseDir).filter(f => /^PLAN.*\.md$/i.test(f)).sort();
      if (planFiles.length > 0) {
        const planPath = path.join(phaseDir, planFiles[planFiles.length - 1]);
        const content = fs.readFileSync(planPath, 'utf8');
        const taskCount = (content.match(/<task\s/g) || []).length;
        if (taskCount < bl.min_tasks) {
          signals.push(`task count ${taskCount} < ${bl.min_tasks} minimum`);
        }

        // Signal 3: Missing must_haves in frontmatter
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fmMatch) {
          const fm = fmMatch[1];
          if (!/must_haves/i.test(fm)) {
            signals.push('PLAN.md frontmatter missing must_haves key');
          }
        }
      }
    } catch (_e) { /* best-effort */ }
  }

  if (signals.length >= 2) {
    return { warning: `Planner may have completed prematurely (${signals.length} signals)`, signals };
  }
  return null;
}

/**
 * Check researcher for premature completion.
 * Signals: short output, few section headings.
 */
function checkResearcher(data, baselines, _planningDir) {
  const signals = [];
  const bl = baselines.researcher;
  const output = data.tool_output || '';

  if (output.length < bl.min_output_chars) {
    signals.push(`output ${output.length} chars < ${bl.min_output_chars} minimum`);
  }

  const headings = (output.match(/^#{2,3}\s+/gm) || []).length;
  if (headings < bl.min_sections) {
    signals.push(`section headings ${headings} < ${bl.min_sections} minimum`);
  }

  if (signals.length >= 2) {
    return { warning: `Researcher may have completed prematurely (${signals.length} signals)`, signals };
  }
  return null;
}

/**
 * Check synthesizer for premature completion.
 * Signals: short output, missing required SUMMARY.md fields.
 */
function checkSynthesizer(data, baselines, planningDir) {
  const signals = [];
  const bl = baselines.synthesizer;
  const output = data.tool_output || '';

  if (output.length < bl.min_output_chars) {
    signals.push(`output ${output.length} chars < ${bl.min_output_chars} minimum`);
  }

  // Signal 2: Missing required fields in SUMMARY.md frontmatter
  const phaseDir = findCurrentPhaseDir(planningDir);
  if (phaseDir) {
    try {
      const summaryFiles = fs.readdirSync(phaseDir).filter(f => /^SUMMARY/i.test(f)).sort();
      if (summaryFiles.length > 0) {
        const summaryPath = path.join(phaseDir, summaryFiles[summaryFiles.length - 1]);
        const content = fs.readFileSync(summaryPath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (fmMatch) {
          const fm = fmMatch[1];
          const requiredFields = ['requires', 'key_files', 'deferred'];
          const presentCount = requiredFields.filter(f => new RegExp(`^${f}:`, 'm').test(fm)).length;
          if (presentCount < bl.min_required_fields) {
            signals.push(`SUMMARY.md has ${presentCount}/${requiredFields.length} required fields (minimum ${bl.min_required_fields})`);
          }
        }
      }
    } catch (_e) { /* best-effort */ }
  }

  if (signals.length >= 2) {
    return { warning: `Synthesizer may have completed prematurely (${signals.length} signals)`, signals };
  }
  return null;
}

// Dispatch map
const AGENT_CHECKS = {
  executor: checkExecutor,
  verifier: checkVerifier,
  planner: checkPlanner,
  researcher: checkResearcher,
  synthesizer: checkSynthesizer
};

/**
 * Main entry point: check whether an agent completed prematurely.
 * @param {string} agentType - e.g. 'pbr:executor' or 'executor'
 * @param {object} data - Hook data (tool_output, duration_ms, etc.)
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ warning: string, signals: string[] }|null}
 */
function checkPrematureCompletion(agentType, data, planningDir) {
  // Strip pbr: prefix
  const key = agentType.startsWith('pbr:') ? agentType.slice(4) : agentType;
  const checkFn = AGENT_CHECKS[key];
  if (!checkFn) return null;

  const baselines = loadBaselines(planningDir);
  return checkFn(data, baselines, planningDir);
}

module.exports = { checkPrematureCompletion, loadBaselines, DEFAULT_BASELINES };
