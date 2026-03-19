#!/usr/bin/env node

/**
 * PostToolUse advisory hook: warns when STATE.md or ROADMAP.md is written
 * directly via the Write/Edit tool, bypassing lockedFileUpdate() locking.
 * Advisory only — cannot block (PostToolUse limitation).
 */

/**
 * Detect direct writes to STATE.md or ROADMAP.md and return an advisory warning.
 *
 * @param {Object} data - Parsed hook input from PostToolUse
 * @returns {null|{output: {additionalContext: string}}}
 */
function checkDirectStateWrite(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  const normalized = filePath.replace(/\\/g, '/');

  const isStateMd = normalized.endsWith('.planning/STATE.md');
  const isRoadmapMd = normalized.endsWith('.planning/ROADMAP.md');
  if (!isStateMd && !isRoadmapMd) return null;

  const file = isStateMd ? 'STATE.md' : 'ROADMAP.md';
  const cliHint = isStateMd
    ? 'Use: node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update <field> <value>'
    : 'Use: node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status <phase> <status>';

  return {
    output: {
      additionalContext: `[DirectWrite Warning] Direct Write to ${file} bypasses lockedFileUpdate() and is unsafe in multi-session environments. ${cliHint} for atomic, lock-protected mutations.`
    }
  };
}

module.exports = { checkDirectStateWrite };
