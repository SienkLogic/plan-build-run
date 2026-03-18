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
 * Independent dispatch (RH-21):
 *   All checks run independently — no early returns. Results are collected
 *   into an array and merged into a single additionalContext response.
 *   Individual check failures are logged via logHook() and do not prevent
 *   other checks from running.
 *
 * Exit codes:
 *   0 = always (PostToolUse hooks are advisory)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { checkPlanWrite, checkStateWrite } = require('./check-plan-format');
const { checkSync } = require('./check-roadmap-sync');
const { checkStateSync } = require('./check-state-sync');
const { checkQuality } = require('./post-write-quality');
const { syncContextToClaude } = require('./sync-context-to-claude');
const { queueIntelUpdate } = require('./intel-queue');

let checkDependencyBreaks;
try { checkDependencyBreaks = require('./lib/dependency-break').checkDependencyBreaks; } catch (_e) { checkDependencyBreaks = null; }

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
  const results = [];

  /**
   * Extract additionalContext string from a check result.
   * Checks return various shapes: { output: { additionalContext } }, { additionalContext },
   * { output: { decision, reason } }. Normalize to a string or null.
   */
  function extractContext(result) {
    if (!result) return null;
    const output = result.output || result;
    if (output.additionalContext) return output.additionalContext;
    if (output.decision && output.reason) return `[${output.decision}] ${output.reason}`;
    return null;
  }

  // Route CONTEXT.md writes to sync hook (side-effect only, always returns null)
  try {
    checkContextWrite(data);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkContextWrite', error: e.message });
  }

  // Plan format check (PLAN.md, SUMMARY*.md)
  // SUMMARY files trigger BOTH this check AND the state-sync check below.
  try {
    const planResult = await checkPlanWrite(data);
    const ctx = extractContext(planResult);
    if (ctx) results.push(ctx);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkPlanWrite', error: e.message });
  }

  // ROADMAP.md structural validation
  try {
    const roadmapResult = checkRoadmapWrite(data);
    const ctx = extractContext(roadmapResult);
    if (ctx) results.push(ctx);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkRoadmapWrite', error: e.message });
  }

  // Roadmap sync check (STATE.md)
  try {
    const syncResult = checkSync(data);
    const ctx = extractContext(syncResult);
    if (ctx) results.push(ctx);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkSync', error: e.message });
  }

  // STATE.md frontmatter validation (advisory only)
  try {
    const stateResult = checkStateWrite(data);
    const ctx = extractContext(stateResult);
    if (ctx) results.push(ctx);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkStateWrite', error: e.message });
  }

  // State sync check (SUMMARY/VERIFICATION → STATE.md + ROADMAP.md)
  try {
    const stateSyncResult = checkStateSync(data);
    const ctx = extractContext(stateSyncResult);
    if (ctx) results.push(ctx);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkStateSync', error: e.message });
  }

  // Dependency break detection: when SUMMARY.md is written in .planning/phases/
  if (checkDependencyBreaks) {
    try {
      const depFilePath = data.tool_input?.file_path || '';
      const depNormalized = depFilePath.replace(/\\/g, '/');
      if (depNormalized.includes('.planning/phases/') && depNormalized.endsWith('SUMMARY.md')) {
        const phaseNumMatch = depNormalized.match(/(\d{2})-[^/\\]+[/\\]SUMMARY/);
        if (phaseNumMatch) {
          let depConfig;
          try {
            const { configLoad } = require('./pbr-tools');
            depConfig = configLoad(planningDir);
          } catch (_e) {
            depConfig = null;
          }
          if (!depConfig || !depConfig.features || depConfig.features.dependency_break_detection !== false) {
            const depBreaks = checkDependencyBreaks(planningDir, parseInt(phaseNumMatch[1], 10));
            if (depBreaks.length > 0) {
              results.push(`[Dependency Break] ${depBreaks.length} downstream plan(s) may be stale: ${depBreaks.map(b => b.plan).join(', ')}. Run /pbr:plan-phase to re-plan affected phases.`);
            }
          }
        }
      }
    } catch (e) {
      logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkDependencyBreaks', error: e.message });
    }
  }

  // Quality checks (Prettier, tsc, console.log detection)
  try {
    const qualityResult = checkQuality(data);
    const ctx = extractContext(qualityResult);
    if (ctx) results.push(ctx);
  } catch (e) {
    logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkQuality', error: e.message });
  }

  // Intel queue: track code file changes for auto-update (side-effect only)
  try {
    queueIntelUpdate(data, planningDir);
  } catch (_e) {
    // Intel queue must never break the dispatch chain
  }

  // Pattern-based routing — lowest-priority advisory
  try {
    let _checkPatternRouting;
    try { _checkPatternRouting = require('./lib/pattern-routing').checkPatternRouting; } catch (_e) { _checkPatternRouting = null; }
    if (_checkPatternRouting) {
      const patternFilePath = data.tool_input?.file_path || data.tool_input?.path || '';
      if (patternFilePath) {
        let patternConfig;
        try {
          const { configLoad } = require('./pbr-tools');
          patternConfig = configLoad(planningDir);
        } catch (_e) {
          patternConfig = {};
        }
        const patternResult = _checkPatternRouting(patternFilePath, patternConfig || {});
        if (patternResult) {
          results.push('[Pattern] ' + patternResult.advisory);
        }
      }
    }
  } catch (_e) {
    // Pattern routing must never break the dispatch chain
  }

  // LLM file intent classification — advisory enrichment for non-planning files
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (filePath && !normalizedPath.includes('.planning/') && !normalizedPath.includes('.planning\\')) {
    try {
      const { resolveConfig } = require('./local-llm/health');
      const { classifyFileIntent } = require('./local-llm/operations/classify-file-intent');
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
          results.push(`[pbr] File classified: ${llmResult.file_type}/${llmResult.intent} (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`);
        }
      }
    } catch (_llmErr) {
      // Never propagate LLM errors
    }
  }

  // Merge all results into a single response
  if (results.length > 0) {
    return { additionalContext: results.join('\n') };
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
    logHook('post-write-dispatch', 'PostToolUse', 'error', { error: _e.message, stack: (_e.stack || '').split('\n').slice(0, 3).join(' | ') });
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
      logHook('post-write-dispatch', 'PostToolUse', 'error', { error: _e.message, stack: (_e.stack || '').split('\n').slice(0, 3).join(' | ') });
      process.exit(0);
    }
  });
}

module.exports = { handleHttp, processEvent };

if (require.main === module || process.argv[1] === __filename) { main(); }
