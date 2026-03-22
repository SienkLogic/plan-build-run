#!/usr/bin/env node

/**
 * PreToolUse Read hook: blocks skills from re-reading their own SKILL.md.
 *
 * Skills are already loaded into context by Claude Code -- re-reading
 * wastes ~13k tokens. This hook checks .planning/.active-skill to
 * determine the current skill and blocks if the Read target matches.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { resolveSessionPath } = require('./lib/core');

/**
 * Core check logic extracted for both stdin (main) and HTTP (handleHttp) paths.
 *
 * @param {Object} data - Parsed hook input (same as stdin JSON)
 * @returns {Object|null} { decision: 'block', reason } if self-read detected, null otherwise
 */
function checkSelfRead(data) {
  try {
    const cwd = data.cwd || process.cwd();
    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || '';

    if (!filePath) {
      return null;
    }

    // Read .active-skill to get current skill name (session-scoped)
    const sessionId = data.session_id || null;
    const planningDir = path.join(cwd, '.planning');
    const activeSkillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    let skillName = '';
    try {
      skillName = fs.readFileSync(activeSkillPath, 'utf8').trim();
    } catch (_readErr) {
      // No .active-skill file -- nothing to block
      return null;
    }

    if (!skillName) {
      return null;
    }

    // Check if file_path ends with skills/{skill-name}/SKILL.md
    const normalized = filePath.replace(/\\/g, '/');
    const pattern = `skills/${skillName}/SKILL.md`.toLowerCase();
    const match = normalized.toLowerCase().endsWith(pattern);

    if (match) {
      logHook('block-skill-self-read', 'PreToolUse', 'block', { skill: skillName, file: filePath });
      return {
        decision: 'block',
        reason: `SKILL.md self-read blocked.\n\nThe active skill (${skillName}) attempted to read its own SKILL.md. Skills are already loaded into context by Claude Code \u2014 re-reading wastes ~13k tokens.\n\nNo action needed. The skill content is already available in your prompt.`
      };
    }

    logHook('block-skill-self-read', 'PreToolUse', 'allow', { skill: skillName, file: filePath });
    return null;
  } catch (_e) {
    logHook('block-skill-self-read', 'PreToolUse', 'error', { error: _e.message });
    return null;
  }
}

/**
 * HTTP handler for hook-server.js.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused)
 * @returns {Object|null} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  const data = reqBody.data || {};
  try {
    return checkSelfRead(data);
  } catch (_e) {
    logHook('block-skill-self-read', 'PreToolUse', 'error', { error: _e.message });
    return null;
  }
}

module.exports = { handleHttp, checkSelfRead };

function main() {
  try {
    let hookInput = {};
    try {
      const stdin = fs.readFileSync(0, 'utf8').trim();
      if (stdin) hookInput = JSON.parse(stdin);
    } catch (_parseErr) {
      // No stdin or invalid JSON
    }

    const result = checkSelfRead(hookInput);

    if (result && result.decision === 'block') {
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    }

    if (result) {
      process.stdout.write(JSON.stringify(result));
    }

    process.exit(0);
  } catch (_e) {
    // Don't block on errors -- emit valid output for Claude Code
    process.stderr.write(`[pbr] block-skill-self-read error: ${_e.message}\n`);
    process.stdout.write(JSON.stringify({ decision: "allow", additionalContext: '\u26a0 [PBR] block-skill-self-read failed: ' + _e.message }));
    process.exit(0);
  }
}

if (require.main === module || process.argv[1] === __filename) { main(); }
