#!/usr/bin/env node

/**
 * WorktreeCreate hook: Initializes .planning/ directory structure in new git worktrees.
 *
 * Fires when a new git worktree is created. Copies the minimal .planning/ structure
 * from the parent project so PBR skills work correctly in the new worktree context.
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
    const parentRoot = data.project_root || process.env.PBR_PROJECT_ROOT || process.cwd();

    const planningDir = path.join(worktreePath, '.planning');
    const parentPlanningDir = path.join(parentRoot, '.planning');

    // Skip if parent has no .planning/ — not a PBR project
    if (!fs.existsSync(parentPlanningDir)) {
      logHook('worktree-create', 'WorktreeCreate', 'skip-no-parent', { worktree_path: worktreePath });
      process.stdout.write(JSON.stringify({ additionalContext: '[Plan-Build-Run] Worktree skip — no parent .planning/ found.' }));
      process.exit(0); return;
    }

    // Skip if worktree already has .planning/ initialized
    if (fs.existsSync(planningDir)) {
      logHook('worktree-create', 'WorktreeCreate', 'skip-exists', { worktree_path: worktreePath });
      process.stdout.write(JSON.stringify({ additionalContext: '[Plan-Build-Run] Worktree .planning/ already initialized.' }));
      process.exit(0); return;
    }

    // Create .planning/ directory
    fs.mkdirSync(planningDir, { recursive: true });

    // Create .planning/logs/ directory
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });

    // Write a minimal STATE.md
    const stateMd = `# STATE

## Current Position
phase: (none)
status: Worktree initialized — run /pbr:resume-work or /pbr:progress for project state.

## Source
parent: ${parentRoot}
initialized: ${new Date().toISOString()}
`;
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateMd, 'utf8');

    // Copy config.json from parent if it exists
    try {
      const srcConfig = path.join(parentPlanningDir, 'config.json');
      const destConfig = path.join(planningDir, 'config.json');
      if (fs.existsSync(srcConfig)) {
        fs.copyFileSync(srcConfig, destConfig);
      }
    } catch (_e) { /* non-fatal — config copy is best-effort */ }

    logHook('worktree-create', 'WorktreeCreate', 'initialized', {
      worktree_path: worktreePath,
      parent_root: parentRoot
    });

    process.stdout.write(JSON.stringify({
      additionalContext: '[Plan-Build-Run] Worktree .planning/ initialized. Run /pbr:progress to see project state.'
    }));

    process.exit(0);
  } catch (err) {
    logHook('worktree-create', 'WorktreeCreate', 'error', { error: err.message });
    process.stdout.write(JSON.stringify({ additionalContext: `[Plan-Build-Run] Worktree init error: ${err.message}` }));
    process.exit(0);
  }
}

/**
 * handleHttp — hook-server.js interface.
 * reqBody = { event, tool, data, planningDir, cache }
 * Returns { additionalContext: "..." } or null. Never calls process.exit().
 */
function handleHttp(reqBody) {
  try {
    const data = (reqBody && reqBody.data) || {};
    const worktreePath = data.worktree_path || process.env.PBR_PROJECT_ROOT || process.cwd();
    const parentRoot = data.project_root || process.env.PBR_PROJECT_ROOT || process.cwd();

    const planningDir = path.join(worktreePath, '.planning');
    const parentPlanningDir = path.join(parentRoot, '.planning');

    if (!fs.existsSync(parentPlanningDir)) {
      logHook('worktree-create', 'WorktreeCreate', 'skip-no-parent', { worktree_path: worktreePath });
      return { additionalContext: '[Plan-Build-Run] Worktree skip — no parent .planning/ found.' };
    }

    if (fs.existsSync(planningDir)) {
      logHook('worktree-create', 'WorktreeCreate', 'skip-exists', { worktree_path: worktreePath });
      return { additionalContext: '[Plan-Build-Run] Worktree .planning/ already initialized.' };
    }

    fs.mkdirSync(planningDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });

    const stateMd = `# STATE\n\n## Current Position\nphase: (none)\nstatus: Worktree initialized — run /pbr:resume-work or /pbr:progress for project state.\n\n## Source\nparent: ${parentRoot}\ninitialized: ${new Date().toISOString()}\n`;
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateMd, 'utf8');

    try {
      const srcConfig = path.join(parentPlanningDir, 'config.json');
      const destConfig = path.join(planningDir, 'config.json');
      if (fs.existsSync(srcConfig)) fs.copyFileSync(srcConfig, destConfig);
    } catch (_e) { /* non-fatal */ }

    logHook('worktree-create', 'WorktreeCreate', 'initialized', {
      worktree_path: worktreePath,
      parent_root: parentRoot
    });

    return { additionalContext: '[Plan-Build-Run] Worktree .planning/ initialized. Run /pbr:progress to see project state.' };
  } catch (err) {
    logHook('worktree-create', 'WorktreeCreate', 'error', { error: err.message });
    return { additionalContext: `[Plan-Build-Run] Worktree init error: ${err.message}` };
  }
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main, handleHttp };
