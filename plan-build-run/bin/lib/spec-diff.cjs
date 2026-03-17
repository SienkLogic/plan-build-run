'use strict';
/**
 * spec-diff.cjs — Semantic spec diff engine for PLAN.md files.
 *
 * Compares two versions of a parsed spec and reports structural and
 * content changes with breaking/non-breaking classification.
 */

const { parsePlanToSpec } = require('./spec-engine.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compare two values and return a Change record if they differ.
 * @param {string} type - 'modified'|'frontmatter'
 * @param {string} target - task ID or 'frontmatter'
 * @param {string} field
 * @param {*} before
 * @param {*} after
 * @returns {Change|null}
 */
function makeChange(type, target, field, before, after) {
  const bStr = Array.isArray(before) ? JSON.stringify(before) : String(before || '');
  const aStr = Array.isArray(after) ? JSON.stringify(after) : String(after || '');
  if (bStr === aStr) return null;
  return { type, target, field, before: bStr, after: aStr };
}

/**
 * Compare fields of two objects and return Change[] for any differences.
 * @param {Object} objA
 * @param {Object} objB
 * @param {string[]} fields
 * @param {string} target
 * @param {string} changeType
 * @returns {Change[]}
 */
function compareFields(objA, objB, fields, target, changeType) {
  const changes = [];
  for (const field of fields) {
    const c = makeChange(changeType, target, field, objA[field], objB[field]);
    if (c) changes.push(c);
  }
  return changes;
}

// ─── Core Diff ────────────────────────────────────────────────────────────────

/**
 * Diff two StructuredPlan objects semantically.
 * @param {{ frontmatter: Object, tasks: Object[] }} specA
 * @param {{ frontmatter: Object, tasks: Object[] }} specB
 * @returns {{ changes: Change[], summary: string, breaking: boolean }}
 */
function diffSpecs(specA, specB) {
  const changes = [];

  // ─── Frontmatter comparison ───────────────────────────────────────────────
  const fmFields = ['files_modified', 'must_haves', 'provides', 'consumes', 'implements', 'type', 'wave'];
  const fmChanges = compareFields(specA.frontmatter, specB.frontmatter, fmFields, 'frontmatter', 'modified');
  for (const c of fmChanges) {
    changes.push({ ...c, target: 'frontmatter' });
  }

  // ─── Task comparison ──────────────────────────────────────────────────────
  const mapA = new Map(specA.tasks.map(t => [t.id, t]));
  const mapB = new Map(specB.tasks.map(t => [t.id, t]));

  // Detect added tasks (in B not in A)
  for (const [id, task] of mapB) {
    if (!mapA.has(id)) {
      changes.push({ type: 'added', target: id, field: 'task', before: '', after: task.name });
    }
  }

  // Detect removed tasks (in A not in B)
  for (const [id, task] of mapA) {
    if (!mapB.has(id)) {
      changes.push({ type: 'removed', target: id, field: 'task', before: task.name, after: '' });
    }
  }

  // Detect modified tasks (same ID, different content)
  const taskFields = ['name', 'files', 'action', 'verify', 'done'];
  for (const [id, taskA] of mapA) {
    if (!mapB.has(id)) continue;
    const taskB = mapB.get(id);
    const taskChanges = compareFields(taskA, taskB, taskFields, id, 'modified');
    changes.push(...taskChanges);
  }

  // Detect reordered tasks (same task IDs, different order)
  const idsA = specA.tasks.map(t => t.id);
  const idsB = specB.tasks.map(t => t.id);
  const sharedA = idsA.filter(id => mapB.has(id));
  const sharedB = idsB.filter(id => mapA.has(id));
  if (sharedA.join(',') !== sharedB.join(',') && sharedA.length > 0) {
    changes.push({
      type: 'reordered',
      target: 'tasks',
      field: 'order',
      before: sharedA.join(', '),
      after: sharedB.join(', '),
    });
  }

  // ─── Breaking classification ──────────────────────────────────────────────
  // Breaking = removed task or changed 'done' field (definition of done changed)
  const breaking = changes.some(c =>
    c.type === 'removed' ||
    (c.type === 'modified' && c.field === 'done')
  );

  // ─── Summary ──────────────────────────────────────────────────────────────
  let summary;
  if (changes.length === 0) {
    summary = 'No changes';
  } else {
    const added = changes.filter(c => c.type === 'added').length;
    const removed = changes.filter(c => c.type === 'removed').length;
    const modified = changes.filter(c => c.type === 'modified').length;
    const reordered = changes.filter(c => c.type === 'reordered').length;
    const parts = [];
    if (added) parts.push(`${added} added`);
    if (removed) parts.push(`${removed} removed`);
    if (modified) parts.push(`${modified} modified`);
    if (reordered) parts.push(`${reordered} reordered`);
    summary = parts.join(', ') + (breaking ? ' (BREAKING)' : '');
  }

  return { changes, summary, breaking };
}

/**
 * Convenience wrapper: diff two raw PLAN.md content strings.
 * @param {string} contentA
 * @param {string} contentB
 * @returns {{ changes: Change[], summary: string, breaking: boolean }}
 */
function diffPlanFiles(contentA, contentB) {
  const specA = parsePlanToSpec(contentA);
  const specB = parsePlanToSpec(contentB);
  return diffSpecs(specA, specB);
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Format a diff result as markdown or JSON.
 * @param {{ changes: Change[], summary: string, breaking: boolean }} diff
 * @param {'markdown'|'json'} format
 * @returns {string}
 */
function formatDiff(diff, format) {
  if (format === 'json') {
    return JSON.stringify(diff.changes, null, 2);
  }

  // Markdown format
  if (diff.changes.length === 0) {
    return '## Spec Diff\n\nNo changes';
  }

  const added = diff.changes.filter(c => c.type === 'added');
  const removed = diff.changes.filter(c => c.type === 'removed');
  const modified = diff.changes.filter(c => c.type === 'modified');
  const reordered = diff.changes.filter(c => c.type === 'reordered');

  let md = `## Spec Diff\n\n**Summary:** ${diff.summary}\n`;
  if (diff.breaking) md += '\n> WARNING: Breaking changes detected\n';

  if (added.length > 0) {
    md += '\n### Added\n';
    for (const c of added) {
      md += `- Task \`${c.target}\`: ${c.after}\n`;
    }
  }
  if (removed.length > 0) {
    md += '\n### Removed\n';
    for (const c of removed) {
      md += `- Task \`${c.target}\`: ${c.before}\n`;
    }
  }
  if (modified.length > 0) {
    md += '\n### Modified\n';
    for (const c of modified) {
      md += `- \`${c.target}\` / \`${c.field}\`\n`;
      md += `  - Before: \`${c.before.slice(0, 80)}${c.before.length > 80 ? '...' : ''}\`\n`;
      md += `  - After: \`${c.after.slice(0, 80)}${c.after.length > 80 ? '...' : ''}\`\n`;
    }
  }
  if (reordered.length > 0) {
    md += '\n### Reordered\n';
    for (const c of reordered) {
      md += `- Task order changed: ${c.before} -> ${c.after}\n`;
    }
  }

  return md;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  diffSpecs,
  diffPlanFiles,
  formatDiff,
  compareFields,
};
