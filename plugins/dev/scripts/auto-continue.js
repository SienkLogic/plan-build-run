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

function main() {
  try {
    const cwd = process.cwd();
    const configPath = path.join(cwd, '.planning', 'config.json');
    const signalPath = path.join(cwd, '.planning', '.auto-next');

    // Check if auto-continue is enabled
    if (!fs.existsSync(configPath)) {
      process.exit(0);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.features || !config.features.auto_continue) {
      process.exit(0);
    }

    // Check for signal file
    if (!fs.existsSync(signalPath)) {
      logHook('auto-continue', 'Stop', 'no-signal', {});
      process.exit(0);
    }

    // Read and DELETE the signal file (one-shot)
    const nextCommand = fs.readFileSync(signalPath, 'utf8').trim();
    // Retry unlink to handle Windows file locking (e.g. antivirus/indexer)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.unlinkSync(signalPath);
        break;
      } catch (unlinkErr) {
        if (attempt === 2) {
          logHook('auto-continue', 'Stop', 'unlink-failed', { error: unlinkErr.message });
        }
      }
    }

    if (!nextCommand) {
      logHook('auto-continue', 'Stop', 'empty-signal', {});
      process.exit(0);
    }

    logHook('auto-continue', 'Stop', 'continue', { next: nextCommand });

    // Output the next command for Claude Code to execute
    const output = {
      message: `Auto-continuing with: ${nextCommand}`,
      command: nextCommand
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (_e) {
    // Don't block on errors
    process.exit(0);
  }
}

main();
