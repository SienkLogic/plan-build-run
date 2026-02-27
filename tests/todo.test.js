/**
 * Tests for the todo subcommand of pbr-tools.js.
 *
 * - Unit tests: parseTodoFilename, generateSlug, findHighestNumber
 * - Integration tests: todoList, todoGet against fixture data
 * - Mutation tests: todoAdd, todoDone in temp directories
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const {
  parseTodoFilename,
  generateSlug,
  findHighestNumber
} = require('../plugins/pbr/scripts/lib/todo');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'fake-project');
const SCRIPTS_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');
const TOOL_PATH = path.join(SCRIPTS_DIR, 'pbr-tools.js');

/**
 * Helper: reset pbr-tools module and re-require after chdir,
 * so that the module-level planningDir picks up the new cwd.
 */
function requireFreshPbrTools() {
  jest.resetModules();
  return require('../plugins/pbr/scripts/pbr-tools');
}

// ---------------------------------------------------------------------------
// Unit tests: helpers (no cwd dependency)
// ---------------------------------------------------------------------------
describe('parseTodoFilename', () => {
  test('parses standard filename', () => {
    const result = parseTodoFilename('042-fix-login-bug.md');
    expect(result).toEqual({ number: 42, slug: 'fix-login-bug' });
  });

  test('parses 3-digit padded number', () => {
    const result = parseTodoFilename('001-first-task.md');
    expect(result).toEqual({ number: 1, slug: 'first-task' });
  });

  test('parses high numbers', () => {
    const result = parseTodoFilename('999-last-task.md');
    expect(result).toEqual({ number: 999, slug: 'last-task' });
  });

  test('returns null for non-matching filename', () => {
    expect(parseTodoFilename('README.md')).toBeNull();
    expect(parseTodoFilename('no-number.md')).toBeNull();
    expect(parseTodoFilename('.hidden.md')).toBeNull();
  });
});

describe('generateSlug', () => {
  test('generates slug from description', () => {
    expect(generateSlug('Fix login bug')).toBe('fix-login-bug');
  });

  test('filters stop words', () => {
    expect(generateSlug('Add a rate limiting to the login')).toBe('add-rate-limiting-login');
  });

  test('limits to 4 words', () => {
    expect(generateSlug('implement user auth token refresh mechanism')).toBe('implement-user-auth-token');
  });

  test('handles empty input', () => {
    expect(generateSlug('')).toBe('untitled');
  });

  test('strips special characters', () => {
    expect(generateSlug('Fix bug #123!')).toBe('fix-bug-123');
  });
});

