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
const { syncContextToClaude } = require('./sync-context-to-claude');

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

/**
 * Route .planning/CONTEXT.md writes to the sync hook.
 * Syncs Locked Decisions from CONTEXT.md into project CLAUDE.md.
 * Always returns null (advisory only — never short-circuits other checks).
 * @param {Object} data - Parsed hook input
 * @returns {null}
 */
function checkContextWrite(data) {
  const filePath = data.tool_input?.file_path || '';
  const normalized = filePath.replace(/\\/g, '/');
  // Only trigger for project-level CONTEXT.md inside .planning/
  if (!normalized.endsWith('.planning/CONTEXT.md')) return null;
  syncContextToClaude(process.env.PBR_PROJECT_ROOT || process.cwd());
  return null; // Advisory only — no output needed
}

/**
 * Core dispatch logic extracted for both stdin (main) and HTTP (handleHttp) paths.
 *
 * @param {Object} data - Parsed hook input (same as stdin JSON)
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @returns {Promise<Object|null>} Hook response object or null
 */
async function processEvent(data, planningDir) {
  // Route CONTEXT.md writes to sync hook (runs first, always returns null)
  checkContextWrite(data);

  // Plan format check (PLAN.md, SUMMARY*.md)
  // Note: SUMMARY files intentionally trigger BOTH this check AND the state-sync
  // check below. The plan format check validates frontmatter structure, while
  // state-sync auto-updates ROADMAP.md and STATE.md tracking fields.
  const planResult = await checkPlanWrite(data);
  if (planResult) {
    return planResult.output;
  }

  // ROADMAP.md structural validation (before sync checks)
  const roadmapResult = checkRoadmapWrite(data);
  if (roadmapResult) {
    return roadmapResult.output;
  }

  // Roadmap sync check (STATE.md)
  const syncResult = checkSync(data);
  if (syncResult) {
    return syncResult.output;
  }

  // STATE.md frontmatter validation (after roadmap sync, advisory only)
  const stateResult = checkStateWrite(data);
  if (stateResult) {
    return stateResult.output;
  }

  // State sync check (SUMMARY/VERIFICATION → STATE.md + ROADMAP.md)
  const stateSyncResult = checkStateSync(data);
  if (stateSyncResult) {
    return stateSyncResult.output;
  }

  // Quality checks (Prettier, tsc, console.log detection) — consolidated from post-write-quality.js
  const qualityResult = checkQuality(data);
  if (qualityResult) {
    return qualityResult.output;
  }

  // LLM file intent classification — advisory enrichment for non-planning files
  // Skipped for .planning/ files (already handled by plan format / state checks above)
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (filePath && !normalizedPath.includes('.planning/') && !normalizedPath.includes('.planning\\')) {
    try {
      const { resolveConfig } = require('../plan-build-run/bin/lib/local-llm/health.cjs');
      const { classifyFileIntent } = require('../plan-build-run/bin/lib/local-llm/operations/classify-file-intent.cjs');
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
          return {
            additionalContext: `[pbr] File classified: ${llmResult.file_type}/${llmResult.intent} (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`
          };
        }
      }
    } catch (_llmErr) {
      // Never propagate LLM errors
    }
  }

  return null;
}

/**
 * HTTP handler for hook-server.js.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused, config read from disk)
 * @returns {Promise<Object|null>} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  const data = reqBody.data || {};
  const planningDir = reqBody.planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  try {
    return await processEvent(data, planningDir);
  } catch (_e) {
    return null;
  }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
      const planningDir = path.join(cwd, '.planning');

      const output = await processEvent(data, planningDir);
      if (output) {
        process.stdout.write(JSON.stringify(output));
      }
      process.exit(0);
    } catch (_e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

module.exports = { handleHttp, processEvent };

if (require.main === module || process.argv[1] === __filename) { main(); }
