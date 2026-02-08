#!/usr/bin/env node

/**
 * PostToolUse hook (async): Validates PLAN.md and SUMMARY.md structure.
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
 * Runs asynchronously (non-blocking). Issues are reported but don't prevent saving.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

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
      const issues = isPlan
        ? validatePlan(content, filePath)
        : validateSummary(content, filePath);

      if (issues.length > 0) {
        logHook('check-plan-format', 'PostToolUse', 'warn', { file: path.basename(filePath), issues });
        const output = {
          message: `Plan format issues in ${path.basename(filePath)}:\n${issues.map(i => `  - ${i}`).join('\n')}`
        };
        process.stdout.write(JSON.stringify(output));
      } else {
        logHook('check-plan-format', 'PostToolUse', 'pass', { file: path.basename(filePath) });
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

function validatePlan(content, _filePath) {
  const issues = [];

  // Check frontmatter
  if (!content.startsWith('---')) {
    issues.push('Missing YAML frontmatter');
  } else {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) {
      issues.push('Unclosed YAML frontmatter');
    } else {
      const frontmatter = content.substring(3, frontmatterEnd);
      const requiredFields = ['phase', 'plan', 'wave'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          issues.push(`Frontmatter missing "${field}" field`);
        }
      }
      if (!frontmatter.includes('must_haves:')) {
        issues.push('Frontmatter missing "must_haves" field (truths/artifacts/key_links required)');
      }
    }
  }

  // Count tasks
  const taskMatches = content.match(/<task\b[^>]*>/g) || [];
  const taskCount = taskMatches.length;

  if (taskCount === 0) {
    issues.push('No <task> elements found');
  } else if (taskCount > 3) {
    issues.push(`Too many tasks: ${taskCount} (max 3 per plan)`);
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
        issues.push(`Task ${index + 1}: missing <${elem}> element`);
      }
    }
  });

  return issues;
}

function validateSummary(content, _filePath) {
  const issues = [];

  // Check frontmatter
  if (!content.startsWith('---')) {
    issues.push('Missing YAML frontmatter');
  } else {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) {
      issues.push('Unclosed YAML frontmatter');
    } else {
      const frontmatter = content.substring(3, frontmatterEnd);

      // Required fields
      const requiredFields = ['phase', 'plan', 'status', 'provides', 'requires', 'key_files'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          issues.push(`Frontmatter missing "${field}" field`);
        }
      }

      // Warn if no deferred field
      if (!frontmatter.includes('deferred:')) {
        issues.push('Frontmatter missing "deferred" field (forces executor to consciously record scope creep)');
      }

      // Validate key_files paths exist on disk
      const keyFilesMatch = frontmatter.match(/key_files:\s*\n((?:\s+-\s+.*\n?)*)/);
      if (keyFilesMatch) {
        const lines = keyFilesMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
        for (const line of lines) {
          // Parse "- path: description" or "- path" format
          const entryMatch = line.match(/^\s*-\s+"?([^":]+?)(?::.*)?"?\s*$/);
          if (entryMatch) {
            const filePortion = entryMatch[1].trim();
            if (filePortion && !fs.existsSync(filePortion)) {
              issues.push(`key_files path not found on disk: ${filePortion}`);
            }
          }
        }
      }
    }
  }

  return issues;
}

module.exports = { validatePlan, validateSummary };
main();
