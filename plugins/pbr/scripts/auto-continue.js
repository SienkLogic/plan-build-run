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
      // No auto-continue signal — check for pending todos as a reminder
      const todoPendingDir = path.join(planningDir, 'todos', 'pending');
      try {
        if (fs.existsSync(todoPendingDir)) {
          const pending = fs.readdirSync(todoPendingDir).filter(f => f.endsWith('.md'));
          if (pending.length > 0) {
            logHook('auto-continue', 'Stop', 'pending-todos', { count: pending.length });
            // Non-blocking reminder — write to stderr so it shows in hook output
            process.stderr.write(`[pbr] ${pending.length} pending todo(s) in .planning/todos/pending/ — run /pbr:todo list to review\n`);
          }
        }
      } catch (_todoErr) {
        // Ignore errors scanning todos
      }
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
          // Exponential backoff: 100ms, 200ms — use Atomics.wait for non-spinning delay
          const delay = 100 * Math.pow(2, attempt);
          try {
            const buf = new SharedArrayBuffer(4);
            Atomics.wait(new Int32Array(buf), 0, 0, delay);
          } catch (_atomicsErr) {
            // Fallback for environments without SharedArrayBuffer
            const end = Date.now() + delay;
            while (Date.now() < end) { /* fallback busy-wait */ }
          }
        }
      }
    }

    if (!nextCommand) {
      logHook('auto-continue', 'Stop', 'empty-signal', {});
      process.exit(0);
    }

    // Extract last_assistant_message for richer continuation context
    const lastMsg = hookInput.last_assistant_message || '';
    const msgSuffix = lastMsg
      ? ` (last message excerpt: ${lastMsg.slice(0, 200)})`
      : '';

    logHook('auto-continue', 'Stop', 'continue', { next: nextCommand, hasLastMsg: !!lastMsg });

    // Block the stop and inject the next command as Claude's continuation reason.
    // Claude Code Stop hooks use { decision: "block", reason: "..." } to keep going.
    const output = {
      decision: 'block',
      reason: `Auto-continue: execute ${nextCommand}${msgSuffix}`
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (_e) {
    // Don't block on errors
    process.exit(0);
  }
}

main();
