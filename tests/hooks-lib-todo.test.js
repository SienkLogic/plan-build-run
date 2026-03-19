/**
 * Tests for hooks/lib/todo.js — CRUD, parse, slug generation.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const {
  todoList,
  todoGet,
  todoAdd,
  todoDone,
  parseTodoFilename,
  parseTodoFile,
  findHighestNumber,
  generateSlug
} = require('../hooks/lib/todo');

let tmpDir, planningDir;

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
});

function setupTodoProject() {
  ({ tmpDir, planningDir } = createTmpPlanning());
  const pendingDir = path.join(planningDir, 'todos', 'pending');
  const doneDir = path.join(planningDir, 'todos', 'done');
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.mkdirSync(doneDir, { recursive: true });
  return { pendingDir, doneDir };
}

function writeTodo(dir, filename, title, extra = {}) {
  const priority = extra.priority || 'P2';
  const theme = extra.theme || 'general';
  fs.writeFileSync(path.join(dir, filename), [
    '---',
    `title: "${title}"`,
    'status: pending',
    `priority: ${priority}`,
    'source: cli',
    'created: 2026-03-19',
    `theme: ${theme}`,
    '---',
    '',
    '## Goal',
    '',
    title
  ].join('\n'));
}

describe('generateSlug', () => {
  it('generates hyphenated slug from description', () => {
    expect(generateSlug('Fix the login bug')).toBe('fix-login-bug');
  });

  it('removes stop words', () => {
    expect(generateSlug('Add a new feature to the system')).toBe('add-new-feature-system');
  });

  it('handles special characters', () => {
    expect(generateSlug('Fix bug #123!')).toBe('fix-bug-123');
  });

  it('limits to 4 meaningful words', () => {
    const slug = generateSlug('one two three four five six seven');
    const words = slug.split('-');
    expect(words.length).toBeLessThanOrEqual(4);
  });

  it('returns untitled for empty string', () => {
    expect(generateSlug('')).toBe('untitled');
  });

  it('returns untitled for all stop words', () => {
    expect(generateSlug('a the and or')).toBe('untitled');
  });
});

describe('parseTodoFilename', () => {
  it('parses valid filename', () => {
    const result = parseTodoFilename('042-fix-login-bug.md');
    expect(result).toEqual({ number: 42, slug: 'fix-login-bug' });
  });

  it('parses three-digit padded filename', () => {
    const result = parseTodoFilename('001-setup.md');
    expect(result).toEqual({ number: 1, slug: 'setup' });
  });

  it('returns null for invalid filename', () => {
    expect(parseTodoFilename('not-a-todo.md')).toBeNull();
    expect(parseTodoFilename('readme.txt')).toBeNull();
  });
});

describe('parseTodoFile', () => {
  it('parses a todo file with frontmatter and body', () => {
    const { pendingDir } = setupTodoProject();
    const filename = '001-fix-bug.md';
    writeTodo(pendingDir, filename, 'Fix the bug');

    const result = parseTodoFile(path.join(pendingDir, filename), filename);
    expect(result.number).toBe(1);
    expect(result.slug).toBe('fix-bug');
    expect(result.title).toBe('Fix the bug');
    expect(result.priority).toBe('P2');
    expect(result.body).toContain('Fix the bug');
  });
});

describe('findHighestNumber', () => {
  it('returns 0 when no todos exist', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    expect(findHighestNumber(planningDir)).toBe(0);
  });

  it('returns highest number from pending and done', () => {
    const { pendingDir, doneDir } = setupTodoProject();
    writeTodo(pendingDir, '003-task-a.md', 'Task A');
    writeTodo(doneDir, '005-task-b.md', 'Task B');

    expect(findHighestNumber(planningDir)).toBe(5);
  });
});

describe('todoAdd', () => {
  it('creates a new todo file in pending', () => {
    setupTodoProject();
    const result = todoAdd(planningDir, 'Fix the login bug');
    expect(result.success).toBe(true);
    expect(result.number).toBe(1);
    expect(result.filename).toMatch(/^001-fix-login-bug\.md$/);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('increments number based on existing todos', () => {
    const { pendingDir } = setupTodoProject();
    writeTodo(pendingDir, '003-old.md', 'Old task');

    const result = todoAdd(planningDir, 'New task');
    expect(result.number).toBe(4);
  });

  it('returns error for empty title', () => {
    setupTodoProject();
    const result = todoAdd(planningDir, '');
    expect(result.error).toBeTruthy();
  });

  it('accepts priority and theme options', () => {
    setupTodoProject();
    const result = todoAdd(planningDir, 'Critical bug', { priority: 'P1', theme: 'bugs' });
    expect(result.success).toBe(true);
    const content = fs.readFileSync(result.path, 'utf8');
    expect(content).toContain('priority: P1');
    expect(content).toContain('theme: bugs');
  });
});

describe('todoList', () => {
  it('lists pending todos', () => {
    const { pendingDir } = setupTodoProject();
    writeTodo(pendingDir, '001-task-a.md', 'Task A');
    writeTodo(pendingDir, '002-task-b.md', 'Task B');

    const result = todoList(planningDir);
    expect(result.count).toBe(2);
    expect(result.todos[0].number).toBe(1);
    expect(result.todos[1].number).toBe(2);
  });

  it('filters by theme', () => {
    const { pendingDir } = setupTodoProject();
    writeTodo(pendingDir, '001-task-a.md', 'Task A', { theme: 'bugs' });
    writeTodo(pendingDir, '002-task-b.md', 'Task B', { theme: 'features' });

    const result = todoList(planningDir, { theme: 'bugs' });
    expect(result.count).toBe(1);
    expect(result.todos[0].title).toBe('Task A');
  });

  it('lists all todos from pending and done', () => {
    const { pendingDir, doneDir } = setupTodoProject();
    writeTodo(pendingDir, '001-task-a.md', 'Task A');
    writeTodo(doneDir, '002-task-b.md', 'Task B');

    const result = todoList(planningDir, { status: 'all' });
    expect(result.count).toBe(2);
  });

  it('returns empty list when no todos directory exists', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = todoList(planningDir);
    expect(result.count).toBe(0);
    expect(result.todos).toEqual([]);
  });
});

describe('todoGet', () => {
  it('retrieves a specific todo by number', () => {
    const { pendingDir } = setupTodoProject();
    writeTodo(pendingDir, '042-fix-login.md', 'Fix login');

    const result = todoGet(planningDir, 42);
    expect(result.title).toBe('Fix login');
    expect(result.location).toBe('pending');
  });

  it('returns error for nonexistent todo', () => {
    setupTodoProject();
    const result = todoGet(planningDir, 999);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('999');
  });

  it('finds done todos', () => {
    const { doneDir } = setupTodoProject();
    writeTodo(doneDir, '005-completed.md', 'Done task');

    const result = todoGet(planningDir, 5);
    expect(result.title).toBe('Done task');
    expect(result.location).toBe('done');
  });
});

describe('todoDone', () => {
  it('moves todo from pending to done', () => {
    const { pendingDir, doneDir } = setupTodoProject();
    writeTodo(pendingDir, '001-fix-bug.md', 'Fix bug');

    const result = todoDone(planningDir, 1);
    expect(result.success).toBe(true);
    expect(result.title).toBe('Fix bug');

    // File should be in done, not in pending
    expect(fs.existsSync(path.join(doneDir, '001-fix-bug.md'))).toBe(true);
    expect(fs.existsSync(path.join(pendingDir, '001-fix-bug.md'))).toBe(false);
  });

  it('updates status and adds completed date', () => {
    const { pendingDir, doneDir } = setupTodoProject();
    writeTodo(pendingDir, '001-fix-bug.md', 'Fix bug');

    todoDone(planningDir, 1);
    const content = fs.readFileSync(path.join(doneDir, '001-fix-bug.md'), 'utf8');
    expect(content).toContain('status: done');
    expect(content).toContain('completed:');
  });

  it('returns error when todo is not found in pending', () => {
    setupTodoProject();
    const result = todoDone(planningDir, 999);
    expect(result.error).toBeTruthy();
  });

  it('returns error when no pending directory exists', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = todoDone(planningDir, 1);
    expect(result.error).toBeTruthy();
  });
});
