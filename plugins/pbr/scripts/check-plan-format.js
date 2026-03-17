#!/usr/bin/env node

/**
 * PostToolUse hook: Validates PLAN.md and SUMMARY.md structure.
 *
 * PLAN.md checks:
 * - Each task has <name>, <files>, <action>, <verify>, <done> elements
 * - Max 3 tasks per plan
 * - Has YAML frontmatter with required fields (phase, plan, wave, must_haves)
 *
 * SUMMARY.md checks:
 * - Has YAML frontmatter with required fields (phase, plan, status, provides, requires, key_files)
 * - key_files paths exist on disk
 * - Warns if no deferred field in frontmatter
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
const { lockedFileUpdate } = require('./pbr-tools');
const { resolveConfig } = require('./local-llm/health');
const { classifyArtifact } = require('./local-llm/operations/classify-artifact');

/**
 * Load and resolve the local_llm config block from .planning/config.json.
 * Returns a resolved config (always safe to use — disabled by default on error).
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

      if (!isPlan && !isSummary && !isVerification && !isRoadmap && !isLearnings) {
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
              : validateSummary(content, filePath);

      // LLM advisory enrichment — advisory only, never blocks
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

      const eventType = isPlan ? 'plan-validated' : isVerification ? 'verification-validated' : isRoadmap ? 'roadmap-validated' : isLearnings ? 'learnings-validated' : 'summary-validated';

      if (result.errors.length > 0) {
        // Structural errors — block and force correction
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
      } else if (result.warnings.length > 0) {
        // Warnings only — non-blocking feedback
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
      const requiredFields = ['phase', 'plan', 'wave'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          errors.push(`Frontmatter missing "${field}" field`);
        }
      }
      if (!frontmatter.includes('must_haves:')) {
        errors.push('Frontmatter missing "must_haves" field (truths/artifacts/key_links required)');
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
  const requiredElements = ['name', 'files', 'action', 'verify', 'done'];

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

      // Required fields — structural errors
      const requiredFields = ['phase', 'plan', 'status', 'provides', 'requires', 'key_files'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          errors.push(`Frontmatter missing "${field}" field`);
        }
      }

      // Optional but encouraged — warnings
      if (!frontmatter.includes('deferred:')) {
        warnings.push('Frontmatter missing "deferred" field (forces executor to consciously record scope creep)');
      }

      // Validate key_files paths exist on disk — warning only (files may not exist yet during planning)
      const keyFilesMatch = frontmatter.match(/key_files:\s*\n((?:\s+-\s+.*\n?)*)/);
      if (keyFilesMatch) {
        const lines = keyFilesMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        for (const line of lines) {
          // Parse "- path: description" or "- path" format
          const entryMatch = line.match(/^\s*-\s+"?([^":]+?)(?::.*)?"?\s*$/);
          if (entryMatch) {
            const filePortion = entryMatch[1].trim();
            if (filePortion && !fs.existsSync(filePortion)) {
              warnings.push(`key_files path not found on disk: ${filePortion}`);
            }
          }
        }
      }
    }
  }

  return { errors, warnings };
}

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

  if (!isPlan && !isSummary && !isVerification && !isRoadmap && !isLearnings) return null;
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
          : validateSummary(content, filePath);

  // LLM advisory enrichment — advisory only, never blocks
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

  const eventType = isPlan ? 'plan-validated' : isVerification ? 'verification-validated' : isRoadmap ? 'roadmap-validated' : isLearnings ? 'learnings-validated' : 'summary-validated';

  if (result.errors.length > 0) {
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
    }
  }

  return { errors, warnings };
}

function validateVerification(content, _filePath) {
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

      // Advisory: traceability fields for REQ-ID tracking (backward-compatible warnings)
      // Use word-boundary regex to avoid "satisfied:" matching inside "unsatisfied:"
      if (!/(?:^|\n)\s*satisfied:/.test(frontmatter)) {
        warnings.push('Frontmatter missing "satisfied" field — add satisfied:[] listing REQ-IDs confirmed in this phase');
      }
      if (!frontmatter.includes('unsatisfied:')) {
        warnings.push('Frontmatter missing "unsatisfied" field — add unsatisfied:[] listing REQ-IDs that failed verification');
      }
    }
  }

  return { errors, warnings };
}

/**
 * Separate STATE.md validation for use by dispatchers.
 * Kept separate from checkPlanWrite because STATE.md routing in the
 * dispatcher must happen AFTER roadmap sync (which also triggers on STATE.md).
 */
