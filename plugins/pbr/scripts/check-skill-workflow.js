#!/usr/bin/env node

/**
 * PreToolUse hook (Write|Edit): Enforces skill-specific workflow rules.
 *
 * Reads .planning/.active-skill to determine which skill is running.
 * Each skill can have rules about what files can be written and when.
 *
 * Current rules:
 *   - /pbr:quick: Cannot write files outside .planning/ until a PLAN.md
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
  case 'statusline':
    return checkStatuslineRules(filePath, isInPlanning, planningDir);
  case 'review':
  case 'discuss':
  case 'begin':
    return checkReadOnlySkillRules(skill, filePath, isInPlanning);
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
    message: `Workflow violation: ${artifactType} should be written by a subagent, not the orchestrator.\n\nBlocked: ${filePath}\n\nDelegate this write to a Task(subagent_type: "pbr:executor") or Task(subagent_type: "pbr:verifier") agent.`
  };
}

/**
 * /pbr:quick rules:
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
    message: `Workflow violation: /pbr:quick must create a PLAN.md before writing source code.\n\nBlocked: ${filePath}\n\nComplete Steps 4-6 of the quick workflow first:\n  1. Create .planning/quick/{NNN}-{slug}/ directory\n  2. Write PLAN.md with at least one <task> block\n  3. Then spawn the executor to implement`
  };
}

/**
 * /pbr:build rules:
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
      message: `Workflow violation: /pbr:build requires a planned phase before writing source code.\n\nBlocked: ${filePath}\n\nRun /pbr:plan first to create a phase plan.`
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
      message: `Workflow violation: /pbr:build requires a PLAN.md for phase ${currentPhase} before writing source code.\n\nBlocked: ${filePath}\n\nRun /pbr:plan ${currentPhase} first.`
    };
  } catch (_e) {
    return null;
  }
}

/**
 * /pbr:statusline rules:
 * - Warn when writing settings.json with hardcoded home directory paths
 */
function checkStatuslineRules(filePath, isInPlanning, _planningDir) {
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Only check settings.json writes
  if (!normalizedPath.endsWith('settings.json')) return null;

  // Check tool_input content isn't available here — we only have filePath.
  // The hardcoded path check needs content, which we get from the hook data.
  // This function is called from checkSkillRules which only passes filePath.
  // We'll check in the wrapper instead. For now, return null (pass).
  return null;
}

/**
 * Extended statusline check that includes content inspection.
 * Called from checkWorkflow/main where we have access to full hook data.
 */
function checkStatuslineContent(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const normalizedPath = filePath.replace(/\\/g, '/');

  if (!normalizedPath.endsWith('settings.json')) return null;

  // Check new_string (Edit) or content (Write) for hardcoded home paths
  const content = data.tool_input?.new_string || data.tool_input?.content || '';
  const oldString = data.tool_input?.old_string || '';
  const textToCheck = content + ' ' + oldString;

  // Hardcoded home directory paths — warn, don't block (may be legitimately resolved)
  const hardcodedPathPattern = /(\/home\/|C:\\Users\\|\/Users\/)[^"'\s]*\.claude/i;
  if (hardcodedPathPattern.test(textToCheck)) {
    return {
      rule: 'statusline-hardcoded-path',
      message: `Warning: settings.json write appears to contain a hardcoded home directory path.\n\nFile: ${filePath}\n\nCRITICAL: Do NOT hardcode paths. Use dynamic path resolution to find the correct plugin installation directory.`
    };
  }

  return null;
}

/**
 * Read-only skill rules (review, discuss, begin):
 * - Cannot write files outside .planning/
 */
function checkReadOnlySkillRules(skill, filePath, isInPlanning) {
  if (isInPlanning) return null;

  return {
    rule: `${skill}-readonly`,
    message: `Workflow violation: /pbr:${skill} should only write to .planning/ files.\n\nBlocked: ${filePath}\n\nThe ${skill} skill is not intended to modify source code.`
  };
}

/**
 * Check if any PLAN.md file exists in a directory (recursive one level).
 */
function hasPlanFile(dir) {
  if (!fs.existsSync(dir)) return false;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /^PLAN.*\.md$/i.test(entry.name)) return true;
      if (entry.isDirectory()) {
        const subEntries = fs.readdirSync(path.join(dir, entry.name));
        if (subEntries.some(f => /^PLAN.*\.md$/i.test(f))) return true;
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

  // Statusline content check (needs full data for content inspection)
  if (activeSkill === 'statusline') {
    const contentViolation = checkStatuslineContent(data);
    if (contentViolation) {
      logHook('check-skill-workflow', 'PreToolUse', 'warn', {
        skill: activeSkill, file: path.basename(filePath), rule: contentViolation.rule
      });
      return {
        exitCode: 0,
        output: { additionalContext: contentViolation.message }
      };
    }
  }

  return null;
}

module.exports = { readActiveSkill, checkSkillRules, hasPlanFile, checkWorkflow, checkStatuslineContent, checkReadOnlySkillRules };
if (require.main === module || process.argv[1] === __filename) { main(); }
