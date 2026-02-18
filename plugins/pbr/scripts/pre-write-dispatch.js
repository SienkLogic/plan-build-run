#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Write|Edit hooks.
 *
 * Consolidates check-skill-workflow.js, check-phase-boundary.js,
 * and check-doc-sprawl.js into a single process, reading stdin once
 * and running all checks sequentially.
 *
 * Check order matters: skill workflow runs first (can block writes
 * that violate planning rules), then phase boundary (can block or
 * warn about cross-phase writes), then doc sprawl (blocks new .md/.txt
 * files outside the allowlist when enabled).
 *
 * Exit codes:
 *   0 = allowed or warning only
 *   2 = blocked (workflow violation or phase boundary enforcement)
 */

const { checkWorkflow } = require('./check-skill-workflow');
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

      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

if (require.main === module) { main(); }
