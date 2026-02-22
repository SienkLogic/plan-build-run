#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Write|Edit hooks.
 *
 * Consolidates check-skill-workflow.js, check-phase-boundary.js,
 * and check-doc-sprawl.js into a single process, reading stdin once
 * and running all checks sequentially.
 *
 * ── Dispatch Order & Rationale ──────────────────────────────────
 *
 *   1. check-skill-workflow  — Enforces planning-phase rules (e.g. no
 *      code writes during the plan phase). Runs first because workflow
 *      violations are the most fundamental: if the write shouldn't
 *      happen at all in the current workflow state, there's no point
 *      evaluating boundary or sprawl rules. Can block (exit 2).
 *
 *   2. check-summary-gate    — Blocks STATE.md status advancement
 *      (to built/verified/complete) unless a SUMMARY file exists for
 *      the current phase. Prevents inconsistent state where a phase
 *      appears complete but has no build receipt. Can block (exit 2).
 *
 *   3. check-phase-boundary  — Guards against writes that target files
 *      outside the current phase directory. Runs second because once
 *      we know the write is allowed by workflow rules, we need to
 *      verify it's scoped to the correct phase. Can block (exit 2)
 *      or warn (exit 0 with message).
 *
 *   4. check-doc-sprawl      — Prevents creation of new .md/.txt files
 *      outside a known allowlist (when enabled in config). Runs last
 *      because it's the most granular check — only relevant for new
 *      documentation files, not all writes. Can block (exit 2).
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

const { checkWorkflow } = require('./check-skill-workflow');
const { checkSummaryGate } = require('./check-summary-gate');
const { checkBoundary } = require('./check-phase-boundary');
const { checkDocSprawl } = require('./check-doc-sprawl');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      // Skill workflow check first — can block
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
                decision: 'allow',
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
