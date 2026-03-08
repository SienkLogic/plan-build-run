'use strict';

/**
 * skill-section.cjs -- Targeted SKILL.md section extraction for Plan-Build-Run.
 *
 * Enables surgical extraction of specific sections from skill files (SKILL.md),
 * reducing token usage by fetching only the needed section on demand.
 *
 * Exported functions:
 *   skillSection(skillName, sectionQuery, pluginRoot)  -- Main entry point
 *   resolveSkillPath(skillName, pluginRoot)            -- Resolve skill name to file path
 *   listAvailableSkills(pluginRoot)                    -- List all available skill names
 */

const fs = require('fs');
const path = require('path');
const { extractSection, listHeadings } = require('./reference.cjs');

/**
 * Resolve a skill name to its SKILL.md file path.
 *
 * @param {string} skillName - Skill name (e.g., "build", "plan")
 * @param {string} pluginRoot - Plugin root directory
 * @returns {string | null} - Full path to SKILL.md, or null if not found
 */
function resolveSkillPath(skillName, pluginRoot) {
  const skillPath = path.join(pluginRoot, 'skills', skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return skillPath;
}

/**
 * List all available skill names from the skills/ directory.
 *
 * @param {string} pluginRoot - Plugin root directory
 * @returns {string[]} - Array of skill names (directory names)
 */
function listAvailableSkills(pluginRoot) {
  const skillsDir = path.join(pluginRoot, 'skills');
  try {
    return fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch (_e) {
    return [];
  }
}

/**
 * Extract a specific section from a skill's SKILL.md.
 *
 * @param {string} skillName - Skill name (e.g., "build", "plan")
 * @param {string} sectionQuery - Section heading query (fuzzy matched)
 * @param {string} pluginRoot - Plugin root directory
 * @returns {object} - { skill, section, heading, content, char_count } or { error, available? }
 */
function skillSection(skillName, sectionQuery, pluginRoot) {
  // Validate section query
  if (!sectionQuery || !sectionQuery.trim()) {
    return { error: 'Section query required' };
  }

  // Resolve skill path
  const skillPath = resolveSkillPath(skillName, pluginRoot);
  if (!skillPath) {
    return {
      error: `Skill not found: ${skillName}`,
      available: listAvailableSkills(pluginRoot)
    };
  }

  // Read skill content
  let content;
  try {
    content = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    return { error: `Cannot read skill file: ${e.message}` };
  }

  // Normalize query: replace hyphens with spaces for better fuzzy matching
  const normalizedQuery = sectionQuery.replace(/-/g, ' ');

  // Extract the requested section (try normalized first, then original)
  let result = extractSection(content, normalizedQuery);
  if (!result && normalizedQuery !== sectionQuery) {
    result = extractSection(content, sectionQuery);
  }
  if (!result) {
    return {
      error: `Section '${sectionQuery}' not found in skill '${skillName}'`,
      available: listHeadings(content)
    };
  }

  return { skill: skillName, section: sectionQuery, ...result };
}

module.exports = { skillSection, resolveSkillPath, listAvailableSkills };
