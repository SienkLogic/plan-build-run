'use strict';

/**
 * Format validators extracted from check-plan-format.js.
 * Validates planning artifact structure (PLAN, SUMMARY, VERIFICATION, STATE,
 * ROADMAP, LEARNINGS, config.json, RESEARCH, CONTEXT).
 *
 * Each validate* function returns { errors: string[], warnings: string[] }.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');
const { logEvent } = require('../event-logger');
const { lockedFileUpdate } = require('../pbr-tools');

// ---------------------------------------------------------------------------
// Must-haves
// ---------------------------------------------------------------------------

/**
 * Validate must_haves sub-field structure within frontmatter.
 * Checks that truths, artifacts, and key_links sub-fields exist under must_haves.
 * Uses warnings (not errors) during migration period.
 *
 * @param {string} frontmatter - The frontmatter content (between --- delimiters)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateMustHaves(frontmatter) {
  const warnings = [];

  const mustHavesIdx = frontmatter.indexOf('must_haves:');
  if (mustHavesIdx === -1) return { errors: [], warnings };

  const afterMustHaves = frontmatter.substring(mustHavesIdx + 'must_haves:'.length);
  const nextKeyMatch = afterMustHaves.match(/\n[a-zA-Z_][a-zA-Z0-9_]*:/);
  const mustHavesBlock = nextKeyMatch
    ? afterMustHaves.substring(0, nextKeyMatch.index)
    : afterMustHaves;

  const requiredSubFields = ['truths', 'artifacts', 'key_links'];
  for (const subField of requiredSubFields) {
    const subFieldRegex = new RegExp(`^\\s+${subField}:`, 'm');
    if (!subFieldRegex.test(mustHavesBlock)) {
      warnings.push(`must_haves missing "${subField}" sub-field`);
    }
  }

  return { errors: [], warnings };
}

// ---------------------------------------------------------------------------
// PLAN validation
// ---------------------------------------------------------------------------

/** Canonical required fields for PLAN.md frontmatter. */
const PLAN_REQUIRED_FIELDS = ['phase', 'plan', 'wave', 'type', 'depends_on', 'files_modified', 'autonomous'];

/** Valid values for the type: field in PLAN.md frontmatter. */
const PLAN_VALID_TYPES = ['feature', 'bugfix', 'refactor', 'infrastructure', 'docs', 'chore'];

