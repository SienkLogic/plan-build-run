/**
 * lib/yaml.js — YAML frontmatter parsing utilities for Plan-Build-Run.
 *
 * Extracted from lib/core.js. Pure string parsers with no external dependencies.
 * Provides: parseYamlFrontmatter, parseMustHaves, setYamlFrontmatter, countMustHaves.
 */

/**
 * Parse YAML frontmatter from markdown content.
 * Handles flat key-value pairs, inline arrays, and multi-line arrays.
 *
 * @param {string} content - Markdown content with optional frontmatter
 * @returns {object} Parsed frontmatter as a plain object
 */
function parseYamlFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

  const lines = yaml.split('\n');
  let currentKey = null;

  for (const line of lines) {
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
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
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

      // Type coercion
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);

      result[currentKey] = val;
    }
  }

  // Handle must_haves as a nested object
  if (yaml.includes('must_haves:')) {
    result.must_haves = parseMustHaves(yaml);
  }

  return result;
}

/**
 * Parse the must_haves section from YAML frontmatter.
 *
 * @param {string} yaml - Raw YAML content (without --- delimiters)
 * @returns {{ truths: string[], artifacts: string[], key_links: string[] }}
 */
function parseMustHaves(yaml) {
  const result = { truths: [], artifacts: [], key_links: [] };
  let section = null;

  const inMustHaves = yaml.replace(/\r\n/g, '\n').split('\n');
  let collecting = false;

  for (const line of inMustHaves) {
    if (/^\s*must_haves:/.test(line)) {
      collecting = true;
      continue;
    }
    if (collecting) {
      if (/^\s{2}truths:/.test(line)) { section = 'truths'; continue; }
      if (/^\s{2}artifacts:/.test(line)) { section = 'artifacts'; continue; }
      if (/^\s{2}key_links:/.test(line)) { section = 'key_links'; continue; }
      if (/^\w/.test(line)) break;

      if (section && /^\s+-\s+/.test(line)) {
        result[section].push(line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
    }
  }

  return result;
}

/**
 * Set/update YAML frontmatter fields in markdown content.
 * Creates frontmatter block if none exists.
 *
 * @param {string} content - Markdown content
 * @param {object} updates - Key-value pairs to set in frontmatter
 * @returns {string} Updated content
 */
function setYamlFrontmatter(content, updates) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);

  if (!match) {
    // No existing frontmatter — create one
    const lines = Object.entries(updates).map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map(item => `  - ${item}`).join('\n')}`;
      }
      if (typeof v === 'string' && (v.includes(':') || v.includes('#'))) {
        return `${k}: "${v}"`;
      }
      return `${k}: ${v}`;
    });
    return `---\n${lines.join('\n')}\n---\n${normalized}`;
  }

  let yaml = match[1];

  for (const [key, value] of Object.entries(updates)) {
    const keyRegex = new RegExp(`^(${key})\\s*:.*$`, 'm');
    const formatted = typeof value === 'string' && (value.includes(':') || value.includes('#'))
      ? `"${value}"`
      : String(value);

    if (keyRegex.test(yaml)) {
      yaml = yaml.replace(keyRegex, `${key}: ${formatted}`);
    } else {
      yaml += `\n${key}: ${formatted}`;
    }
  }

  return normalized.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${yaml}\n---`);
}

function countMustHaves(mustHaves) {
  if (!mustHaves) return 0;
  return (mustHaves.truths || []).length +
    (mustHaves.artifacts || []).length +
    (mustHaves.key_links || []).length;
}

module.exports = {
  parseYamlFrontmatter,
  parseMustHaves,
  setYamlFrontmatter,
  countMustHaves,
};
