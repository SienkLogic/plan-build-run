import { readdir, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { readMarkdownFile } from '../repositories/planning.repository.js';

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, PX: 3 };

class WriteQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  enqueue(fn) {
    const task = this.tail.then(fn, fn);
    this.tail = task.catch(() => {});
    return task;
  }
}

const writeQueue = new WriteQueue();

function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

async function getNextTodoId(projectDir) {
  const pendingDir = join(projectDir, '.planning', 'todos', 'pending');
  const doneDir = join(projectDir, '.planning', 'todos', 'done');

  let highestId = 0;

  for (const dir of [pendingDir, doneDir]) {
    try {
      const files = await readdir(dir);
      for (const filename of files) {
        const match = filename.match(/^(\d{3})-/);
        if (match) {
          const id = parseInt(match[1], 10);
          if (id > highestId) highestId = id;
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return String(highestId + 1).padStart(3, '0');
}

/**
 * Sort todos by priority (P0 first) then alphabetically by title.
 * Unknown priorities sort after PX.
 * @param {Array} todos - Array of todo objects with priority and title fields
 * @returns {Array} Sorted array (mutates and returns the input)
 */
function sortTodosByPriority(todos) {
  return todos.sort((a, b) => {
    const aPriority = PRIORITY_ORDER[a.priority] ?? 99;
    const bPriority = PRIORITY_ORDER[b.priority] ?? 99;
    const priorityDiff = aPriority - bPriority;
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title);
  });
}

/**
 * List all pending todos from .planning/todos/pending/ directory.
 * Reads each markdown file, parses frontmatter, filters invalid entries,
 * and returns sorted by priority then title.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array<{id: string, title: string, priority: string, phase: string, status: string, created: string, filename: string}>>}
 */
export async function listPendingTodos(projectDir, filters = {}) {
  const pendingDir = join(projectDir, '.planning', 'todos', 'pending');

  let entries;
  try {
    entries = await readdir(pendingDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  // Filter for .md files and extract ID from filename prefix
  const mdFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => ({
      filename: entry.name,
      filePath: join(pendingDir, entry.name),
      fileId: entry.name.match(/^(\d{3})-/)?.[1] || null
    }))
    .filter(f => f.fileId !== null);

  // Read all todo files in parallel with partial failure tolerance
  const results = await Promise.allSettled(
    mdFiles.map(f => readMarkdownFile(f.filePath))
  );

  const todos = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'fulfilled') continue;

    const { frontmatter } = results[i].value;
    const { filename, fileId } = mdFiles[i];

    // Skip todos missing required frontmatter fields
    const title = frontmatter.title;
    const priority = frontmatter.priority;
    if (!title || !priority) continue;

    todos.push({
      id: frontmatter.id || fileId,
      title,
      priority,
      phase: frontmatter.phase || '',
      status: frontmatter.status || 'pending',
      created: frontmatter.created ? String(frontmatter.created) : '',
      filename
    });
  }

  sortTodosByPriority(todos);

  // Apply filters
  const { priority, status, q } = filters;
  return todos.filter(todo => {
    if (priority && todo.priority !== priority) return false;
    if (status && todo.status !== status) return false;
    if (q && !todo.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
}

/**
 * Get a single todo by ID with full markdown content.
 * Searches .planning/todos/pending/ for a file whose name starts with the given ID.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {string} todoId - Three-digit todo ID (e.g., "001", "042")
 * @returns {Promise<{id: string, title: string, priority: string, phase: string, status: string, created: string, html: string, filename: string}>}
 * @throws {Error} With status 404 if no todo matches the given ID
 */
export async function getTodoDetail(projectDir, todoId) {
  const pendingDir = join(projectDir, '.planning', 'todos', 'pending');

  let entries;
  try {
    entries = await readdir(pendingDir);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const notFound = new Error(`Todo ${todoId} not found`);
      notFound.status = 404;
      throw notFound;
    }
    throw err;
  }

  // Find the file whose name starts with the todoId prefix
  const matchingFile = entries.find(name =>
    name.startsWith(`${todoId}-`) && name.endsWith('.md')
  );

  if (!matchingFile) {
    const notFound = new Error(`Todo ${todoId} not found`);
    notFound.status = 404;
    throw notFound;
  }

  const filePath = join(pendingDir, matchingFile);
  const { frontmatter, html } = await readMarkdownFile(filePath);

  return {
    id: frontmatter.id || todoId,
    title: frontmatter.title || 'Untitled',
    priority: frontmatter.priority || 'PX',
    phase: frontmatter.phase || '',
    status: frontmatter.status || 'pending',
    created: frontmatter.created ? String(frontmatter.created) : '',
    html,
    filename: matchingFile
  };
}

export async function createTodo(projectDir, todoData) {
  const { title, priority, description } = todoData;
  const phase = todoData.phase || '';

  if (!title || !priority || !description) {
    const err = new Error('Missing required fields: title, priority, and description are required');
    err.status = 400;
    throw err;
  }

  return writeQueue.enqueue(async () => {
    const todoId = await getNextTodoId(projectDir);
    const slug = titleToSlug(title);
    const filename = `${todoId}-${slug}.md`;
    const pendingDir = join(projectDir, '.planning', 'todos', 'pending');

    await mkdir(pendingDir, { recursive: true });

    const frontmatter = {
      id: todoId,
      title,
      priority,
      phase,
      status: 'pending',
      created: new Date().toISOString().split('T')[0]
    };

    const fileContent = matter.stringify(description, frontmatter);
    const filePath = join(pendingDir, filename);
    await writeFile(filePath, fileContent, 'utf-8');

    return todoId;
  });
}

export async function completeTodo(projectDir, todoId) {
  return writeQueue.enqueue(async () => {
    const pendingDir = join(projectDir, '.planning', 'todos', 'pending');
    const doneDir = join(projectDir, '.planning', 'todos', 'done');

    let entries;
    try {
      entries = await readdir(pendingDir);
    } catch (err) {
      if (err.code === 'ENOENT') {
        const notFound = new Error(`Todo ${todoId} not found`);
        notFound.status = 404;
        throw notFound;
      }
      throw err;
    }

    const matchingFile = entries.find(name =>
      name.startsWith(`${todoId}-`) && name.endsWith('.md')
    );

    if (!matchingFile) {
      const notFound = new Error(`Todo ${todoId} not found`);
      notFound.status = 404;
      throw notFound;
    }

    const pendingPath = join(pendingDir, matchingFile);
    const raw = await readFile(pendingPath, 'utf-8');
    const parsed = matter(raw, { engines: { javascript: false } });

    parsed.data.status = 'done';
    const updatedContent = matter.stringify(parsed.content, parsed.data);
    await writeFile(pendingPath, updatedContent, 'utf-8');

    await mkdir(doneDir, { recursive: true });
    const donePath = join(doneDir, matchingFile);
    await rename(pendingPath, donePath);
  });
}
