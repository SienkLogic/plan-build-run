#!/usr/bin/env node

/**
 * PreCompact hook: Preserves current state to STATE.md before
 * lossy context compaction.
 *
 * Updates STATE.md with:
 * - Timestamp of last compaction
 * - Note that compaction occurred (for debugging context loss)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

function main() {
  const cwd = process.cwd();
  const stateFile = path.join(cwd, '.planning', 'STATE.md');

  // Not a Towline project or no STATE.md
  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  try {
    let content = fs.readFileSync(stateFile, 'utf8');
    const timestamp = new Date().toISOString();

    // Update or add Session Continuity section
    const continuityHeader = '## Session Continuity';
    const continuityContent = `Last session: ${timestamp}\nCompaction occurred: context was auto-compacted at this point\nNote: Some conversation context may have been lost. Check STATE.md and SUMMARY.md files for ground truth.`;

    if (content.includes(continuityHeader)) {
      // Replace existing section
      content = content.replace(
        /## Session Continuity[\s\S]*?(?=\n## |\n---|\s*$)/,
        `${continuityHeader}\n${continuityContent}\n`
      );
    } else {
      // Append section
      content = content.trimEnd() + `\n\n${continuityHeader}\n${continuityContent}\n`;
    }

    fs.writeFileSync(stateFile, content, 'utf8');
    logHook('context-budget-check', 'PreCompact', 'saved', { stateFile: 'STATE.md' });
  } catch (e) {
    logHook('context-budget-check', 'PreCompact', 'error', { error: e.message });
  }

  process.exit(0);
}

main();
