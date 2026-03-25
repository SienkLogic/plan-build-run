'use strict';
/**
 * spec-engine.cjs — Parses PLAN.md files into structured JS objects.
 *
 * Provides programmatic access to plan frontmatter and XML task definitions.
 * Used by spec-diff, reverse-spec, impact-analysis, and pbr-tools spec CLI.
 */

const { extractFrontmatter, reconstructFrontmatter } = require('./frontmatter');

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
  const readFirstRaw = extractElement(xmlBlock, 'read_first') || '';
  const filesRaw = extractElement(xmlBlock, 'files') || '';
  const action = extractElement(xmlBlock, 'action') || '';
  const acceptanceCriteria = extractElement(xmlBlock, 'acceptance_criteria') || '';
  const verifyRaw = extractElement(xmlBlock, 'verify') || '';
  const done = extractElement(xmlBlock, 'done') || '';

  // Parse read_first: split by newline, filter empty
  const read_first = readFirstRaw
    .split(/\r?\n/)
    .map(f => f.trim())
    .filter(Boolean);

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
    read_first,
    files,
    action,
    acceptance_criteria: acceptanceCriteria,
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

  // Try to extract tasks from within <tasks>...</tasks> wrapper first.
  // Fall back to scanning the entire file body for backward compatibility.
  const tasksWrapperRe = /<tasks>([\s\S]*?)<\/tasks>/;
  const tasksWrapperMatch = planContent.match(tasksWrapperRe);
  const searchContent = tasksWrapperMatch ? tasksWrapperMatch[1] : planContent;

  // Find all <task ...>...</task> blocks (non-greedy, multiline)
  const taskRe = /<task\b[^>]*>[\s\S]*?<\/task>/g;
  const taskBlocks = searchContent.match(taskRe) || [];

  const tasks = taskBlocks.map(block => parseTaskXml(block));

  // Extract optional outer wrappers
  const objective = extractElement(planContent, 'objective');
  const verification = extractElement(planContent, 'verification');

  const result = {
    frontmatter,
    tasks,
    raw: planContent,
  };

  if (objective !== null) result.objective = objective;
  if (verification !== null) result.verification = verification;

  return result;
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

  // Emit objective wrapper if present
  if (spec.objective) {
    output += `<objective>\n${spec.objective}\n</objective>\n\n`;
  }

  // Open tasks wrapper
  output += `<tasks>\n\n`;

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
    output += `<read_first>\n`;
    for (const f of (task.read_first || [])) {
      output += `${f}\n`;
    }
    output += `</read_first>\n`;
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

    output += `<acceptance_criteria>\n${task.acceptance_criteria || ''}\n</acceptance_criteria>\n`;
    output += `<verify>\n${task.verify}\n</verify>\n`;
    output += `<done>${task.done}</done>\n`;
    output += `</task>\n\n`;
  }

  // Close tasks wrapper
  output += `</tasks>\n`;

  // Emit verification wrapper if present
  if (spec.verification) {
    output += `\n<verification>\n${spec.verification}\n</verification>\n`;
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
