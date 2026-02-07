#!/usr/bin/env node

/**
 * PostToolUse hook (async): Validates PLAN.md XML structure.
 *
 * Checks:
 * - Each task has <name>, <files>, <action>, <verify>, <done> elements
 * - Max 3 tasks per plan
 * - Has YAML frontmatter with required fields
 *
 * Runs asynchronously (non-blocking). Issues are reported but don't prevent saving.
 */

const fs = require('fs');
const path = require('path');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);

      // Get the file path that was written/edited
      const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

      // Only check PLAN.md files
      if (!filePath.endsWith('-PLAN.md') && !filePath.endsWith('PLAN.md')) {
        process.exit(0);
      }

      if (!fs.existsSync(filePath)) {
        process.exit(0);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const issues = validatePlan(content, filePath);

      if (issues.length > 0) {
        const output = {
          message: `Plan format issues in ${path.basename(filePath)}:\n${issues.map(i => `  - ${i}`).join('\n')}`
        };
        process.stdout.write(JSON.stringify(output));
      }

      process.exit(0);
    } catch (e) {
      // Don't block on parse errors
      process.exit(0);
    }
  });
}

function validatePlan(content, filePath) {
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

module.exports = { validatePlan };
main();
