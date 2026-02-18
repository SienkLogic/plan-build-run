#!/usr/bin/env node

/**
 * PostToolUse dispatcher for Write|Edit hooks.
 *
 * Consolidates check-plan-format.js and check-roadmap-sync.js
 * into a single process, reading stdin once and routing to the
 * appropriate check based on the file path. This halves the
 * process spawns per Write/Edit call.
 *
 * Routing:
 *   - PLAN.md or SUMMARY*.md → plan format validation
 *   - STATE.md → roadmap sync check
 *   - SUMMARY*.md or VERIFICATION.md in .planning/phases/ → state sync (auto-update tracking files)
 *   - Other files → exit immediately (no work needed)
 *
 * Exit codes:
 *   0 = always (PostToolUse hooks are advisory)
 */

const { checkPlanWrite } = require('./check-plan-format');
const { checkSync } = require('./check-roadmap-sync');
const { checkStateSync } = require('./check-state-sync');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      // Plan format check (PLAN.md, SUMMARY*.md)
      // Note: SUMMARY files intentionally trigger BOTH this check AND the state-sync
      // check below. The plan format check validates frontmatter structure, while
      // state-sync auto-updates ROADMAP.md and STATE.md tracking fields.
      const planResult = checkPlanWrite(data);
      if (planResult) {
        process.stdout.write(JSON.stringify(planResult.output));
        process.exit(0);
      }

      // Roadmap sync check (STATE.md)
      const syncResult = checkSync(data);
      if (syncResult) {
        process.stdout.write(JSON.stringify(syncResult.output));
        process.exit(0);
      }

      // State sync check (SUMMARY/VERIFICATION → STATE.md + ROADMAP.md)
      const stateSyncResult = checkStateSync(data);
      if (stateSyncResult) {
        process.stdout.write(JSON.stringify(stateSyncResult.output));
        process.exit(0);
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

if (require.main === module) { main(); }
