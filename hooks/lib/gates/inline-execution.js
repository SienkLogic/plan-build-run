'use strict';

/**
 * Gate: inline execution decision.
 * Determines whether a plan can be executed inline (in the orchestrator's
 * context) rather than spawning a Task() subagent.
 *
 * Conditions for inline execution:
 *   1. config.workflow.inline_execution is truthy
 *   2. contextPct < config.workflow.inline_context_cap_pct (HARD CAP, checked first)
 *   3. Task count <= config.workflow.inline_max_tasks
 *   4. ALL tasks have complexity="simple"
 */

const fs = require('fs');

const DEFAULT_MAX_TASKS = 2;
const DEFAULT_CONTEXT_CAP_PCT = 40;
const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_LINES = 50;

// Lines-per-task estimation by complexity
const LINES_PER_COMPLEXITY = {
  simple: 20,
  medium: 80,
  complex: 200,
  unknown: 100
};

/**
 * Parse plan content string to extract task metadata.
 * Returns array of { id, complexity, name } objects.
 * @param {string} planContent - raw plan file content
 * @returns {Array<{ id: string, complexity: string, name: string }>}
 */
function parsePlanTasks(planContent) {
  const tasks = [];
  // Match <task ...> opening tags and extract attributes
  const taskRegex = /<task\s+([^>]*)>/g;
  let match;

  while ((match = taskRegex.exec(planContent)) !== null) {
    const attrs = match[1];
    const idMatch = attrs.match(/id="([^"]*)"/);
    const complexityMatch = attrs.match(/complexity="([^"]*)"/);

    // Extract name from <name>...</name> after this task tag
    const afterTag = planContent.slice(match.index);
    const nameMatch = afterTag.match(/<name>([\s\S]*?)<\/name>/);

    tasks.push({
      id: idMatch ? idMatch[1] : '',
      complexity: complexityMatch ? complexityMatch[1] : 'unknown',
      name: nameMatch ? nameMatch[1].trim() : ''
    });
  }

  return tasks;
}

/**
 * Parse plan content to extract YAML frontmatter fields.
 * Returns an object with at least `files_modified` (array of strings).
 * @param {string} planContent - raw plan file content
 * @returns {{ files_modified: string[] }}
 */
function parsePlanFrontmatter(planContent) {
  const result = { files_modified: [] };
  const fmMatch = planContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];
  // Extract files_modified array (YAML list format)
  const filesSection = fm.match(/files_modified:\s*\n((?:\s+-\s+.*\n?)*)/);
  if (filesSection) {
    const items = filesSection[1].match(/^\s+-\s+"?([^"\n]+)"?\s*$/gm);
    if (items) {
      result.files_modified = items.map(line => {
        const m = line.match(/^\s+-\s+"?([^"\n]+?)"?\s*$/);
        return m ? m[1] : '';
      }).filter(Boolean);
    }
  }

  return result;
}

/**
 * Decide whether a plan should be executed inline or via Task() subagent.
 *
 * @param {string} planPath - absolute path to the PLAN.md file
 * @param {object} config - project config object with workflow.* properties
 * @param {number} contextPct - current context usage percentage (0-100)
 * @returns {{ inline: boolean, reason?: string, taskCount?: number, complexity?: string }}
 */
function shouldInlineExecution(planPath, config, contextPct) {
  const workflow = (config && config.workflow) || {};
  const features = (config && config.features) || {};

  // Feature toggle check (independent of workflow.inline_execution)
  if (features.inline_simple_tasks === false) {
    return { inline: false, reason: 'feature disabled' };
  }

  // Check if inline execution is enabled
  if (!workflow.inline_execution) {
    return { inline: false, reason: 'inline_execution disabled' };
  }

  const capPct = typeof workflow.inline_context_cap_pct === 'number'
    ? workflow.inline_context_cap_pct
    : DEFAULT_CONTEXT_CAP_PCT;
  const maxTasks = typeof workflow.inline_max_tasks === 'number'
    ? workflow.inline_max_tasks
    : DEFAULT_MAX_TASKS;

  // HARD CAP: context budget check runs FIRST, before other conditions
  if (contextPct >= capPct) {
    return { inline: false, reason: 'context budget exceeded cap' };
  }

  // Read and parse plan file
  let planContent;
  try {
    planContent = fs.readFileSync(planPath, 'utf8');
  } catch (_e) {
    return { inline: false, reason: 'cannot read plan file' };
  }

  const tasks = parsePlanTasks(planContent);

  // Check task count
  if (tasks.length > maxTasks) {
    return {
      inline: false,
      reason: `task count ${tasks.length} exceeds max ${maxTasks}`
    };
  }

  // Check all tasks are simple complexity
  const nonSimple = tasks.filter(t => t.complexity !== 'simple');
  if (nonSimple.length > 0) {
    return {
      inline: false,
      reason: `non-simple complexity: ${nonSimple.map(t => t.id + '=' + t.complexity).join(', ')}`
    };
  }

  // File count check from frontmatter
  const frontmatter = parsePlanFrontmatter(planContent);
  const maxFiles = typeof workflow.inline_max_files === 'number'
    ? workflow.inline_max_files
    : DEFAULT_MAX_FILES;
  const fileCount = frontmatter.files_modified.length;
  if (fileCount > maxFiles) {
    return {
      inline: false,
      reason: `file count ${fileCount} exceeds max ${maxFiles}`
    };
  }

  // Line estimation check from task complexity
  const maxLines = typeof workflow.inline_max_lines === 'number'
    ? workflow.inline_max_lines
    : DEFAULT_MAX_LINES;
  const estimatedLines = tasks.reduce((sum, t) => {
    return sum + (LINES_PER_COMPLEXITY[t.complexity] || LINES_PER_COMPLEXITY.unknown);
  }, 0);
  if (estimatedLines > maxLines) {
    return {
      inline: false,
      reason: `estimated lines ${estimatedLines} exceeds max ${maxLines}`
    };
  }

  return {
    inline: true,
    taskCount: tasks.length,
    complexity: 'simple',
    fileCount,
    estimatedLines
  };
}

module.exports = { shouldInlineExecution, parsePlanTasks, parsePlanFrontmatter };