function validatePlan(content, _filePath) {
  const errors = [];
  const warnings = [];

  // Check frontmatter
  if (!content.startsWith('---')) {
    errors.push('Missing YAML frontmatter');
  } else {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) {
      errors.push('Unclosed YAML frontmatter');
    } else {
      const frontmatter = content.substring(3, frontmatterEnd);
      for (const field of PLAN_REQUIRED_FIELDS) {
        if (!frontmatter.includes(`${field}:`)) {
          errors.push(`Frontmatter missing "${field}" field`);
        }
      }

      // Validate type enum value
      const typeMatch = frontmatter.match(/^type:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (typeMatch) {
        const typeValue = typeMatch[1].trim();
        if (!PLAN_VALID_TYPES.includes(typeValue)) {
          warnings.push(`Unexpected type value: "${typeValue}" (expected: ${PLAN_VALID_TYPES.join(', ')})`);
        }
      }
      if (!frontmatter.includes('must_haves:')) {
        errors.push('Frontmatter missing "must_haves" field (truths/artifacts/key_links required)');
      } else {
        const mhResult = validateMustHaves(frontmatter);
        warnings.push(...mhResult.warnings);
      }
      // Blocking: implements:[] is required for REQ-ID traceability (Phase 66)
      if (!frontmatter.includes('implements:')) {
        errors.push('Frontmatter missing required "implements" field (use implements:[] if no requirements apply)');
      }
    }
  }

  // Count tasks
  const taskMatches = content.match(/<task\b[^>]*>/g) || [];
  const taskCount = taskMatches.length;

  if (taskCount === 0) {
    errors.push('No <task> elements found');
  } else if (taskCount > 3) {
    errors.push(`Too many tasks: ${taskCount} (max 3 per plan)`);
  }

  // Check each task has required elements
  const taskTags = content.match(/<task\b[^>]*>/g) || [];
  const taskBlocks = content.split(/<task\b[^>]*>/).slice(1);
  const requiredElements = ['name', 'read_first', 'files', 'action', 'acceptance_criteria', 'verify', 'done'];

  taskBlocks.forEach((block, index) => {
    const taskEnd = block.indexOf('</task>');
    const taskContent = taskEnd !== -1 ? block.substring(0, taskEnd) : block;

    // Skip checkpoint tasks - they have different required elements
    const taskTag = taskTags[index] || '';
    if (/\btype\s*=\s*["']?checkpoint/i.test(taskTag) || /\bcheckpoint\s*[:=]/i.test(taskTag)) {
      return; // Checkpoint tasks have different structure
    }

    for (const elem of requiredElements) {
      if (!taskContent.includes(`<${elem}>`) && !taskContent.includes(`<${elem} `)) {
        errors.push(`Task ${index + 1}: missing <${elem}> element`);
      }
    }

    // Validate read_first paths don't contain wildcards
    const readFirstMatch = taskContent.match(/<read_first>([\s\S]*?)<\/read_first>/);
    if (readFirstMatch) {
      const rfPaths = readFirstMatch[1].split(/\n/).map(l => l.trim()).filter(Boolean);
      for (const rfPath of rfPaths) {
        if (rfPath.includes('*')) {
          warnings.push(`Task ${index + 1}: read_first should use specific paths, not globs: "${rfPath}"`);
        }
      }
    }

    // Feature task validation: require <behavior> and <implementation> child elements
    if (taskContent.includes('<feature>')) {
      if (!taskContent.includes('<behavior>') && !taskContent.includes('<behavior ')) {
        errors.push(`Task ${index + 1}: feature task missing <behavior> element`);
      }
      if (!taskContent.includes('<implementation>') && !taskContent.includes('<implementation ')) {
        errors.push(`Task ${index + 1}: feature task missing <implementation> element`);
      }
    }

    // Informational: automated verify wrapper advisory
    const verifyMatch = taskContent.match(/<verify>([\s\S]*?)<\/verify>/);
    if (verifyMatch && verifyMatch[1].includes('<automated>')) {
      warnings.push(`Task ${index + 1}: uses automated verify wrapper (machine-parseable commands for auto_checkpoints mode)`);
    }
  });

  // Path traversal check: ensure <files> elements don't escape project root
  const filesTags = content.match(/<files>([\s\S]*?)<\/files>/g) || [];
  for (const filesTag of filesTags) {
    const filesContent = filesTag.replace(/<\/?files>/g, '');
    const paths = filesContent.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
    for (const p of paths) {
      if (p.includes('..') || path.isAbsolute(p.replace(/^[A-Za-z]:/, ''))) {
        warnings.push(`Path traversal risk in <files>: "${p}" — use relative paths without ".." segments`);
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// SUMMARY validation
// ---------------------------------------------------------------------------

function validateSummary(content, _filePath) {
  const errors = [];
  const warnings = [];

  // Check frontmatter
  if (!content.startsWith('---')) {
    errors.push('Missing YAML frontmatter');
  } else {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) {
      errors.push('Unclosed YAML frontmatter');
    } else {
      const frontmatter = content.substring(3, frontmatterEnd);

      // Required fields -- structural errors
      const requiredFields = ['phase', 'plan', 'status', 'provides', 'requires', 'key_files'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          errors.push(`Frontmatter missing "${field}" field`);
        }
      }

      // Optional but encouraged -- warnings
      if (!frontmatter.includes('deferred:')) {
        warnings.push('Frontmatter missing "deferred" field (forces executor to consciously record scope creep)');
      }

      // Metrics fields -- warnings only
      if (!frontmatter.includes('duration:')) {
        warnings.push('Frontmatter missing "duration" field (minutes as number — dashboard depends on this)');
      }
      if (!frontmatter.includes('requirements-completed:')) {
        warnings.push('Frontmatter missing "requirements-completed" field (array of REQ-IDs — status skill depends on this)');
      }

      // Validate key_files paths exist on disk
      const keyFilesMatch = frontmatter.match(/key_files:\s*\n((?:\s+-\s+.*\n?)*)/);
      if (keyFilesMatch) {
        const lines = keyFilesMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        for (const line of lines) {
          const entryMatch = line.match(/^\s*-\s+"?([^":]+?)(?::.*)?"?\s*$/);
          if (entryMatch) {
            const filePortion = entryMatch[1].trim();
            if (filePortion && !fs.existsSync(filePortion)) {
              warnings.push(`key_files path not found on disk: ${filePortion}`);
            }
          }
        }
      }

      // Validate deviations structure if present
      const deviationsResult = validateDeviationsField(frontmatter);
      errors.push(...deviationsResult.errors);
      warnings.push(...deviationsResult.warnings);
    }
  }

  // Body section validation — check that required template sections exist
  // Advisory only (warnings) since executors may use minimal template
  const secondDash = content.indexOf('---', 3);
  if (secondDash !== -1) {
    const body = content.substring(secondDash + 3);
    const hasWhatWasBuilt = /^##\s+What Was Built/m.test(body);
    const hasTaskResults = /^##\s+Task Results/m.test(body);
    const hasSelfCheck = /^##\s+Self-Check/m.test(body);

    if (!hasWhatWasBuilt && !hasTaskResults) {
      warnings.push('Body missing required section: "## What Was Built" or "## Task Results" (see SUMMARY.md template)');
    }
    if (!hasSelfCheck) {
      warnings.push('Body missing required section: "## Self-Check" (required per all template tiers)');
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Deviations field validation
// ---------------------------------------------------------------------------

/**
 * Validate the deviations field structure in SUMMARY.md frontmatter.
 * Deviations use a taxonomy: rule (1-4), action (auto|ask), description, justification.
 *
 * @param {string} frontmatter - The frontmatter content (between --- delimiters)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateDeviationsField(frontmatter) {
  const errors = [];
  const warnings = [];

  const deviationsIdx = frontmatter.indexOf('deviations:');
  if (deviationsIdx === -1) return { errors, warnings };

  const afterDeviations = frontmatter.substring(deviationsIdx + 'deviations:'.length);

  // Check if it's an empty/inline value
  const firstLine = afterDeviations.split(/\r?\n/)[0].trim();
  if (firstLine === '[]' || firstLine === 'none' || firstLine === '~' || firstLine === 'null') {
    return { errors, warnings };
  }

  const itemMatches = afterDeviations.match(/^\s+-\s+rule:/gm);
  if (!itemMatches) return { errors, warnings };

  const VALID_RULES = [1, 2, 3, 4];
  const VALID_ACTIONS = ['auto', 'ask'];

  const lines = afterDeviations.split(/\r?\n/);
  let currentItem = null;
  const items = [];

  for (const line of lines) {
    if (/^\s+-\s+rule:/.test(line)) {
      if (currentItem) items.push(currentItem);
      currentItem = { raw: line };
      const ruleMatch = line.match(/rule:\s*(\d+)/);
      if (ruleMatch) currentItem.rule = parseInt(ruleMatch[1], 10);
    } else if (currentItem) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*:/.test(line)) break;
      const actionMatch = line.match(/^\s+action:\s*["']?(\w+)/);
      if (actionMatch) currentItem.action = actionMatch[1];
      const descMatch = line.match(/^\s+description:/);
      if (descMatch) currentItem.hasDescription = true;
    }
  }
  if (currentItem) items.push(currentItem);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.rule !== undefined && !VALID_RULES.includes(item.rule)) {
      errors.push(`deviations[${i}]: invalid rule "${item.rule}" (must be 1-4)`);
    }
    if (item.action && !VALID_ACTIONS.includes(item.action)) {
      errors.push(`deviations[${i}]: invalid action "${item.action}" (must be auto|ask)`);
    }
    if (!item.hasDescription) {
      warnings.push(`deviations[${i}]: missing "description" field`);
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// checkPlanWrite (dispatcher entry point)
// ---------------------------------------------------------------------------

/**
 * Core plan/summary check logic for use by dispatchers.
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @returns {Promise<null|{output: Object}>} null if pass or not applicable, result otherwise
 */
async function checkPlanWrite(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const basename = path.basename(filePath);
  const isPlan = /^PLAN.*\.md$/.test(basename);
  const isSummary = basename.includes('SUMMARY') && basename.endsWith('.md');
  const isVerification = basename === 'VERIFICATION.md';
  const isRoadmap = basename === 'ROADMAP.md';
  const isLearnings = basename === 'LEARNINGS.md';
  const isConfig = basename === 'config.json' && filePath.includes('.planning');
  const isResearch = basename === 'RESEARCH.md';
  const isContext = basename === 'CONTEXT.md' && filePath.includes('.planning');

  if (!isPlan && !isSummary && !isVerification && !isRoadmap && !isLearnings && !isConfig && !isResearch && !isContext) return null;

  // Todo 015: First-write awareness -- downgrade errors to warnings on Write
  // PostToolUse runs AFTER the write, so fs.existsSync() always returns true.
  // Instead, detect Write vs Edit via tool_name: Write = full file creation/overwrite
  // (likely first attempt), Edit = modifying existing content (refinement).
  // On Write, downgrade blocking errors to advisory warnings so agents aren't
  // blocked on first attempt, reducing false positive block-and-retry cycles.
  const isWriteTool = (data.tool_name || '').toLowerCase() === 'write';

  if (!fs.existsSync(filePath)) return null;

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
      const { resolveConfig } = require('../local-llm/health');
      const { classifyArtifact } = require('../local-llm/operations/classify-artifact');
      let llmConfig;
      try {
        const configPath = path.join(process.cwd(), '.planning', 'config.json');
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        llmConfig = resolveConfig(parsed.local_llm);
      } catch (_e) {
        llmConfig = resolveConfig(undefined);
      }
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

  if (result.errors.length > 0) {
    // On Write tool (first creation), downgrade errors to warnings.
    // The agent will see the advisory and can fix on next Edit without
    // wasting a block-and-retry cycle.
    if (isWriteTool) {
      const allIssues = [...result.errors, ...result.warnings];
      logHook('check-plan-format', 'PostToolUse', 'warn-downgraded', { file: basename, errors: result.errors, reason: 'Write tool (first creation)' });
      logEvent('workflow', eventType, { file: basename, status: 'warn-downgraded', errorCount: result.errors.length });
      return { output: { additionalContext: `${basename} advisory (fix on next edit):\n${allIssues.map(i => `  - ${i}`).join('\n')}` } };
    }

    logHook('check-plan-format', 'PostToolUse', 'block', { file: basename, errors: result.errors });
    logEvent('workflow', eventType, { file: basename, status: 'block', errorCount: result.errors.length });

    const summary = `${basename} has structural errors that must be fixed.`;
    const explanation = result.errors.map(i => `  - ${i}`).join('\n') +
      (result.warnings.length > 0 ? '\n\nWarnings (non-blocking):\n' + result.warnings.map(i => `  - ${i}`).join('\n') : '');
    const remediation = 'Fix the listed issues and re-save the file.';
    return { output: { decision: 'block', reason: `${summary}\n\n${explanation}\n\n${remediation}` } };
  }

  if (result.warnings.length > 0) {
    logHook('check-plan-format', 'PostToolUse', 'warn', { file: basename, warnings: result.warnings });
    logEvent('workflow', eventType, { file: basename, status: 'warn', warningCount: result.warnings.length });
    return { output: { additionalContext: `${basename} warnings:\n${result.warnings.map(i => `  - ${i}`).join('\n')}` } };
  }

  logHook('check-plan-format', 'PostToolUse', 'pass', { file: basename });
  logEvent('workflow', eventType, { file: basename, status: 'pass' });
  return null;
}

// ---------------------------------------------------------------------------
// STATE validation
// ---------------------------------------------------------------------------

/** All valid STATE.md status values (13 canonical + legacy aliases). */
const VALID_STATE_STATUSES = [
  'not_started', 'discussed', 'ready_to_plan', 'planning',
  'planned', 'ready_to_execute', 'building', 'built',
  'partial', 'verified', 'needs_fixes', 'complete', 'skipped',
  // Legacy aliases
  'pending', 'reviewed', 'milestone_complete'
];

function validateState(content, _filePath) {
  const errors = [];
  const warnings = [];

  // STATE.md uses warnings (not errors) because it's written by multiple hooks
  // and auto-sync processes. Blocking would create feedback loops.
  if (!content.startsWith('---')) {
    warnings.push('Missing YAML frontmatter');
  } else {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) {
      warnings.push('Unclosed YAML frontmatter');
    } else {
      const frontmatter = content.substring(3, frontmatterEnd);
      const requiredFields = ['version', 'current_phase', 'phase_slug', 'status'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          warnings.push(`Frontmatter missing "${field}" field`);
        }
      }

      // Validate status value against the 13-state lifecycle + legacy aliases
      const statusMatch = frontmatter.match(/^status:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (statusMatch) {
        const statusValue = statusMatch[1].trim();
        if (!VALID_STATE_STATUSES.includes(statusValue)) {
          warnings.push(`Unknown status value: "${statusValue}" (valid: ${VALID_STATE_STATUSES.slice(0, 13).join(', ')})`);
        }
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// VERIFICATION validation
// ---------------------------------------------------------------------------

function validateVerification(content, filePath) {
  const errors = [];
  const warnings = [];

  if (!content.startsWith('---')) {
    errors.push('Missing YAML frontmatter');
  } else {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) {
      errors.push('Unclosed YAML frontmatter');
    } else {
      const frontmatter = content.substring(3, frontmatterEnd);
      const requiredFields = ['status', 'phase', 'checked_at', 'must_haves_checked', 'must_haves_passed', 'must_haves_failed'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          errors.push(`Frontmatter missing "${field}" field`);
        }
      }

      // Advisory: traceability fields
      if (!/(?:^|\n)\s*satisfied:/.test(frontmatter)) {
        warnings.push('Frontmatter missing "satisfied" field — add satisfied:[] listing REQ-IDs confirmed in this phase');
      }
      if (!frontmatter.includes('unsatisfied:')) {
        warnings.push('Frontmatter missing "unsatisfied" field — add unsatisfied:[] listing REQ-IDs that failed verification');
      }

      // Advisory: fix_plans field when gaps are found
      const statusMatch = frontmatter.match(/^status:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      const hasGaps = statusMatch && statusMatch[1].trim() === 'gaps_found';
      if (hasGaps && !frontmatter.includes('fix_plans:')) {
        warnings.push('Frontmatter has status "gaps_found" but no "fix_plans" field — add fix_plans with gap/effort/tasks for each gap');
      }

      // Advisory: gap severity classification
      const gapsFoundMatch = frontmatter.match(/gaps_found:\s*(\d+)/);
      if (gapsFoundMatch && parseInt(gapsFoundMatch[1], 10) > 0) {
        if (!frontmatter.includes('severity:') && !frontmatter.includes('gap_severity:')) {
          warnings.push('Gaps found but no severity classification — add severity (critical|non-critical) to gap entries');
        }
      }

      // Advisory: must_haves_checked: 0 with PLAN files that have must-haves
      const mustHavesCheckedMatch = frontmatter.match(/must_haves_checked:\s*(\d+)/);
      if (mustHavesCheckedMatch && parseInt(mustHavesCheckedMatch[1], 10) === 0 && filePath) {
        try {
          const phaseDir = path.dirname(filePath);
          const planFiles = fs.readdirSync(phaseDir).filter(f => /^PLAN.*\.md$/i.test(f));
          let totalMustHaves = 0;
          for (const pf of planFiles) {
            try {
              const planContent = fs.readFileSync(path.join(phaseDir, pf), 'utf8');
              const pfmEnd = planContent.indexOf('---', 3);
              if (pfmEnd !== -1) {
                const pfm = planContent.substring(3, pfmEnd);
                // Count non-empty truths and artifacts entries
                const truthsMatch = pfm.match(/truths:\s*\n((?:\s+-\s+.+\n)*)/);
                const artifactsMatch = pfm.match(/artifacts:\s*\n((?:\s+-\s+.+\n)*)/);
                if (truthsMatch && truthsMatch[1].trim()) totalMustHaves += truthsMatch[1].trim().split('\n').length;
                if (artifactsMatch && artifactsMatch[1].trim()) totalMustHaves += artifactsMatch[1].trim().split('\n').length;
              }
            } catch (_planErr) { /* best-effort */ }
          }
          if (totalMustHaves > 0) {
            warnings.push(`VERIFICATION.md has must_haves_checked: 0 but phase has ${totalMustHaves} must-haves in PLAN files. Run /pbr:verify-work to check them.`);
          }
        } catch (_dirErr) { /* best-effort — phase dir may not exist */ }
      }
    }
  }

  // Body section validation — check that required template sections exist
  // Advisory only (warnings) since verifier output may vary
  const secondDash = content.indexOf('---', 3);
  if (secondDash !== -1) {
    const body = content.substring(secondDash + 3);
    const hasObservableTruths = /^##\s+Observable Truths/m.test(body);
    const hasMustHaveVerification = /^##\s+Must-Have Verification/m.test(body);
    const hasArtifactVerification = /^##\s+Artifact Verification/m.test(body);
    const hasSummary = /^##\s+Summary/m.test(body);

    if (!hasObservableTruths && !hasMustHaveVerification && !hasArtifactVerification) {
      warnings.push('Body missing required section: "## Observable Truths", "## Must-Have Verification", or "## Artifact Verification" (see VERIFICATION template)');
    }
    if (!hasSummary) {
      warnings.push('Body missing required section: "## Summary" (see VERIFICATION template)');
    }

    // If status is gaps_found, check for a Gaps section
    const fmEnd = content.indexOf('---', 3);
    if (fmEnd !== -1) {
      const fm = content.substring(3, fmEnd);
      const statusMatch = fm.match(/^status:\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (statusMatch && statusMatch[1].trim() === 'gaps_found') {
        const hasGapsSection = /^##\s+(Gaps|Critical Gaps|Gap \d)/m.test(body);
        if (!hasGapsSection) {
          warnings.push('Status is "gaps_found" but body missing "## Gaps", "## Critical Gaps", or "## Gap N" section');
        }
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// checkStateWrite (dispatcher entry point)
// ---------------------------------------------------------------------------

/**
 * Separate STATE.md validation for use by dispatchers.
 * Kept separate from checkPlanWrite because STATE.md routing in the
 * dispatcher must happen AFTER roadmap sync.
 */
function checkStateWrite(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const basename = path.basename(filePath);
  if (basename !== 'STATE.md') return null;
  if (!fs.existsSync(filePath)) return null;

  let content = fs.readFileSync(filePath, 'utf8');
  const result = validateState(content, filePath);

  // Auto-fix frontmatter/body drift
  const bodyFixed = syncStateBody(content, filePath);
  if (bodyFixed) {
    content = bodyFixed.content;
    result.warnings.push(bodyFixed.message);
  }

  // Line count advisory
  const lineCount = content.split('\n').length;
  if (lineCount > 100) {
    result.warnings.push(`Advisory: STATE.md exceeds 100-line cap (${lineCount} lines). Move history entries older than the current milestone to PROJECT.md or archive.`);
  }

  if (result.warnings.length > 0) {
    logHook('check-plan-format', 'PostToolUse', 'warn', { file: basename, warnings: result.warnings });
    logEvent('workflow', 'state-validated', { file: basename, status: 'warn', warningCount: result.warnings.length });
    return { output: { additionalContext: `${basename} warnings:\n${result.warnings.map(i => `  - ${i}`).join('\n')}` } };
  }

  logHook('check-plan-format', 'PostToolUse', 'pass', { file: basename });
  logEvent('workflow', 'state-validated', { file: basename, status: 'pass' });
  return null;
}

// ---------------------------------------------------------------------------
// syncStateBody
// ---------------------------------------------------------------------------

/**
 * Detect and fix frontmatter/body drift in STATE.md.
 *
 * @param {string} content - Full STATE.md content
 * @param {string} filePath - Absolute path to STATE.md
 * @returns {null|{content: string, message: string}} null if in sync, otherwise the fixed content + message
 */
function syncStateBody(content, filePath) {
  if (!content.startsWith('---')) return null;
  const fmEnd = content.indexOf('---', 3);
  if (fmEnd === -1) return null;

  const fm = content.substring(3, fmEnd);
  const fmPhaseMatch = fm.match(/^current_phase:\s*(\d+)/m);
  const fmSlugMatch = fm.match(/^phase_slug:\s*"?([^"\r\n]+)"?/m);
  const fmNameMatch = fm.match(/^phase_name:\s*"?([^"\r\n]+)"?/m);
  const fmStatusMatch = fm.match(/^status:\s*"?([^"\r\n]+)"?/m);
  const fmPlansMatch = fm.match(/^plans_complete:\s*(\d+)/m);
  const fmProgressMatch = fm.match(/^progress_percent:\s*(\d+)/m);
  const fmActivityMatch = fm.match(/^last_activity:\s*"?([^"\r\n]+)"?/m);

  if (!fmPhaseMatch) return null;

  const fmPhase = fmPhaseMatch[1];
  const fmName = fmSlugMatch ? fmSlugMatch[1] : (fmNameMatch ? fmNameMatch[1] : null);
  const fmStatus = fmStatusMatch ? fmStatusMatch[1] : null;
  const fmPlans = fmPlansMatch ? fmPlansMatch[1] : null;
  const fmProgress = fmProgressMatch ? parseInt(fmProgressMatch[1], 10) : null;
  const fmActivity = fmActivityMatch ? fmActivityMatch[1] : null;

  const bodyPhaseMatch = content.match(/^Phase:\s*(\d+)\s*of\s*(\d+)/m);
  const bodyStatusMatch = content.match(/^Status:\s*(.+)/m);
  const bodyPlansMatch = content.match(/^Plan:\s*(\d+)\s+of\s+(\d+)/m);
  const bodyProgressMatch = content.match(/^Progress:\s*.*?(\d+)%/m);
  const bodyActivityMatch = content.match(/^Last activity:\s*(.+)/im);

  const drifts = [];
  let updated = content;

  // Fix phase line drift
  if (bodyPhaseMatch && bodyPhaseMatch[1] !== fmPhase) {
    const bodyTotal = bodyPhaseMatch[2];
    const newPhaseLine = bodyTotal
      ? (fmName ? `Phase: ${fmPhase} of ${bodyTotal} (${fmName})` : `Phase: ${fmPhase} of ${bodyTotal}`)
      : `Phase: ${fmPhase}`;
    updated = updated.replace(/^Phase:\s*\d+\s*of\s*\d+.*/m, newPhaseLine);
    drifts.push(`phase ${bodyPhaseMatch[1]}→${fmPhase}`);
  }

  // Fix status drift
  if (fmStatus && bodyStatusMatch) {
    const displayStatus = fmStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const bodyStatus = bodyStatusMatch[1].trim();
    if (bodyStatus.toLowerCase() !== displayStatus.toLowerCase()) {
      updated = updated.replace(/^Status:\s*.+/m, `Status: ${displayStatus}`);
      drifts.push(`status ${bodyStatus}→${displayStatus}`);
    }
  }

  // Fix plans_complete drift
  if (fmPlans !== null && bodyPlansMatch && bodyPlansMatch[1] !== fmPlans) {
    updated = updated.replace(/^(Plan:\s*)\d+/m, `$1${fmPlans}`);
    drifts.push(`plans ${bodyPlansMatch[1]}→${fmPlans}`);
  }

  // Fix progress_percent drift
  if (fmProgress !== null && bodyProgressMatch) {
    const bodyPct = parseInt(bodyProgressMatch[1], 10);
    if (bodyPct !== fmProgress) {
      const { buildProgressBar } = require('./state');
      updated = updated.replace(/^Progress:\s*.+/m, `Progress: ${buildProgressBar(fmProgress)}`);
      drifts.push(`progress ${bodyPct}%→${fmProgress}%`);
    }
  }

  // Fix last_activity drift
  if (fmActivity && bodyActivityMatch) {
    const bodyActivity = bodyActivityMatch[1].trim();
    if (bodyActivity !== fmActivity && !bodyActivity.startsWith(fmActivity)) {
      updated = updated.replace(/^(Last activity:\s*).+/im, `$1${fmActivity}`);
      drifts.push('last_activity');
    }
  }

  if (drifts.length === 0) return null;

  try {
    lockedFileUpdate(filePath, () => updated);
    logHook('check-plan-format', 'PostToolUse', 'body-sync', { drifts });
    return {
      content: updated,
      message: `Auto-fixed body drift: ${drifts.join(', ')} (body now matches frontmatter)`
    };
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ROADMAP validation
// ---------------------------------------------------------------------------

/**
 * Validate ROADMAP.md structure.
 *
 * @param {string} content - Full ROADMAP.md content
 * @param {string} _filePath - File path (unused)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateRoadmap(content, _filePath) {
  const errors = [];
  const warnings = [];

  if (!/^#\s+(Roadmap|ROADMAP|Project Roadmap)(:\s*.+)?$/m.test(content)) {
    errors.push('Missing "# Roadmap" heading');
  }

  // Strip <details>/<summary> HTML tags
  const strippedContent = content
    .replace(/<\/?details>/gi, '')
    .replace(/<\/?summary>/gi, '');

  const milestoneMatches = strippedContent.match(/^##\s+Milestone:/gm);
  if (!milestoneMatches || milestoneMatches.length === 0) {
    errors.push('No "## Milestone:" sections found');
  } else {
    const milestoneBlocks = strippedContent.split(/^##\s+Milestone:/m).slice(1);
    milestoneBlocks.forEach((block, idx) => {
      const headingLine = block.split('\n')[0] || '';

      // Skip all structural checks for completed milestones (collapsed format)
      if (/--\s*COMPLETED/i.test(headingLine)) return;

      if (!/\*\*Phases:\*\*/.test(block)) {
        warnings.push(`Milestone ${idx + 1}: missing "**Phases:**" line`);
      }

      if (!/###\s+Phase Checklist/.test(block) && !/- \[[ x]\] Phase/i.test(block)) {
        warnings.push(`Milestone ${idx + 1}: missing Phase Checklist (expected "- [ ] Phase NN:" format)`);
      }

      if (!/\*\*Requirement coverage:\*\*/.test(block)) {
        warnings.push(`Milestone ${idx + 1}: missing "**Requirement coverage:**" line`);
      }
    });
  }

  // Check each ### Phase NN: (only in active milestones)
  // Extract content from active milestones only (skip COMPLETED blocks)
  const activeMilestoneContent = strippedContent.split(/^##\s+Milestone:/m).slice(1)
    .filter(block => {
      const headingLine = block.split('\n')[0] || '';
      return !/--\s*COMPLETED/i.test(headingLine);
    })
    .join('\n');

  const phaseRegex = /^###\s+Phase\s+\d+:/gm;
  const phaseMatches = activeMilestoneContent.match(phaseRegex);
  if (phaseMatches) {
    const phaseBlocks = activeMilestoneContent.split(/^###\s+Phase\s+\d+:/m).slice(1);
    phaseBlocks.forEach((block, idx) => {
      const nextHeading = block.search(/^#{2,3}\s+/m);
      const section = nextHeading !== -1 ? block.substring(0, nextHeading) : block;

      if (!/\*\*Goal:\*\*/.test(section)) {
        warnings.push(`Phase ${idx + 1}: missing "**Goal:**"`);
      }
      if (!/\*\*Provides:\*\*/.test(section)) {
        warnings.push(`Phase ${idx + 1}: missing "**Provides:**"`);
      }
      if (!/\*\*Depends on:\*\*/.test(section)) {
        warnings.push(`Phase ${idx + 1}: missing "**Depends on:**"`);
      }
      if (!/\*\*Requirements:\*\*/.test(section)) {
        warnings.push(`Phase ${idx + 1}: missing "**Requirements:**" (recommended for GSD alignment)`);
      }
      if (!/\*\*Success Criteria:\*\*/.test(section)) {
        warnings.push(`Phase ${idx + 1}: missing "**Success Criteria:**" (recommended for GSD alignment)`);
      }
    });
  }

  // Check Progress table syntax
  const progressMatch = strippedContent.match(/^##\s+Progress/m);
  if (progressMatch) {
    const afterProgress = strippedContent.substring(progressMatch.index);
    const headerLine = afterProgress.split('\n').find(l => l.includes('|') && /Plans?\s*Complete/i.test(l));
    if (headerLine) {
      const lines = afterProgress.split('\n');
      const headerIdx = lines.findIndex(l => l.includes('|') && /Plans?\s*Complete/i.test(l));
      if (headerIdx >= 0 && headerIdx + 1 < lines.length) {
        const sepLine = lines[headerIdx + 1];
        if (!/^\s*\|[\s-:|]+\|\s*$/.test(sepLine)) {
          warnings.push('Progress table: missing or malformed separator row (expected |---|---|...)');
        }
      }
    } else {
      warnings.push('Progress table: header row with "Plans Complete" column not found');
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// LEARNINGS validation
// ---------------------------------------------------------------------------

/**
 * Validate LEARNINGS.md structure.
 * DEPRECATED: Per-phase LEARNINGS.md is deprecated in favor of .planning/KNOWLEDGE.md.
 */
function validateLearnings(content, _filePath) {
  const errors = [];
  const warnings = [];

  warnings.push('Per-phase LEARNINGS.md is deprecated. Use project-scoped .planning/KNOWLEDGE.md instead.');

  if (!content.startsWith('---')) {
    warnings.push('Missing YAML frontmatter (recommended: phase, key_insights, patterns)');
    return { errors, warnings };
  }

  const frontmatterEnd = content.indexOf('---', 3);
  if (frontmatterEnd === -1) {
    warnings.push('Unclosed YAML frontmatter');
    return { errors, warnings };
  }

  const frontmatter = content.substring(3, frontmatterEnd);

  if (!frontmatter.includes('phase:')) {
    warnings.push('Frontmatter missing "phase" field');
  }
  if (!frontmatter.includes('key_insights:')) {
    warnings.push('Frontmatter missing "key_insights" field');
  }
  if (!frontmatter.includes('patterns:')) {
    warnings.push('Frontmatter missing "patterns" field');
  }

  const crossProjectMatch = frontmatter.match(/cross_project:\s*(.+)/);
  if (crossProjectMatch) {
    const value = crossProjectMatch[1].trim();
    if (value !== 'true' && value !== 'false') {
      warnings.push('cross_project field should be "true" or "false"');
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/**
 * Validate .planning/config.json structure.
 */
function validateConfig(content, _filePath) {
  const errors = [];
  const warnings = [];

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    errors.push(`Invalid JSON: ${e.message}`);
    return { errors, warnings };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('config.json must be a JSON object (not array or primitive)');
    return { errors, warnings };
  }

  if (parsed.depth !== undefined) {
    if (!['quick', 'standard', 'comprehensive'].includes(parsed.depth)) {
      warnings.push(`Unexpected depth value: "${parsed.depth}" (expected: quick, standard, or comprehensive)`);
    }
  }

  const knownKeys = ['version', 'schema_version', 'context_strategy', 'mode', 'depth', 'session_phase_limit', 'session_cycling', 'context_window_tokens', 'agent_checkpoint_pct', 'features', 'validation_passes', 'autonomy', 'models', 'model_profiles', 'parallelization', 'teams', 'planning', 'git', 'gates', 'safety', 'timeouts', 'hooks', 'prd', 'depth_profiles', 'debug', 'developer_profile', 'spinner_tips', 'dashboard', 'status_line', 'workflow', 'hook_server', 'local_llm', 'intel', 'context_ledger', 'learnings', 'verification', 'context_budget', 'ui', 'worktree', 'ceremony_level', 'skip_rag_max_lines', 'orchestrator_budget_pct'];
  for (const key of Object.keys(parsed)) {
    if (!knownKeys.includes(key)) {
      warnings.push(`Unknown top-level key: "${key}" (known: ${knownKeys.join(', ')})`);
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// RESEARCH validation
// ---------------------------------------------------------------------------

/**
 * Validate RESEARCH.md structure.
 */
function validateResearch(content, _filePath) {
  const errors = [];
  const warnings = [];

  if (!content.startsWith('---')) {
    errors.push('Missing YAML frontmatter (required: confidence, sources_checked)');
    return { errors, warnings };
  }

  const frontmatterEnd = content.indexOf('---', 3);
  if (frontmatterEnd === -1) {
    errors.push('Unclosed YAML frontmatter');
    return { errors, warnings };
  }

  const frontmatter = content.substring(3, frontmatterEnd);

  if (!/confidence\s*:/i.test(frontmatter)) {
    errors.push('Frontmatter missing "confidence" field (expected: high, medium, or low)');
  }
  if (!/sources_checked\s*:/i.test(frontmatter)) {
    errors.push('Frontmatter missing "sources_checked" field');
  }

  if (!frontmatter.includes('phase:')) {
    warnings.push('Frontmatter missing "phase" field — recommended for phase-level research');
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// CONTEXT validation
// ---------------------------------------------------------------------------

/**
 * Validate CONTEXT.md structure.
 */
function validateContext(content, _filePath) {
  const errors = [];
  const warnings = [];

  if (!content || content.trim().length === 0) {
    errors.push('CONTEXT.md is empty — expected frontmatter and section content');
    return { errors, warnings };
  }

  if (!/<domain>/i.test(content) && !/^##\s+Domain/mi.test(content)) {
    warnings.push('Missing <domain> section (or ## Domain heading) — recommended for phase context');
  }

  if (!/<decisions>/i.test(content) && !/^##\s+(Locked\s+)?Decisions/mi.test(content)) {
    warnings.push('Missing <decisions> section (or ## Decisions heading) — recommended for locked decisions');
  }

  if (!/<canonical_refs>/i.test(content) && !/^##\s+Canonical\s+Ref/mi.test(content)) {
    warnings.push('Missing <canonical_refs> section (or ## Canonical References heading) — recommended for reference docs');
  }

  if (!/<deferred>/i.test(content) && !/^##\s+Deferred/mi.test(content)) {
    warnings.push('Missing <deferred> section (or ## Deferred heading) — recommended for excluded scope');
  }

  if (!/<specifics>/i.test(content) && !/^##\s+Specific\s+Ref/mi.test(content)) {
    warnings.push('Missing <specifics> section (or ## Specific References heading) — recommended for GSD alignment');
  }

  if (!/<code_context>/i.test(content) && !/^##\s+Code\s+(Patterns?|Context)/mi.test(content)) {
    warnings.push('Missing <code_context> section (or ## Code Patterns heading) — recommended for GSD alignment');
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
