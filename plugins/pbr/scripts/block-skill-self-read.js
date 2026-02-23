#!/usr/bin/env node

/**
 * PreToolUse Read hook: blocks skills from re-reading their own SKILL.md.
 *
 * Skills are already loaded into context by Claude Code — re-reading
 * wastes ~13k tokens. This hook checks .planning/.active-skill to
 * determine the current skill and blocks if the Read target matches.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

function main() {
  try {
    let hookInput = {};
    try {
      const stdin = fs.readFileSync(0, 'utf8').trim();
      if (stdin) hookInput = JSON.parse(stdin);
    } catch (_parseErr) {
      // No stdin or invalid JSON
    }

    const cwd = hookInput.cwd || process.cwd();
    const toolInput = hookInput.tool_input || {};
    const filePath = toolInput.file_path || '';

    if (!filePath) {
      process.exit(0);
    }

    // Read .active-skill to get current skill name
    const activeSkillPath = path.join(cwd, '.planning', '.active-skill');
    let skillName = '';
    try {
      skillName = fs.readFileSync(activeSkillPath, 'utf8').trim();
    } catch (_readErr) {
      // No .active-skill file — nothing to block
      process.exit(0);
    }

    if (!skillName) {
      process.exit(0);
    }

    // Check if file_path ends with skills/{skill-name}/SKILL.md
    const normalized = filePath.replace(/\\/g, '/');
    const pattern = `skills/${skillName}/SKILL.md`.toLowerCase();
    const match = normalized.toLowerCase().endsWith(pattern);

    if (match) {
      logHook('block-skill-self-read', 'PreToolUse', 'block', { skill: skillName, file: filePath });
      const output = {
        decision: 'block',
        reason: `SKILL.md self-read blocked.\n\nThe active skill (${skillName}) attempted to read its own SKILL.md. Skills are already loaded into context by Claude Code \u2014 re-reading wastes ~13k tokens.\n\nNo action needed. The skill content is already available in your prompt.`
      };
      process.stdout.write(JSON.stringify(output));
    } else {
      logHook('block-skill-self-read', 'PreToolUse', 'allow', { skill: skillName, file: filePath });
    }

    process.exit(0);
  } catch (_e) {
    // Don't block on errors
    process.exit(0);
  }
}

main();
