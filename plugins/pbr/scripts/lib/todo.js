/**
 * lib/todo.js — File-based todo operations for Plan-Build-Run.
 *
 * Todos are individual .md files with YAML frontmatter stored in:
 *   .planning/todos/pending/{NNN}-{slug}.md  — active todos
 *   .planning/todos/done/{NNN}-{slug}.md     — completed todos
 *
 * Frontmatter fields: title, status, priority, source, created, completed, theme.
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter, atomicWrite } = require('./core');

// --- Helpers ---

/**
 * Parse a todo filename into its components.
 * @param {string} filename - e.g. "042-fix-login-bug.md"
 * @returns {{ number: number, slug: string } | null}
 */
function parseTodoFilename(filename) {
  const match = filename.match(/^(\d+)-(.+)\.md$/);
  if (!match) return null;
  return { number: parseInt(match[1], 10), slug: match[2] };
}

/**
 * Read and parse a single todo file.
 * @param {string} filePath - Absolute path to the .md file
 * @param {string} filename - Just the filename for parsing NNN-slug
 * @returns {object} Todo object with number, slug, title, priority, theme, etc.
 */
function parseTodoFile(filePath, filename) {
  const parsed = parseTodoFilename(filename);
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = parseYamlFrontmatter(content);

  // Extract body (everything after frontmatter closing ---)
  const bodyMatch = content.match(/^---[\s\S]*?\n---\s*\n?([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1].trim() : '';

  return {
    number: parsed ? parsed.number : null,
    slug: parsed ? parsed.slug : filename.replace(/\.md$/, ''),
    filename,
    title: fm.title || '',
    status: fm.status || 'pending',
    priority: fm.priority || 'P2',
    theme: fm.theme || 'general',
    source: fm.source || 'conversation',
    created: fm.created || null,
    completed: fm.completed || null,
    body
  };
}

/**
 * Scan both pending/ and done/ to find the highest existing todo number.
 * @param {string} planningDir - Path to .planning/
 * @returns {number} Highest number found (0 if none)
 */
function findHighestNumber(planningDir) {
  let highest = 0;
  const dirs = [
    path.join(planningDir, 'todos', 'pending'),
    path.join(planningDir, 'todos', 'done')
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const parsed = parseTodoFilename(file);
      if (parsed && parsed.number > highest) {
        highest = parsed.number;
      }
    }
  }
  return highest;
}

/**
 * Generate a slug from a description.
 * Takes first ~4 meaningful words, lowercase, hyphen-separated.
 * @param {string} description
 * @returns {string}
 */
function generateSlug(description) {
  const stopWords = new Set(['a', 'an', 'the', 'to', 'in', 'on', 'for', 'of', 'and', 'or', 'is', 'it', 'with']);
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0 && !stopWords.has(w))
    .slice(0, 4);
  return words.join('-') || 'untitled';
}

// --- Core operations ---

/**
 * List todos from a directory (pending or done).
 * @param {string} planningDir - Path to .planning/
 * @param {object} opts - { status: 'pending'|'done'|'all', theme: string|null }
 * @returns {{ todos: object[], count: number }}
 */
