'use strict';

/**
 * Parse YAML-like frontmatter from a markdown string.
 * Splits on `---` delimiters and extracts key: value pairs.
 * Handles quoted strings, numbers, booleans, inline arrays,
 * and one level of nested YAML indentation (2-space indent).
 *
 * @param {string} content - Raw file content
 * @returns {{ frontmatter: object, body: string }}
 */
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: normalized };

  const raw = match[1];
  const body = normalized.slice(match[0].length).trim();
  const frontmatter = {};
  const lines = raw.split('\n');

  let currentParent = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for nested key (2-space indented under a parent)
    if (currentParent && /^ {2}\w/.test(line)) {
      const kv = line.match(/^\s+(\w[\w_-]*)\s*:\s*(.+)$/);
      if (kv) {
        if (typeof frontmatter[currentParent] !== 'object' || frontmatter[currentParent] === null) {
          frontmatter[currentParent] = {};
        }
        frontmatter[currentParent][kv[1]] = parseValue(kv[2].trim());
      }
      continue;
    }

    // Top-level key
    currentParent = null;
    const kv = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/);
    if (kv) {
      frontmatter[kv[1]] = parseValue(kv[2].trim());
      continue;
    }

    // Parent key with no inline value (e.g., "progress:")
    const parentMatch = line.match(/^(\w[\w_-]*)\s*:\s*$/);
    if (parentMatch) {
      currentParent = parentMatch[1];
      // Initialize as empty object; will be populated by nested lines
      frontmatter[currentParent] = {};
      continue;
    }
  }

  return { frontmatter, body };
}

/**
 * Parse a single YAML value string into its JS equivalent.
 * @param {string} val - Raw value string
 * @returns {string|number|boolean|string[]}
 */
function parseValue(val) {
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  // Inline array: [a, b, c]
  if (val.startsWith('[') && val.endsWith(']')) {
    return val.slice(1, -1).split(',').map(s => {
      s = s.trim();
      if ((s.startsWith('"') && s.endsWith('"')) ||
          (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
      }
      return s;
    }).filter(s => s.length > 0);
  }
  // Boolean
  if (val === 'true') return true;
  if (val === 'false') return false;
  // Number
  if (/^\d+$/.test(val)) return parseInt(val, 10);
  if (/^\d+\.\d+$/.test(val)) return parseFloat(val);

  return val;
}

module.exports = { parseFrontmatter };
