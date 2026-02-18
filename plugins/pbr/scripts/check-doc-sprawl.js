#!/usr/bin/env node

/**
 * PreToolUse check: Blocks creation of new .md/.txt documentation files
 * outside a known allowlist, preventing doc sprawl during builds.
 *
 * Opt-in via .planning/config.json: { "hooks": { "blockDocSprawl": true } }
 *
 * Allowlist:
 *   - README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, LICENSE.md, LICENSE, LICENSE.txt
 *   - Any file under .planning/, .claude/, node_modules/, .git/
 *   - Any file that already exists (edits to existing docs are always allowed)
 *
 * Called by pre-write-dispatch.js — not wired directly in hooks.json.
 *
 * Exit codes (when standalone):
 *   0 = pass (allowed)
 *   2 = block (not on allowlist)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

const ALLOWED_DOC_BASENAMES = new Set([
  'readme.md',
  'claude.md',
  'contributing.md',
  'changelog.md',
  'license.md',
  'license',
  'license.txt',
]);

const ALLOWED_DIR_SEGMENTS = [
  '.planning',
  '.claude',
  'node_modules',
  '.git',
];

const DOC_EXTENSIONS = new Set(['.md', '.txt']);

/**
 * Check if a Write operation would create a disallowed documentation file.
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @param {string} [cwd] - Working directory override (defaults to process.cwd())
 * @returns {null|{exitCode: number, output: Object}} null if allowed, block result otherwise
 */
function checkDocSprawl(data, cwd) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  const ext = path.extname(filePath).toLowerCase();
  if (!DOC_EXTENSIONS.has(ext)) return null;

  // Only block NEW file creation — existing docs can always be edited
  if (fs.existsSync(filePath)) return null;

  // Check config — disabled by default
  const effectiveCwd = cwd || process.cwd();
  if (!isBlockDocSprawlEnabled(effectiveCwd)) return null;

  // Check basename allowlist
  const basename = path.basename(filePath).toLowerCase();
  if (ALLOWED_DOC_BASENAMES.has(basename)) return null;

  // Check if file is in an allowed directory
  const normalized = filePath.replace(/\\/g, '/');
  for (const seg of ALLOWED_DIR_SEGMENTS) {
    if (normalized.includes(`/${seg}/`)) return null;
  }

  logHook('check-doc-sprawl', 'PreToolUse', 'block', {
    file: path.basename(filePath),
    ext
  });

  return {
    exitCode: 2,
    output: {
      decision: 'block',
      reason: `[Doc Sprawl] Blocked creation of ${path.basename(filePath)}. ` +
        'Only known docs (README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, LICENSE.md) ' +
        'and .planning/ files are allowed when blockDocSprawl is enabled. ' +
        'Add content to an existing file instead, or disable hooks.blockDocSprawl in config.'
    }
  };
}

function isBlockDocSprawlEnabled(cwd) {
  try {
    const configPath = path.join(cwd, '.planning', 'config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return !!config.hooks?.blockDocSprawl;
  } catch (_e) {
    return false;
  }
}

module.exports = { checkDocSprawl, isBlockDocSprawlEnabled, ALLOWED_DOC_BASENAMES, ALLOWED_DIR_SEGMENTS, DOC_EXTENSIONS };
