'use strict';
/**
 * spec-engine.cjs — Parses PLAN.md files into structured JS objects.
 *
 * Provides programmatic access to plan frontmatter and XML task definitions.
 * Used by spec-diff, reverse-spec, impact-analysis, and pbr-tools spec CLI.
 */

const { extractFrontmatter, reconstructFrontmatter } = require('./frontmatter.cjs');

// ─── Attribute Parsing ────────────────────────────────────────────────────────

/**
 * Parse attributes from an opening XML tag string.
 * e.g. 'id="01-T1" type="auto" tdd="true" complexity="simple"'
 * @param {string} tagString
 * @returns {Object<string, string>}
 */
function parseAttributes(tagString) {
  const attrs = {};
  // Match key="value" or key='value'
  const re = /([a-zA-Z_][a-zA-Z0-9_-]*)=["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(tagString)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

// ─── Element Extraction ───────────────────────────────────────────────────────

/**
 * Extract inner text of a named XML element from a string.
 * Handles multiline content. Returns null if element not found.
 * @param {string} content
 * @param {string} tagName
 * @returns {string|null}
 */
function extractElement(content, tagName) {
  // Use a non-greedy match between opening and closing tag
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, '');
  const m = content.match(re);
  if (!m) return null;
  return m[1].trim();
}

// ─── Task Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a single <task ...>...</task> XML block into a StructuredTask object.
 * @param {string} xmlBlock - The full task XML including opening/closing tags
 * @returns {StructuredTask}
 */
function parseTaskXml(xmlBlock) {
  // Extract attributes from opening <task> tag
  const openTagMatch = xmlBlock.match(/^<task([^>]*)>/);
  const attrs = openTagMatch ? parseAttributes(openTagMatch[1]) : {};

  // Extract mandatory elements
  const name = extractElement(xmlBlock, 'name') || '';
  const filesRaw = extractElement(xmlBlock, 'files') || '';
  const action = extractElement(xmlBlock, 'action') || '';
  const verifyRaw = extractElement(xmlBlock, 'verify') || '';
  const done = extractElement(xmlBlock, 'done') || '';

  // Parse files: split by newline, filter empty
  const files = filesRaw
    .split(/\r?\n/)
    .map(f => f.trim())
    .filter(Boolean);

  // Normalize verify: strip inner <automated> wrapper if present for human-readable access
  // but keep full verify text
  const verify = verifyRaw;

  // Extract optional <feature> element
  let feature = undefined;
  const featureRaw = extractElement(xmlBlock, 'feature');
  if (featureRaw !== null) {
    const behavior = extractElement(featureRaw, 'behavior');
    const implementation = extractElement(featureRaw, 'implementation');
    feature = {};
    if (behavior !== null) feature.behavior = behavior;
    if (implementation !== null) feature.implementation = implementation;
  }

  const task = {
    id: attrs.id || '',
    type: attrs.type || '',
    tdd: attrs.tdd || 'false',
    complexity: attrs.complexity || '',
    name,
    files,
    action,
    verify,
    done,
  };

  if (feature !== undefined) {
    task.feature = feature;
  }

  return task;
}

// ─── Plan Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a full PLAN.md content string into a StructuredPlan object.
 * @param {string} planContent - Raw content of a PLAN.md file
 * @returns {{ frontmatter: Object, tasks: StructuredTask[], raw: string }}
 */
function parsePlanToSpec(planContent) {
  // Extract YAML frontmatter
  const frontmatter = extractFrontmatter(planContent);

  // Find all <task ...>...</task> blocks (non-greedy, multiline)
  const taskRe = /<task\b[^>]*>[\s\S]*?<\/task>/g;
  const taskBlocks = planContent.match(taskRe) || [];

  const tasks = taskBlocks.map(block => parseTaskXml(block));

  return {
    frontmatter,
    tasks,
    raw: planContent,
  };
}

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Serialize a StructuredPlan back into PLAN.md format markdown string.
 * Produces a valid round-trip representation.
 * @param {{ frontmatter: Object, tasks: StructuredTask[], raw?: string }} spec
 * @returns {string}
 */
function serializeSpec(spec) {
  const { frontmatter, tasks } = spec;

  // Reconstruct frontmatter block
  const yamlStr = reconstructFrontmatter(frontmatter);
  let output = `---\n${yamlStr}\n---\n\n`;

  // Reconstruct each task
  for (const task of tasks) {
    const attrs = [
      `id="${task.id}"`,
      `type="${task.type}"`,
      `tdd="${task.tdd}"`,
      `complexity="${task.complexity}"`,
    ].join(' ');

    output += `<task ${attrs}>\n`;
    output += `<name>${task.name}</name>\n`;
    output += `<files>\n`;
    for (const f of task.files) {
      output += `${f}\n`;
    }
    output += `</files>\n`;
    output += `<action>\n${task.action}\n</action>\n`;

    if (task.feature) {
      output += `<feature>\n`;
      if (task.feature.behavior) {
        output += `<behavior>\n${task.feature.behavior}\n</behavior>\n`;
      }
      if (task.feature.implementation) {
        output += `<implementation>\n${task.feature.implementation}\n</implementation>\n`;
      }
      output += `</feature>\n`;
    }

    output += `<verify>\n${task.verify}\n</verify>\n`;
    output += `<done>${task.done}</done>\n`;
    output += `</task>\n\n`;
  }

  return output.trimEnd() + '\n';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseAttributes,
  parseTaskXml,
  parsePlanToSpec,
  serializeSpec,
};
