#!/usr/bin/env node

/**
 * PreToolUse Bash hook: Advisory warning when committing pbr skill/agent
 * changes without corresponding cursor-pbr/copilot-pbr counterparts.
 *
 * Only fires on `git commit` commands. Scripts directory is excluded
 * because cursor-pbr and copilot-pbr share scripts via ../pbr/scripts/.
 *
 * Exit codes:
 *   0 = always (advisory only, never blocks)
 */

const { execSync } = require('child_process');
const { logHook } = require('./hook-logger');

/**
 * Check if a git commit has cross-plugin sync drift.
 * @param {Object} data - Parsed hook input
 * @returns {null|{additionalContext: string}} null if clean, advisory if drift
 */
function checkCrossPluginSync(data) {
  const command = data.tool_input?.command || '';

  // Only check git commit commands
  if (!/\bgit\s+commit\b/.test(command)) {
    return null;
  }

  let stagedFiles;
  try {
    stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (_e) {
    return null;
  }

  // Find pbr skill/agent files (not scripts — those are shared)
  const pbrSyncFiles = stagedFiles.filter(f =>
    /^plugins\/pbr\/(skills|agents)\//.test(f)
  );

  if (pbrSyncFiles.length === 0) {
    return null;
  }

  // Check for missing counterparts
  const missingCounterparts = [];
  for (const pbrFile of pbrSyncFiles) {
    const relativePath = pbrFile.replace(/^plugins\/pbr\//, '');
    const cursorPath = `plugins/cursor-pbr/${relativePath}`;
    const copilotPath = `plugins/copilot-pbr/${relativePath}`;

    const hasCursor = stagedFiles.some(f => f === cursorPath);
    const hasCopilot = stagedFiles.some(f => f === copilotPath);

    if (!hasCursor || !hasCopilot) {
      const missing = [];
      if (!hasCursor) missing.push('cursor-pbr');
      if (!hasCopilot) missing.push('copilot-pbr');
      missingCounterparts.push(`${pbrFile} (missing: ${missing.join(', ')})`);
    }
  }

  if (missingCounterparts.length === 0) {
    return null;
  }

  const msg = `Advisory: Cross-plugin sync may be needed. Changed pbr files without cursor-pbr/copilot-pbr counterparts:\n${missingCounterparts.map(f => `  - ${f}`).join('\n')}`;
  logHook('check-cross-plugin-sync', 'PreToolUse', 'warn', { missingCounterparts });

  return { additionalContext: msg };
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = checkCrossPluginSync(data);
      if (result) {
        process.stdout.write(JSON.stringify(result));
      }
    } catch (_e) {
      // Don't block on errors
    }
    process.exit(0);
  });
}

module.exports = { checkCrossPluginSync };
if (require.main === module || process.argv[1] === __filename) { main(); }