function checkStateWrite(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const basename = path.basename(filePath);
  if (basename !== 'STATE.md') return null;
  if (!fs.existsSync(filePath)) return null;

  let content = fs.readFileSync(filePath, 'utf8');
  const result = validateState(content, filePath);

  // Auto-fix frontmatter/body drift: if frontmatter current_phase differs from
  // the body's "Phase: X of Y" line, rewrite the body to match frontmatter.
  // This prevents stale status line display when the LLM updates frontmatter
  // but skips the body under cognitive load.
  const bodyFixed = syncStateBody(content, filePath);
  if (bodyFixed) {
    content = bodyFixed.content;
    result.warnings.push(bodyFixed.message);
  }

  // Line count advisory
  const lineCount = content.split('\n').length;
  if (lineCount > 150) {
    result.warnings.push(`Advisory: STATE.md exceeds 150 lines (${lineCount} lines). Consider trimming stale session data.`);
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

/**
 * Detect and fix frontmatter/body drift in STATE.md.
 * When frontmatter current_phase doesn't match the body's "Phase: X of Y",
 * rewrite the body line and persist.
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

  // Fix status drift (always, not just when phase drifted)
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
      const { buildProgressBar } = require('./lib/state');
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

/**
 * Validate ROADMAP.md structure. Returns advisory warnings only (never blocking errors).
 *
 * Checks:
 * - Has a # Roadmap heading
 * - Has at least one ## Milestone: section
 * - Each milestone has **Phases:** line
 * - Each ### Phase NN: has **Goal:**, **Provides:**, **Depends on:**
 * - Progress table (if present) has valid markdown table syntax
 *
 * @param {string} content - Full ROADMAP.md content
 * @param {string} _filePath - File path (unused)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateRoadmap(content, _filePath) {
  const errors = [];
  const warnings = [];

  // Check for # Roadmap heading
  if (!/^#\s+(Roadmap|ROADMAP)/m.test(content)) {
    warnings.push('Missing "# Roadmap" heading');
  }

  // Check for at least one ## Milestone: section
  const milestoneMatches = content.match(/^##\s+Milestone:/gm);
  if (!milestoneMatches || milestoneMatches.length === 0) {
    warnings.push('No "## Milestone:" sections found');
  } else {
    // Check each milestone has **Phases:** line
    // Split content by milestone sections
    const milestoneBlocks = content.split(/^##\s+Milestone:/m).slice(1);
    milestoneBlocks.forEach((block, idx) => {
      if (!/\*\*Phases:\*\*/.test(block)) {
        warnings.push(`Milestone ${idx + 1}: missing "**Phases:**" line`);
      }

      // Skip checklist/coverage checks for COMPLETED milestones
      const headingLine = block.split('\n')[0] || '';
      if (/--\s*COMPLETED/i.test(headingLine)) return;

      // Check for Phase Checklist (heading or checkbox lines)
      if (!/###\s+Phase Checklist/.test(block) && !/- \[[ x]\] Phase/i.test(block)) {
        warnings.push(`Milestone ${idx + 1}: missing Phase Checklist (expected "- [ ] Phase NN:" format)`);
      }

      // Check for Requirement coverage line
      if (!/\*\*Requirement coverage:\*\*/.test(block)) {
        warnings.push(`Milestone ${idx + 1}: missing "**Requirement coverage:**" line`);
      }
    });
  }

  // Check each ### Phase NN: has Goal, Provides, Depends on
  const phaseRegex = /^###\s+Phase\s+\d+:/gm;
  const phaseMatches = content.match(phaseRegex);
  if (phaseMatches) {
    const phaseBlocks = content.split(/^###\s+Phase\s+\d+:/m).slice(1);
    phaseBlocks.forEach((block, idx) => {
      // Only check up to the next ### or ## heading
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
    });
  }

  // Check Progress table syntax if present
  const progressMatch = content.match(/^##\s+Progress/m);
  if (progressMatch) {
    const afterProgress = content.substring(progressMatch.index);
    const headerLine = afterProgress.split('\n').find(l => l.includes('|') && /Plans\s*Complete/i.test(l));
    if (headerLine) {
      // Check for separator row after header
      const lines = afterProgress.split('\n');
      const headerIdx = lines.findIndex(l => l.includes('|') && /Plans\s*Complete/i.test(l));
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

/**
 * Validate LEARNINGS.md structure. Returns advisory warnings only (never blocking errors).
 *
 * Checks:
 * - Has YAML frontmatter (starts with ---)
 * - Frontmatter contains phase: field
 * - Frontmatter contains key_insights: field
 * - Frontmatter contains patterns: field
 *
 * @param {string} content - Full LEARNINGS.md content
 * @param {string} _filePath - File path (unused)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateLearnings(content, _filePath) {
  const errors = [];
  const warnings = [];

  // LEARNINGS.md is optional — all issues are warnings, never errors
  if (!content.startsWith('---')) {
    warnings.push('Missing YAML frontmatter');
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

  return { errors, warnings };
}

module.exports = { validatePlan, validateSummary, validateVerification, validateState, validateRoadmap, validateLearnings, checkPlanWrite, checkStateWrite, syncStateBody };
if (require.main === module || process.argv[1] === __filename) { main(); }
