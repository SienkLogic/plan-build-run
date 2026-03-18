#!/usr/bin/env node

/**
 * Stop hook: Auto-continue via config flag (with signal file backward compat).
 *
 * When enabled (features.auto_continue: true in config.json),
 * reads workflow._auto_chain_active from config.json on session stop.
 * If set, reads the next command and clears the flag (one-shot).
 * Falls back to .planning/.auto-next signal file for backward compat.
 *
 * Hard stops (flag NOT set):
 * - Milestone completion
 * - human_needed flag set
 * - Execution errors
 * - Gap closure attempted 3+ times
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { logHook } = require('./hook-logger');
const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
const { loadTracker } = require('./session-tracker');
const { resolveSessionPath } = require('../plan-build-run/bin/lib/core.cjs');

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
    const sessionId = hookInput.session_id || null;
    const signalPath = sessionId
      ? resolveSessionPath(planningDir, '.auto-next', sessionId)
      : path.join(planningDir, '.auto-next');

    // Check if auto-continue is enabled
    const config = configLoad(planningDir);
    if (!config || !config.features || !config.features.auto_continue) {
      process.exit(0);
    }

    // Phase-limit detection: check if session has completed enough phases to trigger a cycle
    // Scale default limit with context window: 3 at 200k, 6 at 500k+, 8 at 1M
    const tracker = loadTracker(planningDir, sessionId);
    let phaseLimit;
    if (config.session_phase_limit !== undefined) {
      phaseLimit = config.session_phase_limit;
    } else {
      const ctxTokens = config.context_window_tokens || 200000;
      phaseLimit = ctxTokens >= 1000000 ? 8 : ctxTokens >= 500000 ? 6 : 3;
    }
    if (phaseLimit > 0 && tracker && tracker.phases_completed >= phaseLimit) {
      // Write signal file with /pbr:pause-work to trigger the pause chain
      try { fs.writeFileSync(signalPath, '/pbr:pause-work', 'utf8'); } catch (_writeErr) { /* ignore */ }

      let reasonStr;
      // session_cycling: "tmux" | "compact-first" | "compact" | "manual"
      // compact-first: try /compact first, only cycle if still degraded (user must opt in)
      // Default: tmux if in TMUX env, otherwise compact
      const cyclingMethod = config.session_cycling || (process.env.TMUX ? 'tmux' : 'compact');
      if (cyclingMethod === 'compact-first') {
        // Try compact first, then cycle — gentler on long 1M sessions
        logHook('auto-continue', 'Stop', 'cycle-compact-first', { phases: tracker.phases_completed, limit: phaseLimit });
        reasonStr = 'Auto-continue: session checkpoint after ' + tracker.phases_completed + ' phases.\n\n'
          + 'COMPACT-FIRST CYCLING: Try compacting before cycling to a fresh session.\n'
          + 'Steps IN ORDER:\n'
          + '1. Run /pbr:pause-work to save session state\n'
          + '2. Run /compact to compress context\n'
          + '3. Run /pbr:resume-work to continue\n'
          + '4. IF quality degrades after compact, THEN run /clear + /pbr:resume-work for a full cycle\n\n'
          + 'Execute /pbr:pause-work now.';
      } else if (cyclingMethod === 'tmux') {
        // TMUX environment: spawn detached process to auto-cycle
        // On Windows, Claude Code's bash is MSYS2 (no tmux) — bridge through wsl.exe to reach the WSL tmux server
        // On Linux/macOS, tmux is available directly
        const isWindows = process.platform === 'win32';
        let cycleCmd;
        if (isWindows) {
          // Use pbr-tmux cycle which handles pane targeting via WSL tmux
          cycleCmd = 'sleep 3 && wsl.exe -d Ubuntu -- pbr-tmux cycle --non-interactive';
        } else {
          cycleCmd = 'sleep 3 && tmux send-keys "/clear" Enter && sleep 1 && tmux send-keys "/pbr:resume-work" Enter';
        }
        const child = spawn('bash', ['-c', cycleCmd], { detached: true, stdio: 'ignore' });
        child.unref();
        logHook('auto-continue', 'Stop', 'cycle-tmux', { phases: tracker.phases_completed, limit: phaseLimit, bridge: isWindows ? 'wsl' : 'native' });
        reasonStr = 'Auto-continue: execute /pbr:pause-work \u2014 Session checkpoint after ' + tracker.phases_completed + ' phases. TMUX auto-cycle will send /clear + /pbr:resume-work after pause completes.';
      } else if (cyclingMethod === 'compact') {
        // Compact mode: keep session alive, compress context, then continue
        logHook('auto-continue', 'Stop', 'cycle-compact', { phases: tracker.phases_completed, limit: phaseLimit });
        reasonStr = 'Auto-continue: session checkpoint after ' + tracker.phases_completed + ' phases.\n\n'
          + 'IMPORTANT: Context cycling required. You MUST do these steps IN ORDER:\n'
          + '1. Run /pbr:pause-work to save session state\n'
          + '2. Run /compact to compress context\n'
          + '3. Run /pbr:resume-work to continue with fresh context\n\n'
          + 'Execute /pbr:pause-work now.';
      } else {
        // Manual mode or unknown: show checkpoint banner with manual instructions
        logHook('auto-continue', 'Stop', 'cycle-banner', { phases: tracker.phases_completed, limit: phaseLimit });
        reasonStr = 'Auto-continue: execute /pbr:pause-work \u2014 Session checkpoint after ' + tracker.phases_completed + ' phases.\n\n'
          + '+==============================================================+\n'
          + '|  PLAN-BUILD-RUN > SESSION CHECKPOINT                         |\n'
          + '+==============================================================+\n\n'
          + 'Context cycling recommended after ' + tracker.phases_completed + ' phases completed.\n'
          + 'After pause completes, run:\n\n'
          + '  1. /clear\n'
          + '  2. /pbr:resume-work\n';
      }

      process.stdout.write(JSON.stringify({ decision: 'block', reason: reasonStr }));
      process.exit(0);
    }

    // Phase boundary clear enforcement
    // When workflow.phase_boundary_clear is "enforce", block auto-continue
    // until the user runs /clear. The build skill writes .phase-boundary-pending
    // as a signal that a clear is required.
    const phaseBoundaryPath = path.join(planningDir, '.phase-boundary-pending');
    if (fs.existsSync(phaseBoundaryPath)) {
      const phaseBoundaryClear = (config.workflow && config.workflow.phase_boundary_clear) || 'off';
      if (phaseBoundaryClear === 'enforce') {
        logHook('auto-continue', 'Stop', 'phase-boundary-enforce', {});
        // Delete the signal file (one-shot)
        try { fs.unlinkSync(phaseBoundaryPath); } catch (_e) { /* ignore */ }
        // Also delete .auto-next if it exists (enforce overrides auto-continue)
        try { fs.unlinkSync(signalPath); } catch (_e) { /* ignore */ }
        const reasonStr = 'Phase boundary clear is enforced. Run /clear before continuing to the next phase.\n\n'
          + 'This ensures fresh context quality for the next phase. After /clear, run /pbr:resume-work to continue.';
        process.stdout.write(JSON.stringify({ decision: 'block', reason: reasonStr }));
        process.exit(0);
      } else if (phaseBoundaryClear === 'recommend') {
        // Advisory only — let auto-continue proceed but add a note
        logHook('auto-continue', 'Stop', 'phase-boundary-recommend', {});
        try { fs.unlinkSync(phaseBoundaryPath); } catch (_e) { /* ignore */ }
        // Don't block — just log. The build skill already showed the advisory.
      } else {
        // "off" — clean up stale signal file
        try { fs.unlinkSync(phaseBoundaryPath); } catch (_e) { /* ignore */ }
      }
    }

    // Primary: read next command from config flag workflow._auto_chain_active
    let nextCommand = '';
    let source = 'none';
    if (config.workflow && config.workflow._auto_chain_active) {
      nextCommand = String(config.workflow._auto_chain_active).trim();
      source = 'config-flag';
      // Clear the flag immediately (one-shot) by writing config back without it
      try {
        const configPath = path.join(planningDir, 'config.json');
        const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (rawConfig.workflow) {
          delete rawConfig.workflow._auto_chain_active;
        }
        fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');
      } catch (_clearErr) {
        logHook('auto-continue', 'Stop', 'flag-clear-failed', { error: _clearErr.message });
      }
    }

    // Backward compat: fall back to .auto-next signal file if config flag was empty
    let signalFileRead = false;
    if (!nextCommand && fs.existsSync(signalPath)) {
      nextCommand = fs.readFileSync(signalPath, 'utf8').trim();
      signalFileRead = true;
      source = nextCommand ? 'signal-file' : 'none';
      // Delete the signal file (migration path — old writers may still create it)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.unlinkSync(signalPath);
          break;
        } catch (unlinkErr) {
          if (attempt === 2) {
            logHook('auto-continue', 'Stop', 'unlink-failed', { error: unlinkErr.message });
          } else {
            const delay = 100 * Math.pow(2, attempt);
            try {
              const buf = new SharedArrayBuffer(4);
              Atomics.wait(new Int32Array(buf), 0, 0, delay);
            } catch (_atomicsErr) {
              // No SharedArrayBuffer — skip delay, retry immediately
            }
          }
        }
      }
    }

    if (!nextCommand) {
      // Signal file existed but was empty
      if (signalFileRead) {
        logHook('auto-continue', 'Stop', 'empty-signal', {});
        process.exit(0);
      }
      // No auto-continue signal — check for pending todos as a reminder
      const todoPendingDir = path.join(planningDir, 'todos', 'pending');
      try {
        if (fs.existsSync(todoPendingDir)) {
          const pending = fs.readdirSync(todoPendingDir).filter(f => f.endsWith('.md'));
          if (pending.length > 0) {
            logHook('auto-continue', 'Stop', 'pending-todos', { count: pending.length });
            process.stderr.write(`[pbr] ${pending.length} pending todo(s) in .planning/todos/pending/ — run /pbr:todo list to review\n`);
          }
        }
      } catch (_todoErr) {
        // Ignore errors scanning todos
      }
      // Reset continue count on normal session stop (no signal)
      const countPathNoSig = path.join(planningDir, '.continue-count');
      try { fs.unlinkSync(countPathNoSig); } catch (_e) { /* ignore */ }
      logHook('auto-continue', 'Stop', 'no-signal', {});
      process.exit(0);
    }

    if (!nextCommand) {
      logHook('auto-continue', 'Stop', 'empty-signal', {});
      process.exit(0);
    }

    // Track consecutive continues for session length guard
    const countPath = path.join(planningDir, '.continue-count');
    let continueCount = 0;
    try {
      continueCount = parseInt(fs.readFileSync(countPath, 'utf8').trim(), 10) || 0;
    } catch (_e) { /* file missing — start at 0 */ }
    continueCount++;
    try { fs.writeFileSync(countPath, String(continueCount)); } catch (_e) { /* ignore */ }

    // Hard stop after 6 consecutive continues — context is likely degraded
    if (continueCount > 6) {
      logHook('auto-continue', 'Stop', 'hard-stop-session-length', { count: continueCount });
      process.exit(0);
    }

    // Extract last_assistant_message for richer continuation context
    const lastMsg = hookInput.last_assistant_message || '';
    const msgSuffix = lastMsg
      ? ` (last message excerpt: ${lastMsg.slice(0, 200)})`
      : '';

    logHook('auto-continue', 'Stop', 'continue', { next: nextCommand, source, hasLastMsg: !!lastMsg, continueCount });

    // Build reason string with optional advisory
    let reasonStr = `Auto-continue: execute ${nextCommand}${msgSuffix}`;
    if (continueCount > 3) {
      reasonStr += `\n\n[pbr] Advisory: ${continueCount} consecutive continues. Consider /pbr:pause-work + fresh session to avoid context degradation.`;
    }

    // Block the stop and inject the next command as Claude's continuation reason.
    // Claude Code Stop hooks use { decision: "block", reason: "..." } to keep going.
    const output = {
      decision: 'block',
      reason: reasonStr
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (_e) {
    // Don't block on errors
    process.stdout.write(JSON.stringify({ additionalContext: '⚠ [PBR] auto-continue failed: ' + _e.message }));
    process.exit(0);
  }
}

main();
