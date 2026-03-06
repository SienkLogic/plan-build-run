#!/usr/bin/env node

/**
 * WorktreeRemove hook: Cleans up worktree-specific .planning/ state on git worktree removal.
 *
 * Fires when a git worktree is removed. Performs non-destructive cleanup of
 * session-specific files only. Guards against accidentally cleaning the parent
 * project's .planning/ directory.
 *
 * Non-blocking — always exits 0.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) { /* empty or non-JSON stdin */ }
  return {};
}

function main() {
  try {
    const data = readStdin();

    const worktreePath = data.worktree_path || process.env.PBR_PROJECT_ROOT || process.cwd();
    const planningDir = path.join(worktreePath, '.planning');

    // Skip if no .planning/ exists in worktree
    if (!fs.existsSync(planningDir)) {
      logHook('worktree-remove', 'WorktreeRemove', 'skip-no-planning', { worktree_path: worktreePath });
      process.exit(0);
    }

    // Guard: only clean up if STATE.md has the "parent:" marker — this indicates
    // it was initialized by worktree-create.js and is safe to clean up.
    // If STATE.md has no "parent:" line, this might be the parent project itself.
    const stateMdPath = path.join(planningDir, 'STATE.md');
    if (fs.existsSync(stateMdPath)) {
      const stateContent = fs.readFileSync(stateMdPath, 'utf8');
      if (!stateContent.includes('parent:')) {
        logHook('worktree-remove', 'WorktreeRemove', 'skip-not-worktree', { worktree_path: worktreePath });
        process.exit(0);
      }
    }

    // Non-destructive cleanup: remove session-specific files only
    const sessionFiles = [
      '.session.json',
      '.session-start',
      '.active-skill',
      '.auto-next'
    ];

    for (const filename of sessionFiles) {
      try {
        const filePath = path.join(planningDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (_e) { /* non-fatal — best-effort cleanup */ }
    }

    logHook('worktree-remove', 'WorktreeRemove', 'cleaned', {
      worktree_path: worktreePath,
      files_removed: ['session files']
    });

    // No additionalContext output — worktree removal is a background operation
    process.exit(0);
  } catch (err) {
    logHook('worktree-remove', 'WorktreeRemove', 'error', { error: err.message });
    process.exit(0);
  }
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main };
