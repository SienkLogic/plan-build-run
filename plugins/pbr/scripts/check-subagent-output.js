#!/usr/bin/env node

/**
 * PostToolUse hook on Task: Validates that subagent outputs exist.
 *
 * Maps agent types to expected output files and warns if they're missing
 * after the agent completes. This catches silent agent failures early
 * rather than discovering them during verification.
 *
 * Agent → Expected output mapping:
 *   executor   → SUMMARY-{plan_id}.md (or SUMMARY.md) in the phase directory
 *   planner    → PLAN-{MM}.md in the phase directory
 *   verifier   → VERIFICATION.md in the phase directory
 *   researcher → RESEARCH.md (or domain-specific .md) in research/
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks — PostToolUse can only warn)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

// Agent type → expected output patterns
const AGENT_OUTPUTS = {
  'pbr:executor': {
    description: 'SUMMARY.md in the phase or quick directory',
    check: (planningDir) => {
      // Check phase directory first, then quick directory
      const phaseMatches = findInPhaseDir(planningDir, /^SUMMARY.*\.md$/i);
      if (phaseMatches.length > 0) return phaseMatches;
      return findInQuickDir(planningDir, /^SUMMARY.*\.md$/i);
    }
  },
  'pbr:planner': {
    description: 'PLAN.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^PLAN.*\.md$/i)
  },
  'pbr:verifier': {
    description: 'VERIFICATION.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^VERIFICATION\.md$/i)
  },
  'pbr:researcher': {
    description: 'research file in .planning/research/',
    check: (planningDir) => {
      const researchDir = path.join(planningDir, 'research');
      if (!fs.existsSync(researchDir)) return [];
      try {
        return fs.readdirSync(researchDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join('research', f));
      } catch (_e) {
        return [];
      }
    }
  }
};

function findInPhaseDir(planningDir, pattern) {
  const matches = [];
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return matches;

  try {
    // Find the active phase from STATE.md
    const stateFile = path.join(planningDir, 'STATE.md');
    if (!fs.existsSync(stateFile)) return matches;

    const stateContent = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = stateContent.match(/Phase:\s*(\d+)\s+of\s+\d+/);
    if (!phaseMatch) return matches;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase));
    if (dirs.length === 0) return matches;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const files = fs.readdirSync(phaseDir);
    for (const file of files) {
      if (pattern.test(file)) {
        // Check it's non-empty
        const filePath = path.join(phaseDir, file);
        const stat = fs.statSync(filePath);
        if (stat.size > 0) {
          matches.push(path.join('phases', dirs[0], file));
        }
      }
    }
  } catch (_e) {
    // best-effort
  }
  return matches;
}

function findInQuickDir(planningDir, pattern) {
  const matches = [];
  const quickDir = path.join(planningDir, 'quick');
  if (!fs.existsSync(quickDir)) return matches;

  try {
    // Find the most recent quick task directory (highest NNN)
    const dirs = fs.readdirSync(quickDir)
      .filter(d => /^\d{3}-/.test(d))
      .sort()
      .reverse();
    if (dirs.length === 0) return matches;

    const latestDir = path.join(quickDir, dirs[0]);
    const stat = fs.statSync(latestDir);
    if (!stat.isDirectory()) return matches;

    const files = fs.readdirSync(latestDir);
    for (const file of files) {
      if (pattern.test(file)) {
        const filePath = path.join(latestDir, file);
        const fileStat = fs.statSync(filePath);
        if (fileStat.size > 0) {
          matches.push(path.join('quick', dirs[0], file));
        }
      }
    }
  } catch (_e) {
    // best-effort
  }
  return matches;
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

function main() {
  const data = readStdin();
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only relevant for Plan-Build-Run projects
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Extract agent type from the Task completion data
  const agentType = data.tool_input?.subagent_type || data.subagent_type || '';

  // Only check known Plan-Build-Run agent types
  const outputSpec = AGENT_OUTPUTS[agentType];
  if (!outputSpec) {
    process.exit(0);
  }

  // Check for expected outputs
  const found = outputSpec.check(planningDir);

  if (found.length === 0) {
    logHook('check-subagent-output', 'PostToolUse', 'warning', {
      agent_type: agentType,
      expected: outputSpec.description,
      found: 'none'
    });

    const output = {
      additionalContext: `Warning: Agent ${agentType} completed but no ${outputSpec.description} was found. The agent may have failed silently. Check agent output for errors.`
    };
    process.stdout.write(JSON.stringify(output));
  } else {
    logHook('check-subagent-output', 'PostToolUse', 'verified', {
      agent_type: agentType,
      found: found
    });
  }

  process.exit(0);
}

module.exports = { AGENT_OUTPUTS, findInPhaseDir, findInQuickDir };
if (require.main === module || process.argv[1] === __filename) { main(); }
