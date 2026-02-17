#!/usr/bin/env node

/**
 * PreToolUse hook (Write|Edit): Enforces skill-specific workflow rules.
 *
 * Reads .planning/.active-skill to determine which skill is running.
 * Each skill can have rules about what files can be written and when.
 *
 * Current rules:
 *   - /dev:quick: Cannot write files outside .planning/ until a PLAN.md
 *     exists in .planning/quick/. This prevents the orchestrator from
 *     skipping the planning steps and jumping straight to implementation.
 *
 * Skills opt in by writing .planning/.active-skill at the start of
 * their execution. If the file doesn't exist, this hook does nothing.
 *
 * Exit codes:
 *   0 = allowed or not applicable
 *   2 = blocked (workflow violation)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

      if (!filePath) {
        process.exit(0);
      }

      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');

      // Read active skill
      const activeSkill = readActiveSkill(planningDir);
      if (!activeSkill) {
        process.exit(0);
      }

      // Apply skill-specific rules
      const violation = checkSkillRules(activeSkill, filePath, planningDir);
      if (violation) {
        logHook('check-skill-workflow', 'PreToolUse', 'block', {
          skill: activeSkill,
          file: path.basename(filePath),
          rule: violation.rule
        });
        logEvent('workflow', 'skill-workflow-block', {
          skill: activeSkill,
          file: path.basename(filePath),
          rule: violation.rule
        });

        const output = {
          decision: 'block',
          reason: violation.message
        };
        process.stdout.write(JSON.stringify(output));
        process.exit(2);
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

function readActiveSkill(planningDir) {
  const skillFile = path.join(planningDir, '.active-skill');
  if (!fs.existsSync(skillFile)) return null;

  try {
    const content = fs.readFileSync(skillFile, 'utf8').trim();
    return content || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Check skill-specific workflow rules.
 * Returns { rule, message } if violated, null if OK.
 */
function checkSkillRules(skill, filePath, planningDir) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPlanning = planningDir.replace(/\\/g, '/');
  // Check with both raw paths and resolved symlinks (macOS /var → /private/var)
  let isInPlanning = normalizedPath.startsWith(normalizedPlanning);
  if (!isInPlanning) {
    try {
      const resolvedPlanning = fs.realpathSync(planningDir).replace(/\\/g, '/');
      isInPlanning = normalizedPath.startsWith(resolvedPlanning);
    } catch (_e) { /* not resolvable */ }
  }

  // Check for orchestrator writing agent artifacts (any skill)
  const artifactViolation = checkArtifactRules(filePath, planningDir);
  if (artifactViolation) return artifactViolation;

  switch (skill) {
  case 'quick':
    return checkQuickRules(filePath, isInPlanning, planningDir);
  case 'build':
    return checkBuildRules(filePath, isInPlanning, planningDir);
  default:
    return null;
  }
}

/**
 * Artifact rules (all skills):
 * - SUMMARY.md and VERIFICATION.md should only be written by subagents
 * - If .active-agent exists, a subagent is running (allow writes)
 * - If .active-agent does NOT exist, the orchestrator is writing (block)
 */
function checkArtifactRules(filePath, planningDir) {
  const basename = path.basename(filePath);

  // Only check SUMMARY and VERIFICATION files in phase directories
  const isSummary = /^SUMMARY.*\.md$/i.test(basename);
  const isVerification = /^VERIFICATION.*\.md$/i.test(basename);
  if (!isSummary && !isVerification) return null;

  // If .active-agent exists, a subagent is running — allow
  const activeAgentFile = path.join(planningDir, '.active-agent');
  if (fs.existsSync(activeAgentFile)) return null;

  const artifactType = isSummary ? 'SUMMARY.md' : 'VERIFICATION.md';
  return {
    rule: 'orchestrator-artifact-write',
    message: `Workflow violation: ${artifactType} should be written by a subagent, not the orchestrator.\n\nBlocked: ${filePath}\n\nDelegate this write to a Task(subagent_type: "dev:towline-executor") or Task(subagent_type: "dev:towline-verifier") agent.`
  };
}

/**
 * /dev:quick rules:
 * - Cannot write files outside .planning/ until PLAN.md exists in .planning/quick/
 * - This prevents the orchestrator from skipping directly to implementation
 */
function checkQuickRules(filePath, isInPlanning, planningDir) {
  // Writes to .planning/ are always allowed (creating plan, state, etc.)
  if (isInPlanning) return null;

  // Check if any PLAN.md exists under .planning/quick/
  const quickDir = path.join(planningDir, 'quick');
  if (hasPlanFile(quickDir)) return null;

  return {
    rule: 'quick-requires-plan',
    message: `Workflow violation: /dev:quick must create a PLAN.md before writing source code.\n\nBlocked: ${filePath}\n\nComplete Steps 4-6 of the quick workflow first:\n  1. Create .planning/quick/{NNN}-{slug}/ directory\n  2. Write PLAN.md with at least one <task> block\n  3. Then spawn the executor to implement`
  };
}

/**
 * /dev:build rules:
 * - Cannot write files outside .planning/ unless a PLAN.md exists for the current phase
 */
function checkBuildRules(filePath, isInPlanning, planningDir) {
  // Writes to .planning/ are always allowed
  if (isInPlanning) return null;

  // Check if any PLAN.md exists under .planning/phases/
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return {
      rule: 'build-requires-plan',
      message: `Workflow violation: /dev:build requires a planned phase before writing source code.\n\nBlocked: ${filePath}\n\nRun /dev:plan first to create a phase plan.`
    };
  }

  // Check current phase directory for PLAN.md
  const stateFile = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(stateFile)) return null;

  try {
    const state = fs.readFileSync(stateFile, 'utf8');
    const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
    if (!phaseMatch) return null;

    const currentPhase = phaseMatch[1].padStart(2, '0');
    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase));
    if (dirs.length === 0) return null;

    const phaseDir = path.join(phasesDir, dirs[0]);
    if (hasPlanFile(phaseDir)) return null;

    return {
      rule: 'build-requires-plan',
      message: `Workflow violation: /dev:build requires a PLAN.md for phase ${currentPhase} before writing source code.\n\nBlocked: ${filePath}\n\nRun /dev:plan ${currentPhase} first.`
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Check if any PLAN.md file exists in a directory (recursive one level).
 */
function hasPlanFile(dir) {
  if (!fs.existsSync(dir)) return false;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('PLAN.md')) return true;
      if (entry.isDirectory()) {
        const subEntries = fs.readdirSync(path.join(dir, entry.name));
        if (subEntries.some(f => f.endsWith('PLAN.md'))) return true;
      }
    }
  } catch (_e) {
    // skip
  }
  return false;
}

/**
 * Core workflow check logic for use by dispatchers.
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @returns {null|{exitCode: number, output: Object}} null if pass, result otherwise
 */
function checkWorkflow(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  const activeSkill = readActiveSkill(planningDir);
  if (!activeSkill) return null;

  const violation = checkSkillRules(activeSkill, filePath, planningDir);
  if (violation) {
    logHook('check-skill-workflow', 'PreToolUse', 'block', {
      skill: activeSkill, file: path.basename(filePath), rule: violation.rule
    });
    logEvent('workflow', 'skill-workflow-block', {
      skill: activeSkill, file: path.basename(filePath), rule: violation.rule
    });
    return {
      exitCode: 2,
      output: { decision: 'block', reason: violation.message }
    };
  }

  return null;
}

module.exports = { readActiveSkill, checkSkillRules, hasPlanFile, checkWorkflow };
if (require.main === module) { main(); }