function todoList(planningDir, opts = {}) {
  const status = opts.status || 'pending';
  const theme = opts.theme || null;
  const todos = [];

  const dirsToScan = status === 'all'
    ? ['pending', 'done']
    : [status];

  for (const subdir of dirsToScan) {
    const dir = path.join(planningDir, 'todos', subdir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    for (const file of files) {
      const todo = parseTodoFile(path.join(dir, file), file);
      if (theme && todo.theme !== theme) continue;
      todos.push(todo);
    }
  }

  // Sort by number
  todos.sort((a, b) => (a.number || 0) - (b.number || 0));

  return { todos, count: todos.length };
}

/**
 * Get a specific todo by its NNN number.
 * Searches pending first, then done.
 * @param {string} planningDir - Path to .planning/
 * @param {number|string} num - The todo number (e.g. 42 or "042")
 * @returns {object} Todo object with full body, or { error: "..." }
 */
function todoGet(planningDir, num) {
  const numStr = String(num).padStart(3, '0');
  const prefix = numStr + '-';

  for (const subdir of ['pending', 'done']) {
    const dir = path.join(planningDir, 'todos', subdir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
    if (files.length > 0) {
      const todo = parseTodoFile(path.join(dir, files[0]), files[0]);
      todo.location = subdir;
      return todo;
    }
  }

  return { error: `Todo ${numStr} not found in pending or done` };
}

/**
 * Add a new todo.
 * @param {string} planningDir - Path to .planning/
 * @param {string} title - The todo description
 * @param {object} opts - { priority: 'P1'|'P2'|'P3', theme: string, source: string }
 * @returns {{ success: boolean, number: number, filename: string, path: string } | { error: string }}
 */
function todoAdd(planningDir, title, opts = {}) {
  if (!title || !title.trim()) {
    return { error: 'Title is required' };
  }

  const pendingDir = path.join(planningDir, 'todos', 'pending');

  // Ensure directory exists
  fs.mkdirSync(pendingDir, { recursive: true });

  const nextNum = findHighestNumber(planningDir) + 1;
  const numStr = String(nextNum).padStart(3, '0');
  const slug = generateSlug(title);
  const filename = `${numStr}-${slug}.md`;
  const filePath = path.join(pendingDir, filename);

  const priority = opts.priority || 'P2';
  const theme = opts.theme || 'general';
  const source = opts.source || 'cli';
  const today = new Date().toISOString().slice(0, 10);

  const content = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    'status: pending',
    `priority: ${priority}`,
    `source: ${source}`,
    `created: ${today}`,
    `theme: ${theme}`,
    '---',
    '',
    '## Goal',
    '',
    title,
    ''
  ].join('\n');

  const result = atomicWrite(filePath, content);
  if (!result.success) {
    return { error: `Failed to write todo file: ${result.error}` };
  }

  return {
    success: true,
    number: nextNum,
    number_padded: numStr,
    filename,
    path: filePath
  };
}

/**
 * Mark a todo as done. Moves from pending/ to done/.
 * Write to done/ first, verify, then delete from pending/.
 * @param {string} planningDir - Path to .planning/
 * @param {number|string} num - The todo number
 * @returns {{ success: boolean, title: string, filename: string } | { error: string }}
 */
function todoDone(planningDir, num) {
  const numStr = String(num).padStart(3, '0');
  const prefix = numStr + '-';

  const pendingDir = path.join(planningDir, 'todos', 'pending');
  const doneDir = path.join(planningDir, 'todos', 'done');

  if (!fs.existsSync(pendingDir)) {
    return { error: `Todo ${numStr} not found — no pending directory` };
  }

  const files = fs.readdirSync(pendingDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (files.length === 0) {
    return { error: `Todo ${numStr} not found in pending todos` };
  }

  const filename = files[0];
  const pendingPath = path.join(pendingDir, filename);
  const content = fs.readFileSync(pendingPath, 'utf8');
  const fm = parseYamlFrontmatter(content);
  const title = fm.title || '';
  const today = new Date().toISOString().slice(0, 10);

  // Update frontmatter: status → done, add completed date
  let updatedContent = content
    .replace(/^status:\s*.*/m, 'status: done')
    .replace(/^(---[\s\S]*?)(---)/, (match, front, close) => {
      // Add completed field if not present
      if (!/^completed:/m.test(front)) {
        return front + `completed: ${today}\n${close}`;
      }
      return match.replace(/^completed:\s*.*/m, `completed: ${today}`);
    });

  // Ensure done/ directory exists
  fs.mkdirSync(doneDir, { recursive: true });

  // Write to done/ FIRST
  const donePath = path.join(doneDir, filename);
  const writeResult = atomicWrite(donePath, updatedContent);
  if (!writeResult.success) {
    return { error: `Failed to write to done/: ${writeResult.error}. Pending file preserved.` };
  }

  // Verify done/ write succeeded
  if (!fs.existsSync(donePath)) {
    return { error: 'Done file not found after write. Pending file preserved.' };
  }

  // Only now delete from pending/
  try {
    fs.unlinkSync(pendingPath);
  } catch (e) {
    // Non-fatal — todo is in done/ now, pending copy is just stale
    return {
      success: true,
      title,
      filename,
      warning: `Completed but could not remove from pending/: ${e.message}`
    };
  }

  return { success: true, title, filename };
}

module.exports = {
  todoList,
  todoGet,
  todoAdd,
  todoDone,
  // Exported for testing
  parseTodoFilename,
  parseTodoFile,
  findHighestNumber,
  generateSlug
};
