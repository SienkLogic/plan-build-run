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

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      // Get the file path that was written/edited
      const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

      // Determine file type
      const basename = path.basename(filePath);
      const isPlan = basename.endsWith('PLAN.md');
      const isSummary = basename.includes('SUMMARY') && basename.endsWith('.md');

      if (!isPlan && !isSummary) {
        process.exit(0);
      }

      if (!fs.existsSync(filePath)) {
        process.exit(0);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const result = isPlan
        ? validatePlan(content, filePath)
        : validateSummary(content, filePath);

      const eventType = isPlan ? 'plan-validated' : 'summary-validated';

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

        const parts = [`${basename} has structural errors that must be fixed:`];
        parts.push(...result.errors.map(i => `  - ${i}`));

        if (result.warnings.length > 0) {
          parts.push('');
          parts.push('Warnings (non-blocking):');
          parts.push(...result.warnings.map(i => `  - ${i}`));
        }

        const output = {
          decision: 'block',
          reason: parts.join('\n')
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
    if (taskTag.includes('checkpoint')) {
      return; // Checkpoint tasks have different structure
    }

    for (const elem of requiredElements) {
      if (!taskContent.includes(`<${elem}>`) && !taskContent.includes(`<${elem} `)) {
        errors.push(`Task ${index + 1}: missing <${elem}> element`);
      }
    }
  });

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
 * @returns {null|{output: Object}} null if pass or not applicable, result otherwise
 */
function checkPlanWrite(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  const basename = path.basename(filePath);
  const isPlan = basename.endsWith('PLAN.md');
  const isSummary = basename.includes('SUMMARY') && basename.endsWith('.md');

  if (!isPlan && !isSummary) return null;
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf8');
  const result = isPlan
    ? validatePlan(content, filePath)
    : validateSummary(content, filePath);

  const eventType = isPlan ? 'plan-validated' : 'summary-validated';

  if (result.errors.length > 0) {
    logHook('check-plan-format', 'PostToolUse', 'block', { file: basename, errors: result.errors });
    logEvent('workflow', eventType, { file: basename, status: 'block', errorCount: result.errors.length });

    const parts = [`${basename} has structural errors that must be fixed:`];
    parts.push(...result.errors.map(i => `  - ${i}`));
    if (result.warnings.length > 0) {
      parts.push('', 'Warnings (non-blocking):');
      parts.push(...result.warnings.map(i => `  - ${i}`));
    }
    return { output: { decision: 'block', reason: parts.join('\n') } };
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

module.exports = { validatePlan, validateSummary, checkPlanWrite };
if (require.main === module || process.argv[1] === __filename) { main(); }
