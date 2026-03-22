#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Write|Edit hooks.
 *
 * Consolidates all PreToolUse Write|Edit checks into a single process,
 * reading stdin once and running all checks sequentially.
 *
 * -- Dispatch Order & Rationale --
 *
 *   1. enforce-pbr-workflow  -- Warns or blocks source code writes that
 *      happen without an active PBR skill. Runs first because this is
 *      the most fundamental enforcement: if no PBR skill is managing
 *      the session, all other skill-specific checks are moot.
 *      Can block (exit 2) or advise (exit 0). Config-driven.
 *
 *   2. check-agent-state-write -- Blocks subagents from writing STATE.md
 *      directly (except pbr:general). Runs before skill-specific checks
 *      because agent isolation is a hard invariant. Can block (exit 2).
 *
 *   3. check-skill-workflow  -- Enforces planning-phase rules (e.g. no
 *      code writes during the plan phase). Can block (exit 2).
 *
 *   4. check-summary-gate    -- Blocks STATE.md status advancement
 *      (to built/verified/complete) unless a SUMMARY file exists for
 *      the current phase. Can block (exit 2).
 *
 *   5. check-phase-boundary  -- Guards against writes that target files
 *      outside the current phase directory. Can block (exit 2)
 *      or warn (exit 0 with message).
 *
 *   6. check-doc-sprawl      -- Prevents creation of new .md/.txt files
 *      outside a known allowlist (when enabled in config). Can block (exit 2).
 *
 *   7. prompt-guard           -- Scans .planning/ writes for prompt injection
 *      patterns. Advisory only (exit 0).
 *
 * -- Short-Circuit Behavior --
 *
 *   If an earlier check returns a result (blocking or warning with
 *   output), later checks are skipped entirely. For blocking results
 *   (exit 2), this means the write is rejected without evaluating
 *   remaining checks. This is intentional: the first failure is the
 *   most relevant, and running further checks would be wasteful.
 *
 * -- Adding New Checks --
 *
 *   1. Create a new check module exporting a function that takes
 *      the parsed hook data and returns null (pass) or
 *      { output: {...}, exitCode: N }.
 *   2. require() it at the top of this file.
 *   3. Add the call in sequence below, following the pattern:
 *        const result = checkFoo(data);
 *        if (result) { write output; exit with code; }
 *   4. Position the check based on severity: more fundamental /
 *      broader checks should run earlier; narrow / granular checks
 *      should run later.
 *
 * Exit codes:
 *   0 = allowed or warning only
 *   2 = blocked (workflow violation or phase boundary enforcement)
 */

const { logHook } = require('./hook-logger');
const { checkAgentStateWrite } = require('./check-agent-state-write');
const { checkWorkflow } = require('./check-skill-workflow');
const { checkSummaryGate } = require('./check-summary-gate');
const { checkBoundary } = require('./check-phase-boundary');
const { checkDocSprawl } = require('./check-doc-sprawl');
const { checkPromptInjection } = require('./prompt-guard');
const { checkUnmanagedSourceWrite } = require('./enforce-pbr-workflow');

/**
 * Core dispatch logic extracted for both stdin (main) and HTTP (handleHttp) paths.
 *
 * Runs checks sequentially with short-circuit on first block.
 * Advisory results are returned as { decision: 'allow', additionalContext }.
 *
 * @param {Object} data - Parsed hook input (same as stdin JSON)
 * @returns {Object|null} Hook response: { decision: 'block', reason } or { decision: 'allow', additionalContext? } or advisory output or null
 */
