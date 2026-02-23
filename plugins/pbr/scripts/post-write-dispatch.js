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

const { checkPlanWrite, checkStateWrite } = require('./check-plan-format');
const { checkSync } = require('./check-roadmap-sync');
const { checkStateSync } = require('./check-state-sync');
const { checkQuality } = require('./post-write-quality');

// Conditionally import validateRoadmap (may not exist yet if PLAN-01 hasn't landed)
let validateRoadmap;
try {
  const cpf = require('./check-plan-format');
  validateRoadmap = cpf.validateRoadmap || null;
} catch (_e) {
  validateRoadmap = null;
}

/**
 * Validate ROADMAP.md writes inside .planning/.
 * @param {Object} data - Parsed hook input
 * @returns {null|{output: Object}}
 */
function checkRoadmapWrite(data) {
  const filePath = data.tool_input?.file_path || '';
  if (!filePath.endsWith('ROADMAP.md')) return null;

  // Only validate ROADMAP.md inside .planning/
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.includes('.planning/') && !normalized.includes('.planning\\')) return null;

  if (!validateRoadmap) return null;

  const fs = require('fs');
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf8');
  const errors = validateRoadmap(content);
  if (errors && errors.length > 0) {
    return {
      output: {
        additionalContext: `[ROADMAP Validation] ${errors.join('; ')}`
      }
    };
  }

  return null;
}

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

      // ROADMAP.md structural validation (before sync checks)
      const roadmapResult = checkRoadmapWrite(data);
      if (roadmapResult) {
        process.stdout.write(JSON.stringify(roadmapResult.output));
        process.exit(0);
      }

      // Roadmap sync check (STATE.md)
      const syncResult = checkSync(data);
      if (syncResult) {
        process.stdout.write(JSON.stringify(syncResult.output));
        process.exit(0);
      }

      // STATE.md frontmatter validation (after roadmap sync, advisory only)
      const stateResult = checkStateWrite(data);
      if (stateResult) {
        process.stdout.write(JSON.stringify(stateResult.output));
        process.exit(0);
      }

      // State sync check (SUMMARY/VERIFICATION → STATE.md + ROADMAP.md)
      const stateSyncResult = checkStateSync(data);
      if (stateSyncResult) {
        process.stdout.write(JSON.stringify(stateSyncResult.output));
        process.exit(0);
      }

      // Quality checks (Prettier, tsc, console.log detection) — consolidated from post-write-quality.js
      const qualityResult = checkQuality(data);
      if (qualityResult) {
        process.stdout.write(JSON.stringify(qualityResult.output));
        process.exit(0);
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
