'use strict';

/**
 * lib/help.js — CLI help and skill metadata for Plan-Build-Run.
 *
 * Provides structured JSON output for skill discovery and metadata lookup.
 *
 * Exported functions:
 *   helpList(pluginRoot)                   — List all skills with metadata
 *   skillMetadata(skillName, pluginRoot)   — Get metadata for a single skill
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse YAML frontmatter from markdown content.
 * Uses the same --- delimiter pattern as core.js:parseYamlFrontmatter.
 *
 * @param {string} content - Markdown content with optional frontmatter
 * @returns {object} Parsed frontmatter fields
 */
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};
  let currentKey = null;

  for (const line of yaml.split('\n')) {
    // Array item
    if (/^\s+-\s+/.test(line) && currentKey) {
      const val = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!result[currentKey]) result[currentKey] = [];
      if (Array.isArray(result[currentKey])) {
        result[currentKey].push(val);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^([\w][\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let val = kvMatch[2].trim();

      if (val === '' || val === '|') continue;

      // Handle arrays on same line: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        result[currentKey] = val.slice(1, -1).split(',')
          .map(v => v.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        continue;
      }

      // Clean quotes
      val = val.replace(/^["']|["']$/g, '');
      result[currentKey] = val;
    }
  }

  return result;
}

/**
 * List all skills with their metadata from skills/ directory.
 *
 * @param {string} pluginRoot - Plugin root directory
 * @returns {{ skills: Array<{ name: string, description: string, allowed_tools: string[], argument_hint: string }> }}
 */
function helpList(pluginRoot) {
  const skillsDir = path.join(pluginRoot, 'skills');
  let entries;
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory());
  } catch (_e) {
    return { skills: [] };
  }

  const skills = [];
  for (const entry of entries) {
    const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
    try {
      const content = fs.readFileSync(skillMd, 'utf8');
      const fm = parseFrontmatter(content);
      const allowedTools = fm['allowed-tools']
        ? (Array.isArray(fm['allowed-tools'])
          ? fm['allowed-tools']
          : String(fm['allowed-tools']).split(',').map(t => t.trim()).filter(Boolean))
        : [];
      skills.push({
        name: fm.name || entry.name,
        description: fm.description || '',
        allowed_tools: allowedTools,
        argument_hint: fm['argument-hint'] || ''
      });
    } catch (_e) {
      // Skip unreadable skills
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills };
}

/**
 * Get metadata for a single skill.
 *
 * @param {string} skillName - Skill name (e.g., "build", "quick")
 * @param {string} pluginRoot - Plugin root directory
 * @returns {object} Skill metadata or error object
 */
function skillMetadata(skillName, pluginRoot) {
  const skillMd = path.join(pluginRoot, 'skills', skillName, 'SKILL.md');

  if (!fs.existsSync(skillMd)) {
    const skillsDir = path.join(pluginRoot, 'skills');
    let available = [];
    try {
      available = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch (_e) { /* empty */ }
    return { error: 'Skill not found', skill: skillName, available };
  }

  try {
    const content = fs.readFileSync(skillMd, 'utf8');
    const fm = parseFrontmatter(content);
    const allowedTools = fm['allowed-tools']
      ? (Array.isArray(fm['allowed-tools'])
        ? fm['allowed-tools']
        : String(fm['allowed-tools']).split(',').map(t => t.trim()).filter(Boolean))
      : [];
    return {
      name: fm.name || skillName,
      description: fm.description || '',
      allowed_tools: allowedTools,
      argument_hint: fm['argument-hint'] || '',
      file_path: skillMd
    };
  } catch (e) {
    return { error: `Cannot read skill file: ${e.message}` };
  }
}

module.exports = { helpList, skillMetadata };