function processEvent(data) {
  try {
    // Unmanaged source write check -- runs first as the most fundamental
    // workflow enforcement: warn/block when source code is edited without
    // an active PBR skill managing the session.
    const unmanagedResult = checkUnmanagedSourceWrite(data);
    if (unmanagedResult) {
      if (unmanagedResult.exitCode === 2) {
        return { decision: 'block', reason: unmanagedResult.output.reason || unmanagedResult.output.additionalContext || 'Unmanaged source write blocked' };
      }
      return unmanagedResult.output;
    }

    // Agent STATE.md write blocker -- most fundamental check
    const agentResult = checkAgentStateWrite(data);
    if (agentResult) {
      if (agentResult.exitCode === 2) {
        return { decision: 'block', reason: agentResult.output.reason || agentResult.output.additionalContext || 'Agent STATE.md write blocked' };
      }
      return agentResult.output;
    }

    // Skill workflow check -- can block
    const workflowResult = checkWorkflow(data);
    if (workflowResult) {
      if (workflowResult.exitCode === 2) {
        return { decision: 'block', reason: workflowResult.output.reason || workflowResult.output.additionalContext || 'Workflow violation' };
      }
      return workflowResult.output;
    }

    // SUMMARY gate -- blocks STATE.md advancement without SUMMARY
    const summaryGateResult = checkSummaryGate(data);
    if (summaryGateResult) {
      if (summaryGateResult.exitCode === 2) {
        return { decision: 'block', reason: summaryGateResult.output.reason || summaryGateResult.output.additionalContext || 'Summary gate violation' };
      }
      return summaryGateResult.output;
    }

    // Phase boundary check -- can block or warn
    const boundaryResult = checkBoundary(data);
    if (boundaryResult) {
      if (boundaryResult.exitCode === 2) {
        return { decision: 'block', reason: boundaryResult.output.reason || boundaryResult.output.additionalContext || 'Phase boundary violation' };
      }
      return boundaryResult.output;
    }

    // Doc sprawl check -- blocks new .md/.txt outside allowlist
    const sprawlResult = checkDocSprawl(data);
    if (sprawlResult) {
      if (sprawlResult.exitCode === 2) {
        return { decision: 'block', reason: sprawlResult.output.reason || sprawlResult.output.additionalContext || 'Doc sprawl blocked' };
      }
      return sprawlResult.output;
    }

    // Prompt injection scan -- advisory only (never blocks)
    const injectionResult = checkPromptInjection(data);
    if (injectionResult) {
      return injectionResult.output;
    }

    // Soft warning: writing outside current phase directory
    // (only when all hard checks passed and we're in a phase)
    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
    if (filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      // Warn about writes to other phase directories (not blocked, just advisory)
      const phaseMatch = normalized.match(/\.planning\/phases\/(\d+)-/);
      if (phaseMatch) {
        const fs = require('fs');
        const path = require('path');
        const statePath = path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning', 'STATE.md');
        try {
          const stateContent = fs.readFileSync(statePath, 'utf8');
          const currentPhase = stateContent.match(/Phase:\s*(\d+)\s+of/);
          if (currentPhase && parseInt(phaseMatch[1], 10) !== parseInt(currentPhase[1], 10)) {
            return {
              additionalContext: `[pbr] Advisory: writing to phase ${phaseMatch[1]} but current phase is ${currentPhase[1]}. Ensure this cross-phase write is intentional.`
            };
          }
        } catch (_e) {
          // No STATE.md -- skip warning
        }
      }
    }

    // Log pass-through so hook activity is visible in logs AND session JSONL
    const file = (data.tool_input?.file_path || data.tool_input?.path || '').split(/[/\\]/).pop();
    logHook('pre-write-dispatch', 'PreToolUse', 'allow', { file });
    return { decision: 'allow' };
  } catch (e) {
    logHook('pre-write-dispatch', 'PreToolUse', 'error', { error: e.message });
    return null;
  }
}

/**
 * HTTP handler for hook-server.js.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused)
 * @returns {Object|null} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  const data = reqBody.data || {};
  try {
    return processEvent(data);
  } catch (_e) {
    logHook('pre-write-dispatch', 'PreToolUse', 'error', { error: _e.message });
    return null;
  }
}

module.exports = { handleHttp, processEvent };

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      const result = processEvent(data);

      if (result && result.decision === 'block') {
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
      }

      if (result) {
        process.stdout.write(JSON.stringify(result));
      } else {
        // processEvent returned null (error) -- allow through
        process.stdout.write(JSON.stringify({ decision: 'allow' }));
      }
      process.exit(0);
    } catch (_e) {
      // Don't block on errors -- emit valid output for Claude Code
      process.stderr.write(`[pbr] pre-write-dispatch error: ${_e.message}\n`);
      process.stdout.write(JSON.stringify({ decision: "allow", additionalContext: '\u26a0 [PBR] pre-write-dispatch failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