describe('findHighestNumber', () => {
  test('finds highest across pending and done in fixture', () => {
    const result = findHighestNumber(path.join(FIXTURE_DIR, '.planning'));
    // Fixture has 001 (pending), 002 (done), 003 (pending)
    expect(result).toBe(3);
  });

  test('returns 0 for non-existent directory', () => {
    const result = findHighestNumber('/nonexistent/.planning');
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: todoList against fixture
// ---------------------------------------------------------------------------
describe('todoList (fixture)', () => {
  let originalCwd;
  let todoList;

  beforeAll(() => {
    originalCwd = process.cwd();
    process.chdir(FIXTURE_DIR);
    todoList = requireFreshPbrTools().todoList;
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  test('lists pending todos by default', () => {
    const result = todoList();
    expect(result.count).toBe(2);
    expect(result.todos[0].number).toBe(1);
    expect(result.todos[0].title).toBe('Fix auth timeout on slow connections');
    expect(result.todos[1].number).toBe(3);
  });

  test('filters by theme', () => {
    const result = todoList({ theme: 'security' });
    expect(result.count).toBe(1);
    expect(result.todos[0].theme).toBe('security');
  });

  test('returns empty for non-matching theme', () => {
    const result = todoList({ theme: 'nonexistent' });
    expect(result.count).toBe(0);
  });

  test('lists done todos', () => {
    const result = todoList({ status: 'done' });
    expect(result.count).toBe(1);
    expect(result.todos[0].title).toBe('Set up CI pipeline');
    expect(result.todos[0].completed).toBe('2026-02-22');
  });

  test('lists all todos', () => {
    const result = todoList({ status: 'all' });
    expect(result.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: todoGet against fixture
// ---------------------------------------------------------------------------
describe('todoGet (fixture)', () => {
  let originalCwd;
  let todoGet;

  beforeAll(() => {
    originalCwd = process.cwd();
    process.chdir(FIXTURE_DIR);
    todoGet = requireFreshPbrTools().todoGet;
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  test('gets pending todo by number', () => {
    const result = todoGet(1);
    expect(result.title).toBe('Fix auth timeout on slow connections');
    expect(result.priority).toBe('P1');
    expect(result.location).toBe('pending');
    expect(result.body).toContain('Auth works on 3G connections');
  });

  test('gets done todo by number', () => {
    const result = todoGet(2);
    expect(result.title).toBe('Set up CI pipeline');
    expect(result.location).toBe('done');
  });

  test('accepts string number', () => {
    const result = todoGet('003');
    expect(result.title).toBe('Add dark mode support');
  });

  test('returns error for missing todo', () => {
    const result = todoGet(999);
    expect(result.error).toMatch(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Mutation tests: todoAdd (temp directory)
// ---------------------------------------------------------------------------
describe('todoAdd (mutation)', () => {
  let tmpDir;
  let originalCwd;
  let todoAdd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-todo-add-'));
    fs.mkdirSync(path.join(tmpDir, '.planning', 'todos', 'pending'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'todos', 'done'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    todoAdd = requireFreshPbrTools().todoAdd;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates todo file with correct naming', () => {
    const result = todoAdd('Fix login bug');
    expect(result.success).toBe(true);
    expect(result.number).toBe(1);
    expect(result.number_padded).toBe('001');
    expect(result.filename).toBe('001-fix-login-bug.md');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  test('creates correct frontmatter', () => {
    todoAdd('Test the auth flow', { priority: 'P1', theme: 'security' });
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'todos', 'pending', '001-test-auth-flow.md'), 'utf8'
    );
    expect(content).toContain('title: "Test the auth flow"');
    expect(content).toContain('priority: P1');
    expect(content).toContain('theme: security');
    expect(content).toContain('status: pending');
    expect(content).toContain('source: cli');
  });

  test('increments number past existing todos', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'todos', 'pending', '005-existing.md'),
      '---\ntitle: "Existing"\n---\n'
    );
    const result = todoAdd('New task');
    expect(result.number).toBe(6);
    expect(result.number_padded).toBe('006');
  });

  test('counts done/ todos for numbering', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'todos', 'done', '010-old-done.md'),
      '---\ntitle: "Old"\n---\n'
    );
    const result = todoAdd('After done');
    expect(result.number).toBe(11);
  });

  test('returns error for empty title', () => {
    const result = todoAdd('');
    expect(result.error).toMatch(/Title is required/);
  });

  test('creates directories if missing', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-todo-fresh-'));
    fs.mkdirSync(path.join(freshDir, '.planning'), { recursive: true });
    process.chdir(freshDir);
    const freshTools = requireFreshPbrTools();

    const result = freshTools.todoAdd('First todo ever');
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);

    process.chdir(originalCwd);
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  test('escapes quotes in title', () => {
    const result = todoAdd('Fix "double quote" issue');
    expect(result.success).toBe(true);
    const content = fs.readFileSync(result.path, 'utf8');
    expect(content).toContain('title: "Fix \\"double quote\\" issue"');
  });
});

// ---------------------------------------------------------------------------
// Mutation tests: todoDone (temp directory)
// ---------------------------------------------------------------------------
describe('todoDone (mutation)', () => {
  let tmpDir;
  let originalCwd;
  let todoDone;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-todo-done-'));
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    const doneDir = path.join(tmpDir, '.planning', 'todos', 'done');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.mkdirSync(doneDir, { recursive: true });

    // Seed a pending todo
    fs.writeFileSync(path.join(pendingDir, '007-test-task.md'), [
      '---',
      'title: "Test task for completion"',
      'status: pending',
      'priority: P2',
      'source: cli',
      'created: 2026-02-25',
      'theme: testing',
      '---',
      '',
      '## Goal',
      '',
      'A test task.'
    ].join('\n'));

    originalCwd = process.cwd();
    process.chdir(tmpDir);
    todoDone = requireFreshPbrTools().todoDone;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('moves todo from pending to done', () => {
    const result = todoDone(7);
    expect(result.success).toBe(true);
    expect(result.title).toBe('Test task for completion');

    // Verify moved
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'pending', '007-test-task.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'done', '007-test-task.md'))).toBe(true);
  });

  test('updates frontmatter status and adds completed date', () => {
    todoDone(7);
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'todos', 'done', '007-test-task.md'), 'utf8'
    );
    expect(content).toContain('status: done');
    expect(content).toMatch(/completed: \d{4}-\d{2}-\d{2}/);
  });

  test('preserves body content', () => {
    todoDone(7);
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'todos', 'done', '007-test-task.md'), 'utf8'
    );
    expect(content).toContain('## Goal');
    expect(content).toContain('A test task.');
  });

  test('returns error for non-existent todo', () => {
    const result = todoDone(999);
    expect(result.error).toMatch(/not found/);
  });

  test('returns error when no pending directory', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'todos', 'pending'), { recursive: true, force: true });
    const result = todoDone(7);
    expect(result.error).toMatch(/not found/);
  });

  test('creates done/ directory if missing', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'todos', 'done'), { recursive: true, force: true });
    const result = todoDone(7);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'done', '007-test-task.md'))).toBe(true);
  });

  test('accepts string number input', () => {
    const result = todoDone('007');
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI invocation tests (use execSync — fresh process, no module caching)
// ---------------------------------------------------------------------------
describe('CLI invocation', () => {
  test('todo list returns JSON', () => {
    const result = execSync(`node "${TOOL_PATH}" todo list`, {
      cwd: FIXTURE_DIR,
      encoding: 'utf8'
    });
    const parsed = JSON.parse(result);
    expect(parsed.todos).toBeDefined();
    expect(parsed.count).toBeGreaterThanOrEqual(2);
  });

  test('todo get returns todo data', () => {
    const result = execSync(`node "${TOOL_PATH}" todo get 1`, {
      cwd: FIXTURE_DIR,
      encoding: 'utf8'
    });
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe('Fix auth timeout on slow connections');
  });

  test('todo get returns error object for missing todo', () => {
    // todoGet returns { error: "..." } through output() which exits 0
    const result = execSync(`node "${TOOL_PATH}" todo get 999`, {
      cwd: FIXTURE_DIR,
      encoding: 'utf8'
    });
    const parsed = JSON.parse(result);
    expect(parsed.error).toMatch(/not found/);
  });

  test('todo add creates and todo done completes in temp dir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cli-todo-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

    try {
      // Add
      const addResult = execSync(
        `node "${TOOL_PATH}" todo add Fix a critical bug --priority P1 --theme security`,
        { cwd: tmpDir, encoding: 'utf8' }
      );
      const addParsed = JSON.parse(addResult);
      expect(addParsed.success).toBe(true);
      expect(addParsed.number).toBe(1);

      // Done
      const doneResult = execSync(
        `node "${TOOL_PATH}" todo done 1`,
        { cwd: tmpDir, encoding: 'utf8' }
      );
      const doneParsed = JSON.parse(doneResult);
      expect(doneParsed.success).toBe(true);

      // Verify file moved
      expect(fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'pending', '001-fix-critical-bug.md'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'done', '001-fix-critical-bug.md'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
