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

const fs = require('fs');
const path = require('path');
const { checkPlanWrite, checkStateWrite } = require('./check-plan-format');
const { checkSync } = require('./check-roadmap-sync');
const { checkStateSync } = require('./check-state-sync');
const { checkQuality } = require('./post-write-quality');
const { resolveConfig } = require('./local-llm/health');
const { classifyFileIntent } = require('./local-llm/operations/classify-file-intent');

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
  const result = validateRoadmap(content);
  const combined = [...(result.errors || []), ...(result.warnings || [])];
  if (combined.length > 0) {
    return {
      output: {
        additionalContext: `[ROADMAP Validation] ${combined.join('; ')}`
      }
    };
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      // Plan format check (PLAN.md, SUMMARY*.md)
      // Note: SUMMARY files intentionally trigger BOTH this check AND the state-sync
      // check below. The plan format check validates frontmatter structure, while
      // state-sync auto-updates ROADMAP.md and STATE.md tracking fields.
      const planResult = await checkPlanWrite(data);
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

      // LLM file intent classification — advisory enrichment for non-planning files
      // Skipped for .planning/ files (already handled by plan format / state checks above)
      const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (filePath && !normalizedPath.includes('.planning/') && !normalizedPath.includes('.planning\\')) {
        try {
          const cwd = process.cwd();
          const planningDir = path.join(cwd, '.planning');
          const llmConfig = (() => {
            try {
              const configPath = path.join(planningDir, 'config.json');
              const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              return resolveConfig(parsed.local_llm);
            } catch (_e) {
              return resolveConfig(undefined);
            }
          })();

          let contentSnippet = '';
          try {
            const content = data.tool_input?.content || data.tool_input?.new_string || '';
            contentSnippet = content.slice(0, 400);
          } catch (_e) {
            // No content available
          }

          if (contentSnippet) {
            const llmResult = await classifyFileIntent(llmConfig, planningDir, filePath, contentSnippet, data.session_id);
            if (llmResult && llmResult.file_type) {
              process.stdout.write(JSON.stringify({
                additionalContext: `[pbr] File classified: ${llmResult.file_type}/${llmResult.intent} (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`
              }));
              process.exit(0);
            }
          }
        } catch (_llmErr) {
          // Never propagate LLM errors
        }
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
