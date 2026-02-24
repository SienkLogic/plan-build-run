#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Write|Edit hooks.
 *
 * Consolidates all PreToolUse Write|Edit checks into a single process,
 * reading stdin once and running all checks sequentially.
 *
 * ── Dispatch Order & Rationale ──────────────────────────────────
 *
 *   1. enforce-pbr-workflow  — Warns or blocks source code writes that
 *      happen without an active PBR skill. Runs first because this is
 *      the most fundamental enforcement: if no PBR skill is managing
 *      the session, all other skill-specific checks are moot.
 *      Can block (exit 2) or advise (exit 0). Config-driven.
 *
 *   2. check-agent-state-write — Blocks subagents from writing STATE.md
 *      directly (except pbr:general). Runs before skill-specific checks
 *      because agent isolation is a hard invariant. Can block (exit 2).
 *
 *   3. check-skill-workflow  — Enforces planning-phase rules (e.g. no
 *      code writes during the plan phase). Can block (exit 2).
 *
 *   4. check-summary-gate    — Blocks STATE.md status advancement
 *      (to built/verified/complete) unless a SUMMARY file exists for
 *      the current phase. Can block (exit 2).
 *
 *   5. check-phase-boundary  — Guards against writes that target files
 *      outside the current phase directory. Can block (exit 2)
 *      or warn (exit 0 with message).
 *
 *   6. check-doc-sprawl      — Prevents creation of new .md/.txt files
 *      outside a known allowlist (when enabled in config). Runs last
 *      because it's the most granular check. Can block (exit 2).
 *
 * ── Short-Circuit Behavior ──────────────────────────────────────
 *
 *   If an earlier check returns a result (blocking or warning with
 *   output), later checks are skipped entirely. For blocking results
 *   (exit 2), this means the write is rejected without evaluating
 *   remaining checks. This is intentional: the first failure is the
 *   most relevant, and running further checks would be wasteful.
 *
 * ── Adding New Checks ───────────────────────────────────────────
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

const { checkAgentStateWrite } = require('./check-agent-state-write');
const { checkWorkflow } = require('./check-skill-workflow');
const { checkSummaryGate } = require('./check-summary-gate');
const { checkBoundary } = require('./check-phase-boundary');
const { checkDocSprawl } = require('./check-doc-sprawl');
const { checkUnmanagedSourceWrite } = require('./enforce-pbr-workflow');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      // Unmanaged source write check — runs first as the most fundamental
      // workflow enforcement: warn/block when source code is edited without
      // an active PBR skill managing the session.
      const unmanagedResult = checkUnmanagedSourceWrite(data);
      if (unmanagedResult) {
        process.stdout.write(JSON.stringify(unmanagedResult.output));
        process.exit(unmanagedResult.exitCode || 0);
      }

      // Agent STATE.md write blocker — most fundamental check
      const agentResult = checkAgentStateWrite(data);
      if (agentResult) {
        process.stdout.write(JSON.stringify(agentResult.output));
        process.exit(agentResult.exitCode || 0);
      }

      // Skill workflow check — can block
      const workflowResult = checkWorkflow(data);
      if (workflowResult) {
        process.stdout.write(JSON.stringify(workflowResult.output));
        process.exit(workflowResult.exitCode || 0);
      }

      // SUMMARY gate — blocks STATE.md advancement without SUMMARY
      const summaryGateResult = checkSummaryGate(data);
      if (summaryGateResult) {
        process.stdout.write(JSON.stringify(summaryGateResult.output));
        process.exit(summaryGateResult.exitCode || 0);
      }

      // Phase boundary check — can block or warn
      const boundaryResult = checkBoundary(data);
      if (boundaryResult) {
        process.stdout.write(JSON.stringify(boundaryResult.output));
        process.exit(boundaryResult.exitCode || 0);
      }

      // Doc sprawl check — blocks new .md/.txt outside allowlist
      const sprawlResult = checkDocSprawl(data);
      if (sprawlResult) {
        process.stdout.write(JSON.stringify(sprawlResult.output));
        process.exit(sprawlResult.exitCode || 0);
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
          const statePath = path.join(process.cwd(), '.planning', 'STATE.md');
          try {
            const stateContent = fs.readFileSync(statePath, 'utf8');
            const currentPhase = stateContent.match(/Phase:\s*(\d+)\s+of/);
            if (currentPhase && parseInt(phaseMatch[1], 10) !== parseInt(currentPhase[1], 10)) {
              process.stdout.write(JSON.stringify({
                additionalContext: `[pbr] Advisory: writing to phase ${phaseMatch[1]} but current phase is ${currentPhase[1]}. Ensure this cross-phase write is intentional.`
              }));
              process.exit(0);
            }
          } catch (_e) {
            // No STATE.md — skip warning
          }
        }
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
