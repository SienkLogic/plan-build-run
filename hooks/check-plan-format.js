#!/usr/bin/env node

/**
 * PostToolUse hook: Validates planning artifact structure on write.
 *
 * Validated file types:
 * - PLAN.md: task elements, frontmatter, max 3 tasks
 * - SUMMARY.md: frontmatter fields, key_files paths
 * - VERIFICATION.md: status, phase, must_haves fields
 * - ROADMAP.md: milestone structure, phase definitions (errors for critical, warnings for minor)
 * - LEARNINGS.md: frontmatter with phase, key_insights, patterns
 * - STATE.md: frontmatter fields (warnings only, auto-synced)
 * - config.json: valid JSON, required fields
 * - RESEARCH.md: frontmatter with confidence, sources_checked
 * - CONTEXT.md: XML-style sections (domain, decisions, canonical_refs, deferred) or legacy markdown headers
 *
 * Returns decision: "block" for structural errors (forces Claude to fix and retry).
 * Returns message for non-blocking warnings.
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, never blocks via exit code)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { resolveConfig } = require('./local-llm/health');
const { classifyArtifact } = require('./local-llm/operations/classify-artifact');

// Import all validators from extracted module
const {
  validateMustHaves,
  PLAN_REQUIRED_FIELDS,
  PLAN_VALID_TYPES,
  validatePlan,
  validateSummary,
  validateDeviationsField,
  checkPlanWrite,
  VALID_STATE_STATUSES,
  validateState,
  validateVerification,
  checkStateWrite,
  syncStateBody,
  validateRoadmap,
  validateLearnings,
  validateConfig,
  validateResearch,
  validateContext
} = require('./lib/format-validators');

/**
 * Load and resolve the local_llm config block from .planning/config.json.
 * Returns a resolved config (always safe to use -- disabled by default on error).
 */
function loadLocalLlmConfig() {
  try {
    const configPath = path.join(process.cwd(), '.planning', 'config.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return resolveConfig(parsed.local_llm);
  } catch (_e) {
    return resolveConfig(undefined);
  }
}

async function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      // Get the file path that was written/edited
      const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

      // Determine file type
      const basename = path.basename(filePath);
      const isPlan = /^PLAN.*\.md$/.test(basename);
      const isSummary = basename.includes('SUMMARY') && basename.endsWith('.md');
      const isVerification = basename === 'VERIFICATION.md';
      const isRoadmap = basename === 'ROADMAP.md';
      const isLearnings = basename === 'LEARNINGS.md';
      const isConfig = basename === 'config.json' && filePath.includes('.planning');
      const isResearch = basename === 'RESEARCH.md';
      const isContext = basename === 'CONTEXT.md' && filePath.includes('.planning');

      if (!isPlan && !isSummary && !isVerification && !isRoadmap && !isLearnings && !isConfig && !isResearch && !isContext) {
        process.exit(0);
      }

      if (!fs.existsSync(filePath)) {
        process.exit(0);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const result = isPlan
        ? validatePlan(content, filePath)
        : isVerification
          ? validateVerification(content, filePath)
          : isRoadmap
            ? validateRoadmap(content, filePath)
            : isLearnings
              ? validateLearnings(content, filePath)
              : isConfig
                ? validateConfig(content, filePath)
                : isResearch
                  ? validateResearch(content, filePath)
                  : isContext
                    ? validateContext(content, filePath)
                    : validateSummary(content, filePath);

      // LLM advisory enrichment -- advisory only, never blocks
      if ((isPlan || isSummary) && result.errors.length === 0) {
        try {
          const llmConfig = loadLocalLlmConfig();
          const planningDir = path.join(process.cwd(), '.planning');
          const fileType = isPlan ? 'PLAN' : 'SUMMARY';
          const llmResult = await classifyArtifact(llmConfig, planningDir, content, fileType, data.session_id);
          if (llmResult && llmResult.classification) {
            const llmNote = `Local LLM: ${fileType} classified as "${llmResult.classification}" (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)${llmResult.reason ? ' — ' + llmResult.reason : ''}`;
            result.warnings.push(llmNote);
          }
        } catch (_llmErr) {
          // Never propagate LLM errors
        }
      }

      const eventType = isPlan ? 'plan-validated' : isVerification ? 'verification-validated' : isRoadmap ? 'roadmap-validated' : isLearnings ? 'learnings-validated' : isConfig ? 'config-validated' : isResearch ? 'research-validated' : isContext ? 'context-validated' : 'summary-validated';

      // Detect Write vs Edit: Write = full creation/overwrite (likely first attempt)
      const isWriteTool = (data.tool_name || '').toLowerCase() === 'write';

      if (result.errors.length > 0) {
        // On Write tool, downgrade errors to warnings to avoid false positive blocks
        if (isWriteTool) {
          const allIssues = [...result.errors, ...result.warnings];
          logHook('check-plan-format', 'PostToolUse', 'warn-downgraded', {
            file: basename,
            errors: result.errors,
            reason: 'Write tool (first creation)'
          });
          logEvent('workflow', eventType, {
            file: basename,
            status: 'warn-downgraded',
            errorCount: result.errors.length
          });

          const output = {
            additionalContext: `${basename} advisory (fix on next edit):\n${allIssues.map(i => `  - ${i}`).join('\n')}`
          };
          process.stdout.write(JSON.stringify(output));
        } else {
          // Structural errors on Edit -- block and force correction
          logHook('check-plan-format', 'PostToolUse', 'block', {
            file: basename,
            errors: result.errors
          });
          logEvent('workflow', eventType, {
            file: basename,
            status: 'block',
            errorCount: result.errors.length
          });

          const summary = `${basename} has structural errors that must be fixed.`;
          const explanation = result.errors.map(i => `  - ${i}`).join('\n') +
            (result.warnings.length > 0 ? '\n\nWarnings (non-blocking):\n' + result.warnings.map(i => `  - ${i}`).join('\n') : '');
          const remediation = 'Fix the listed issues and re-save the file.';

          const output = {
            decision: 'block',
            reason: `${summary}\n\n${explanation}\n\n${remediation}`
          };
          process.stdout.write(JSON.stringify(output));
        }
      } else if (result.warnings.length > 0) {
        // Warnings only -- non-blocking feedback
        logHook('check-plan-format', 'PostToolUse', 'warn', {
          file: basename,
          warnings: result.warnings
        });
        logEvent('workflow', eventType, {
          file: basename,
          status: 'warn',
          warningCount: result.warnings.length
        });

        const output = {
          additionalContext: `${basename} warnings:\n${result.warnings.map(i => `  - ${i}`).join('\n')}`
        };
        process.stdout.write(JSON.stringify(output));
      } else {
        // Clean pass
        logHook('check-plan-format', 'PostToolUse', 'pass', { file: basename });
        logEvent('workflow', eventType, { file: basename, status: 'pass' });
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

// Re-export validators for backward compatibility with existing tests
module.exports = {
  validateMustHaves,
  PLAN_REQUIRED_FIELDS,
  PLAN_VALID_TYPES,
  validatePlan,
  validateSummary,
  validateDeviationsField,
  checkPlanWrite,
  VALID_STATE_STATUSES,
  validateState,
  validateVerification,
  checkStateWrite,
  syncStateBody,
  validateRoadmap,
  validateLearnings,
  validateConfig,
  validateResearch,
  validateContext
};
if (require.main === module || process.argv[1] === __filename) { main(); }
