#!/usr/bin/env node

/**
 * Stop hook: Auto-continue via signal files.
 *
 * When enabled (features.auto_continue: true in config.json),
 * reads .planning/.auto-next signal file on session stop.
 * If present, reads the next command and injects it.
 * Signal file is ONE-SHOT: read and delete to prevent infinite loops.
 *
 * Hard stops (signal file NOT written):
 * - Milestone completion
 * - human_needed flag set
 * - Execution errors
 * - Gap closure attempted 3+ times
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { configLoad } = require('./pbr-tools');

function main() {
  try {
    // Parse hook input from stdin (Claude Code passes JSON with stop_hook_active flag)
    let hookInput = {};
    try {
      const stdin = fs.readFileSync(0, 'utf8').trim();
      if (stdin) hookInput = JSON.parse(stdin);
    } catch (_parseErr) {
      // No stdin or invalid JSON — proceed with defaults
    }

    // Guard against infinite loops: if we're already in a Stop hook continuation, bail out
    if (hookInput.stop_hook_active) {
      logHook('auto-continue', 'Stop', 'already-active', {});
      process.exit(0);
    }

    const cwd = hookInput.cwd || process.cwd();
    const planningDir = path.join(cwd, '.planning');
    const signalPath = path.join(planningDir, '.auto-next');

    // Check if auto-continue is enabled
    const config = configLoad(planningDir);
    if (!config || !config.features || !config.features.auto_continue) {
      process.exit(0);
    }

    // Check for signal file
    if (!fs.existsSync(signalPath)) {
      logHook('auto-continue', 'Stop', 'no-signal', {});
      process.exit(0);
    }

    // Read and DELETE the signal file (one-shot)
    const nextCommand = fs.readFileSync(signalPath, 'utf8').trim();
    // Retry unlink with exponential backoff for Windows file locking (antivirus/indexer)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.unlinkSync(signalPath);
        break;
      } catch (unlinkErr) {
        if (attempt === 2) {
          logHook('auto-continue', 'Stop', 'unlink-failed', { error: unlinkErr.message });
        } else {
          // Exponential backoff: 100ms, 200ms
          const delay = 100 * Math.pow(2, attempt);
          const start = Date.now();
          while (Date.now() - start < delay) { /* busy-wait */ }
        }
      }
    }

    if (!nextCommand) {
      logHook('auto-continue', 'Stop', 'empty-signal', {});
      process.exit(0);
    }

    logHook('auto-continue', 'Stop', 'continue', { next: nextCommand });

    // Block the stop and inject the next command as Claude's continuation reason.
    // Claude Code Stop hooks use { decision: "block", reason: "..." } to keep going.
    const output = {
      decision: 'block',
      reason: `Auto-continue: execute ${nextCommand}`
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (_e) {
    // Don't block on errors
    process.exit(0);
  }
}

main();
