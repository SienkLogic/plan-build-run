/**
 * lib/quick-init.js — Quick task directory creation and PLAN.md generation.
 *
 * Fixes the #1 documented PBR failure mode: LLM skipping directory creation
 * under cognitive load. This command atomically creates the directory and
 * writes PLAN.md so the skill doesn't have to.
 *
 * Usage:
 *   node pbr-tools.js quick init "fix the auth bug in login flow"
 */

const fs = require('fs');
const path = require('path');

// Articles and short prepositions to strip from slugs
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'for', 'to', 'on', 'at', 'by', 'with',
  'and', 'or', 'but', 'is', 'it', 'its', 'be', 'as', 'do', 'so', 'up'
]);

/**
 * Generate a smart slug from a description.
 * Removes articles/prepositions, keeps first 4-5 meaningful words, max 50 chars.
 *
 * @param {string} text - Description text
 * @returns {string} Hyphenated slug
 */
function generateQuickSlug(text) {
  if (!text || !text.trim()) return 'task';

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w));

  if (words.length === 0) return 'task';

  // Take first 5 meaningful words, then trim to 50 chars
  const slug = words.slice(0, 5).join('-');
  if (slug.length <= 50) return slug;

  // Trim at last hyphen before 50 chars
  const trimmed = slug.substring(0, 50);
  const lastHyphen = trimmed.lastIndexOf('-');
  return lastHyphen > 0 ? trimmed.substring(0, lastHyphen) : trimmed;
}

/**
 * Create a quick task directory and write PLAN.md.
 *
 * @param {string} description - Task description
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @returns {object} JSON result with number, slug, dir, plan_path, task_id — or {error}
 */
function quickInit(description, planningDir) {
  // Validate inputs
  if (!description || !description.trim()) {
    return { error: 'Description required' };
  }

  if (!fs.existsSync(planningDir)) {
    return { error: 'No .planning/ directory. Run /pbr:begin first.' };
  }

  const quickDir = path.join(planningDir, 'quick');

  // Scan for highest existing task number
  let nextNum = 1;
  if (fs.existsSync(quickDir)) {
    const dirs = fs.readdirSync(quickDir)
      .filter(d => /^\d{3}-/.test(d))
      .sort();
    if (dirs.length > 0) {
      nextNum = parseInt(dirs[dirs.length - 1].substring(0, 3), 10) + 1;
    }
  } else {
    // Create .planning/quick/ if it doesn't exist
    fs.mkdirSync(quickDir, { recursive: true });
  }

  const paddedNum = String(nextNum).padStart(3, '0');
  const slug = generateQuickSlug(description);
  const dirName = `${paddedNum}-${slug}`;
  const taskDir = path.join(quickDir, dirName);
  const taskId = `quick-${paddedNum}`;

  // Create the task directory
  fs.mkdirSync(taskDir, { recursive: true });

  // Write PLAN.md
  const planContent = [
    '---',
    `task_id: "${taskId}"`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    `created: "${new Date().toISOString()}"`,
    'status: planned',
    '---',
    '',
    `# Quick Task: ${description}`,
    '',
    '## Objective',
    '',
    description,
    '',
    '## Tasks',
    '',
    '- [ ] Implement the change',
    '- [ ] Verify it works',
    '- [ ] Commit with conventional format',
    ''
  ].join('\n');

  const planPath = path.join(taskDir, 'PLAN.md');
  fs.writeFileSync(planPath, planContent, 'utf8');

  // Return relative paths (as the spec shows)
  const relDir = path.join('.planning', 'quick', dirName);
  return {
    number: paddedNum,
    slug: slug,
    dir: relDir,
    plan_path: path.join(relDir, 'PLAN.md'),
    task_id: taskId
  };
}

module.exports = {
  quickInit,
  generateQuickSlug
};
