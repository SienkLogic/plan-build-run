'use strict';

/**
 * reference.js — Targeted reference document access for Plan-Build-Run agents.
 *
 * Enables surgical extraction of specific sections from reference documents,
 * reducing token usage from 1,500-3,500 tokens (full file) to 50-200 tokens (section only).
 *
 * Exported functions:
 *   listHeadings(content)                   — Extract all H2/H3 headings
 *   extractSection(content, query)          — Extract a section by heading query
 *   resolveReferencePath(name, pluginRoot)  — Resolve a ref name to a file path
 *   referenceGet(name, options, pluginRoot) — Main entry point
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract all H2 and H3 headings from markdown content.
 * Handles CRLF line endings (Windows compatibility).
 *
 * @param {string} content - Markdown content
 * @returns {Array<{level: number, heading: string}>}
 */
function listHeadings(content) {
  const headings = [];
  const regex = /^(#{2,3})\s+(.+?)\r?$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      heading: match[2].replace(/\r$/, '')
    });
  }
  return headings;
}

/**
 * Extract a section matching the query using 4-tier fuzzy matching.
 * Matching tiers (applied in order):
 *   1. Exact match (case-insensitive)
 *   2. Starts-with match
 *   3. Contains match
 *   4. Word-boundary: all words in query appear in heading
 *
 * For H2: captures content until next H2 or end of file.
 * For H3: captures content until next H3, next H2, or end of file.
 *
 * @param {string} content - Markdown content
 * @returns {{ heading: string, level: number, content: string, char_count: number } | null}
 */
function extractSection(content, query) {
  // Collect all headings with their character offsets
  const headings = [];
  const regex = /^(#{2,3})\s+(.+?)\r?$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      heading: match[2].replace(/\r$/, ''),
      index: match.index,
      fullMatch: match[0]
    });
  }

  if (headings.length === 0) return null;

  const q = query.toLowerCase();

  // 4-tier fuzzy matching
  let matched = null;

  // Tier 1: Exact match
  matched = headings.find(h => h.heading.toLowerCase() === q);

  // Tier 2: Starts-with
  if (!matched) {
    matched = headings.find(h => h.heading.toLowerCase().startsWith(q));
  }

  // Tier 3: Contains
  if (!matched) {
    matched = headings.find(h => h.heading.toLowerCase().includes(q));
  }

  // Tier 4: Word-boundary — all words in query appear in heading
  if (!matched) {
    const words = q.split(/\s+/).filter(Boolean);
    matched = headings.find(h => {
      const hl = h.heading.toLowerCase();
      return words.every(w => hl.includes(w));
    });
  }

  if (!matched) return null;

  // Determine section boundaries
  const startIdx = matched.index;
  // Find where the section content starts (after the heading line)
  const headingEnd = startIdx + matched.fullMatch.length;
  // Skip the newline after the heading
  const contentStart = headingEnd + (content[headingEnd] === '\r' ? 2 : content[headingEnd] === '\n' ? 1 : 0);

  // Find where section ends
  let endIdx = content.length;

  if (matched.level === 2) {
    // H2: ends at next H2 or end of file
    const nextH2 = /\n## /g;
    nextH2.lastIndex = contentStart;
    const nextMatch = nextH2.exec(content);
    if (nextMatch) endIdx = nextMatch.index;
  } else {
    // H3: ends at next H3 or H2 or end of file
    const nextSection = /\n#{2,3} /g;
    nextSection.lastIndex = contentStart;
    const nextMatch = nextSection.exec(content);
    if (nextMatch) endIdx = nextMatch.index;
  }

  const sectionContent = content.slice(startIdx, endIdx).trimEnd();

  return {
    heading: matched.heading,
    level: matched.level,
    content: sectionContent,
    char_count: sectionContent.length
  };
}

/**
 * Resolve a reference name to its full file path.
 *
 * @param {string} name - Reference name (with or without .md extension)
 * @param {string} pluginRoot - Plugin root directory
 * @returns {string | { error: string, available: string[] }}
 */
function resolveReferencePath(name, pluginRoot) {
  // Strip .md extension if present
  const baseName = name.endsWith('.md') ? name.slice(0, -3) : name;
  const refPath = path.join(pluginRoot, 'references', baseName + '.md');

  if (fs.existsSync(refPath)) {
    return refPath;
  }

  // File not found — list available references
  const refsDir = path.join(pluginRoot, 'references');
  let available = [];
  try {
    available = fs.readdirSync(refsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -3));
  } catch (_e) {
    // references dir doesn't exist
  }

  return {
    error: `Reference '${baseName}' not found in ${refsDir}`,
    available
  };
}

/**
 * Strip YAML frontmatter from content if present in first 5 lines.
 * @param {string} content
 * @returns {string}
 */
function stripFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return content;
  // Find closing ---
  for (let i = 1; i < Math.min(lines.length, 200); i++) {
    if (lines[i] === '---') {
      // Return everything after the closing ---
      return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
    }
  }
  return content;
}

/**
 * Main entry point for reference access.
 *
 * @param {string} name - Reference name (e.g. "plan-format")
 * @param {{ section?: string, list?: boolean }} options
 * @param {string} pluginRoot - Plugin root directory
 * @returns {object}
 */
function referenceGet(name, options, pluginRoot) {
  const opts = options || {};

  // Resolve file path
  const resolved = resolveReferencePath(name, pluginRoot);
  if (typeof resolved === 'object' && resolved.error) {
    return resolved;
  }

  // Read content
  let content;
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch (e) {
    return { error: `Cannot read reference file: ${e.message}` };
  }

  // Strip YAML frontmatter if present in first 5 lines
  const firstLines = content.split(/\r?\n/).slice(0, 5).join('\n');
  if (firstLines.includes('---')) {
    content = stripFrontmatter(content);
  }

  // --list flag: return available headings
  if (opts.list) {
    return { name, headings: listHeadings(content) };
  }

  // --section flag: extract specific section
  if (opts.section) {
    const result = extractSection(content, opts.section);
    if (!result) {
      const available = listHeadings(content);
      return {
        error: `Section '${opts.section}' not found in reference '${name}'`,
        available
      };
    }
    return { name, section: opts.section, ...result };
  }

  // No flags: return full content
  return { name, content, char_count: content.length };
}

module.exports = { listHeadings, extractSection, resolveReferencePath, referenceGet };
