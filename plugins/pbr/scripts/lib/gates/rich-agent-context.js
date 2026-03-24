'use strict';

/**
 * Rich Agent Context Builder
 *
 * Builds a prioritized context string from .planning/ sources for enriching
 * Task() spawn prompts. Respects the rich_agent_prompts feature toggle and
 * a configurable character budget.
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('../frontmatter');
const { logHook } = require('../../hook-logger');

/**
 * Build a rich context string from .planning/ sources.
 * Sections are built in priority order (highest first). If total exceeds
 * budgetChars, lowest-priority sections are dropped.
 *
 * @param {string} planningDir - path to .planning directory
 * @param {object} config - project config object
 * @param {number} [budgetChars=5000] - maximum character budget
 * @returns {string} context string or empty string if disabled
 */
function buildRichAgentContext(planningDir, config, budgetChars = 5000) {
  // Check feature toggle — only explicitly false disables it
  if (config && config.features && config.features.rich_agent_prompts === false) {
    return '';
  }

  const sections = [];

  // 1. Project summary (highest priority)
  try {
    const projectPath = path.join(planningDir, 'PROJECT.md');
    if (fs.existsSync(projectPath)) {
      const content = fs.readFileSync(projectPath, 'utf8');
      const lines = content.split(/\r?\n/).slice(0, 20);
      sections.push({ priority: 1, header: '### Project Summary', body: lines.join('\n') });
    }
  } catch (_e) {
    logHook('gate:rich-agent-context', 'debug', 'Failed to read PROJECT.md', { error: _e.message });
  }

  // 2. Current state from STATE.md frontmatter
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf8');
      const stateInfo = parseStateFrontmatter(content);
      if (stateInfo) {
        sections.push({ priority: 2, header: '### Current State', body: stateInfo });
      }
    }
  } catch (_e) {
    logHook('gate:rich-agent-context', 'debug', 'Failed to read STATE.md', { error: _e.message });
  }

  // 3. Recent decisions (up to 5 most recent)
  try {
    const decisionsDir = path.join(planningDir, 'decisions');
    if (fs.existsSync(decisionsDir)) {
      const files = fs.readdirSync(decisionsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .slice(-5);
      if (files.length > 0) {
        const titles = files.map(f => `- ${f.replace(/\.md$/, '')}`).join('\n');
        sections.push({ priority: 3, header: '### Recent Decisions', body: titles });
      }
    }
  } catch (_e) {
    logHook('gate:rich-agent-context', 'debug', 'Failed to read decisions dir', { error: _e.message });
  }

  // 4. Active conventions
  try {
    const convDir = path.join(planningDir, 'conventions');
    if (fs.existsSync(convDir)) {
      const files = fs.readdirSync(convDir)
        .filter(f => f.endsWith('.md'))
        .sort();
      if (files.length > 0) {
        const titles = files.map(f => `- ${f.replace(/\.md$/, '')}`).join('\n');
        sections.push({ priority: 4, header: '### Active Conventions', body: titles });
      }
    }
  } catch (_e) {
    logHook('gate:rich-agent-context', 'debug', 'Failed to read conventions dir', { error: _e.message });
  }

  // 5. Working set from STATE.md (lowest priority)
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf8');
      const wsMatch = content.match(/working_set:\s*\n((?:\s+-\s+.+\n?)+)/);
      if (wsMatch) {
        sections.push({ priority: 5, header: '### Working Set', body: wsMatch[1].trim() });
      }
    }
  } catch (_e) {
    logHook('gate:rich-agent-context', 'debug', 'Failed to read STATE.md working set', { error: _e.message });
  }

  // Assemble with budget control — drop lowest priority sections first
  // Sort by priority (ascending = highest priority first)
  sections.sort((a, b) => a.priority - b.priority);

  let result = '';
  for (const section of sections) {
    const addition = `${section.header}\n${section.body}\n\n`;
    if ((result + addition).length > budgetChars) {
      // Try truncating just this section's body to fit
      const remaining = budgetChars - result.length - section.header.length - 2; // 2 for \n after header + \n at end
      if (remaining > 20) {
        result += `${section.header}\n${section.body.slice(0, remaining - 3)}...`;
      }
      break; // Don't add any more sections
    }
    result += addition;
  }

  return result.trimEnd();
}

/**
 * Parse STATE.md frontmatter for key state info.
 * @param {string} content - STATE.md content
 * @returns {string|null} formatted state info or null
 */
/**
 * Parse STATE.md and format as a human-readable string.
 * Delegates to canonical parseStateMd from lib/state.js.
 */
const parseStateFrontmatter = (content) => {
  const fm = extractFrontmatter(content);
  if (!fm || (!fm.current_phase && !fm.status)) return null;
  const parts = [];
  if (fm.current_phase) parts.push(`Phase: ${fm.current_phase}`);
  if (fm.status) parts.push(`Status: ${fm.status}`);
  if (fm.progress_percent) parts.push(`Progress: ${fm.progress_percent}%`);
  if (fm.phase_slug) parts.push(`Phase: ${fm.phase_slug}`);
  return parts.length > 0 ? parts.join('\n') : null;
};

module.exports = { buildRichAgentContext };
