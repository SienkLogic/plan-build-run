#!/usr/bin/env node
/**
 * Syncs Locked Decisions from .planning/CONTEXT.md into project CLAUDE.md.
 * Called by post-write-dispatch.js when .planning/CONTEXT.md is written.
 *
 * Algorithm:
 *   1. Read .planning/CONTEXT.md — extract ## Locked Decisions table rows
 *   2. Find project CLAUDE.md (cwd/CLAUDE.md)
 *   3. Replace or append a "### Locked Decisions (PBR)" section
 *
 * Idempotent: re-running produces the same result.
 * Advisory only: never throws, never blocks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

const SECTION_START = '### Locked Decisions (PBR)';
const SECTION_END_MARKER = '<!-- /pbr:locked-decisions -->';

/**
 * Extract decision rows from the ## Locked Decisions table in CONTEXT.md.
 * Handles both \n and \r\n line endings.
 * @param {string} contextContent - Full content of CONTEXT.md
 * @returns {{ decision: string, rationale: string }[]}
 */
function extractLockedDecisions(contextContent) {
  // Find ## Locked Decisions section (handle \r\n line endings)
  const sectionMatch = contextContent.match(/## Locked Decisions\r?\n([\s\S]*?)(?=\r?\n## |\r?\n# |$)/);
  if (!sectionMatch) return [];
  const sectionText = sectionMatch[1];
  // Extract table rows (skip header and separator lines)
  const rows = sectionText.split(/\r?\n/).filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Decision'));
  return rows.map(row => {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean);
    return cols.length >= 2 ? { decision: cols[0], rationale: cols[1] } : null;
  }).filter(Boolean);
}

/**
 * Build the Locked Decisions CLAUDE.md section string from decisions array.
 * Returns empty string if decisions is empty (caller should skip sync).
 * @param {{ decision: string, rationale: string }[]} decisions
 * @returns {string}
 */
function buildSection(decisions) {
  if (decisions.length === 0) return '';
  const rows = decisions.map(d => `| ${d.decision} | ${d.rationale} |`).join('\n');
  return `${SECTION_START}\n\n> Auto-synced from \`.planning/CONTEXT.md\`. Edit source file, not this section.\n\n| Decision | Rationale |\n|----------|-----------|\n${rows}\n\n${SECTION_END_MARKER}`;
}

/**
 * Main sync function. Reads CONTEXT.md from cwd/.planning/ and writes/updates
 * the Locked Decisions section in cwd/CLAUDE.md.
 * @param {string} cwd - Project root directory
 */
function syncContextToClaude(cwd) {
  try {
    const contextPath = path.join(cwd, '.planning', 'CONTEXT.md');
    const claudePath = path.join(cwd, 'CLAUDE.md');

    if (!fs.existsSync(contextPath)) return;

    const contextContent = fs.readFileSync(contextPath, 'utf8');
    const decisions = extractLockedDecisions(contextContent);

    if (decisions.length === 0) return; // Nothing to sync

    const section = buildSection(decisions);
    let claudeContent = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8') : '';

    // Replace existing section or append
    const startIdx = claudeContent.indexOf(SECTION_START);
    const endIdx = claudeContent.indexOf(SECTION_END_MARKER);

    if (startIdx !== -1 && endIdx !== -1) {
      // Replace existing section in-place
      claudeContent = claudeContent.substring(0, startIdx) + section + claudeContent.substring(endIdx + SECTION_END_MARKER.length);
    } else {
      // Append new section
      claudeContent = claudeContent.trimEnd() + '\n\n' + section + '\n';
    }

    fs.writeFileSync(claudePath, claudeContent, 'utf8');
    logHook('sync-context-to-claude', 'PostToolUse', 'pass', { decisions: decisions.length });
  } catch (_e) {
    // Advisory only — never propagate errors
  }
}

module.exports = { syncContextToClaude, extractLockedDecisions, buildSection };

// Main entry point when run as a hook script
if (require.main === module || process.argv[1] === __filename) {
  syncContextToClaude(process.env.PBR_PROJECT_ROOT || process.cwd());
  process.exit(0);
}
