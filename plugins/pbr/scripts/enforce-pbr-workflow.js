#!/usr/bin/env node

/**
 * PBR workflow enforcement checks.
 *
 * Provides advisory and blocking checks that ensure PBR workflow is
 * followed even when the user doesn't explicitly invoke /pbr:* commands.
 *
 * Functions:
 *   loadEnforcementConfig(planningDir) — reads config.json for enforcement level
 *   checkUnmanagedSourceWrite(data)    — PreToolUse Write|Edit: warns/blocks unmanaged source writes
 *   checkNonPbrAgent(data)             — PreToolUse Task: advises using pbr:* agents
 *   checkUnmanagedCommit(data)         — PreToolUse Bash: advises git commits to use /pbr:quick
 *
 * All functions return null for pass, or { exitCode, output } for action.
 * checkNonPbrAgent always returns advisory (exitCode 0) — never blocks Task().
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

/**
 * Load the enforcement configuration from .planning/config.json.
 * Also checks for .planning/.native-mode which bypasses all enforcement.
 *
 * @param {string} planningDir - absolute path to the .planning directory
 * @returns {{ level: "advisory"|"block"|"off" }}
 */
function loadEnforcementConfig(planningDir) {
  // .native-mode bypass takes precedence over all config settings
  const nativeModeFile = path.join(planningDir, '.native-mode');
  if (fs.existsSync(nativeModeFile)) {
    return { level: 'off' };
  }

  try {
    const configPath = path.join(planningDir, 'config.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const level = parsed.workflow && parsed.workflow.enforce_pbr_skills;
    if (level === 'advisory' || level === 'block' || level === 'off') {
      return { level };
    }
  } catch (_e) {
    // No config or parse error — use default
  }

  return { level: 'advisory' };
}

/**
 * PreToolUse Write|Edit: warns or blocks source file writes that happen
 * without an active PBR skill.
 *
 * Skip conditions:
 *   - No .planning/ directory (not a PBR project)
 *   - .planning/.active-skill exists (PBR skill is managing the session)
 *   - Target file is inside .planning/ (planning files are always OK)
 *   - Enforcement level is "off"
 *
 * @param {Object} data - parsed hook input from Claude Code
 * @returns {null|{ exitCode: number, output: Object }}
 */
function checkUnmanagedSourceWrite(data) {
  const filePath = data.tool_input && (data.tool_input.file_path || data.tool_input.path);
  if (!filePath) return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Skip if not a PBR project
  if (!fs.existsSync(planningDir)) return null;

  // Skip if a PBR skill is active
  const activeSkillFile = path.join(planningDir, '.active-skill');
  if (fs.existsSync(activeSkillFile)) return null;

  // Skip if writing inside .planning/
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedPlanning = planningDir.replace(/\\/g, '/');
  if (normalizedFile.startsWith(normalizedPlanning)) return null;

  // Also check with resolved symlinks (macOS /var → /private/var)
  try {
    const resolvedPlanning = fs.realpathSync(planningDir).replace(/\\/g, '/');
    if (normalizedFile.startsWith(resolvedPlanning)) return null;
  } catch (_e) { /* not resolvable */ }

  const config = loadEnforcementConfig(planningDir);
  if (config.level === 'off') return null;

  const message =
    'PBR workflow required: You are editing source code without an active PBR skill. ' +
    'Route this work through a PBR command: /pbr:quick (small fix), /pbr:build (planned work), ' +
    'or /pbr:do (auto-route). Set workflow.enforce_pbr_skills: off in config to disable.';

  if (config.level === 'block') {
    logHook('enforce-pbr-workflow', 'PreToolUse', 'block', { file: path.basename(filePath), level: 'block' });
    return {
      exitCode: 2,
      output: { decision: 'block', reason: message }
    };
  }

  // advisory (default)
  logHook('enforce-pbr-workflow', 'PreToolUse', 'advisory', { file: path.basename(filePath), level: 'advisory' });
  return {
    exitCode: 0,
    output: { additionalContext: '[pbr] ' + message }
  };
}

/**
 * Agent type → PBR agent mapping for advisory messages.
 */
const AGENT_MAPPING = {
  'Explore': 'pbr:researcher or pbr:codebase-mapper',
  'general-purpose': 'pbr:general',
  'Plan': 'pbr:planner',
  'Bash': 'pbr:executor'
};

/**
 * PreToolUse Task: advises using pbr:* agents instead of generic agents.
 *
 * Skip conditions:
 *   - No .planning/ directory (not a PBR project)
 *   - subagent_type starts with "pbr:" (already using PBR agent)
 *   - subagent_type is missing/empty (can't determine type)
 *   - Enforcement level is "off"
 *
 * NOTE: This function NEVER blocks Task() — blocking is too disruptive.
 *       It always returns an advisory (exitCode 0) or null.
 *
 * @param {Object} data - parsed hook input from Claude Code
 * @returns {null|{ exitCode: 0, output: Object }}
 */
function checkNonPbrAgent(data) {
  const subagentType = data.tool_input && data.tool_input.subagent_type;
  if (!subagentType || typeof subagentType !== 'string') return null;

  // Already using a PBR agent
  if (subagentType.startsWith('pbr:')) return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Skip if not a PBR project
  if (!fs.existsSync(planningDir)) return null;

  const config = loadEnforcementConfig(planningDir);
  if (config.level === 'off') return null;

  const suggestion = AGENT_MAPPING[subagentType] || 'a pbr:* agent (e.g., pbr:researcher, pbr:general, pbr:executor)';
  const message =
    `PBR workflow advisory: spawning generic agent "${subagentType}" without PBR routing. ` +
    `Use ${suggestion} instead to maintain audit logging and workflow context. ` +
    'PBR agents are auto-loaded via subagent_type — no extra setup needed.';

  logHook('enforce-pbr-workflow', 'PreToolUse', 'advisory', { agentType: subagentType, suggestion });
  return {
    exitCode: 0,
    output: { additionalContext: '[pbr] ' + message }
  };
}

/**
 * PreToolUse Bash: advises using /pbr:quick when git commit is run without
 * an active PBR skill.
 *
 * Skip conditions:
 *   - No .planning/ directory (not a PBR project)
 *   - .planning/.active-skill exists (PBR skill is managing the session)
 *   - Command is not a git commit
 *   - Enforcement level is "off"
 *
 * @param {Object} data - parsed hook input from Claude Code
 * @returns {null|{ exitCode: 0, output: Object }}
 */
function checkUnmanagedCommit(data) {
  const command = data.tool_input && data.tool_input.command;
  if (!command || typeof command !== 'string') return null;

  // Only check git commit commands
  if (!/\bgit\s+commit\b/.test(command)) return null;

  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Skip if not a PBR project
  if (!fs.existsSync(planningDir)) return null;

  // Skip if a PBR skill is active
  const activeSkillFile = path.join(planningDir, '.active-skill');
  if (fs.existsSync(activeSkillFile)) return null;

  const config = loadEnforcementConfig(planningDir);
  if (config.level === 'off') return null;

  const message =
    'Committing without PBR tracking. Use /pbr:quick to track this work. ' +
    'PBR quick tasks create atomic commits with proper scope and audit trail.';

  logHook('enforce-pbr-workflow', 'PreToolUse', 'advisory', { check: 'unmanaged-commit' });
  return {
    exitCode: 0,
    output: { additionalContext: '[pbr] ' + message }
  };
}

module.exports = {
  loadEnforcementConfig,
  checkUnmanagedSourceWrite,
  checkNonPbrAgent,
  checkUnmanagedCommit
};
