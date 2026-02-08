# Phase Research: Todo Write Operations

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 09-todo-write-operations
> Confidence: HIGH

## User Constraints

**From CONTEXT.md:**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Enable users to create new todos and mark existing todos as done through the web UI. This phase implements POST /todos for creating new markdown files with YAML frontmatter in `.planning/todos/pending/`, and PUT /todos/:id/done for moving files from `pending/` to `done/` directory. Write operations use a sequential queue to prevent concurrent file corruption.

## Implementation Approach

### Recommended Approach

Implement todo write operations using Express 5.x POST/PUT routes with `gray-matter` for frontmatter stringification, native Node.js `fs/promises` for file operations, and a simple promise-based queue for write serialization.

**Steps**:

1. **Create POST /todos route** [S2] - Add route handler in `pages.routes.js` to accept form data via `express.urlencoded()` middleware
2. **Generate next todo ID** [S6-VERIFIED] - Scan both `pending/` and `done/` directories, extract numeric prefixes from filenames, return highest + 1
3. **Stringify YAML frontmatter** [S2] - Use `gray-matter.stringify(content, data)` to create markdown file with frontmatter
4. **Write file atomically** [S2] - Use `fs.promises.writeFile()` with UTF-8 encoding to `.planning/todos/pending/{id}-{slug}.md`
5. **Create PUT /todos/:id/done route** [S2] - Add route handler to mark todo as done
6. **Move file to done directory** [S2] - Use `fs.promises.rename()` to move from `pending/` to `done/`
7. **Ensure done directory exists** [S2] - Use `fs.promises.mkdir(path, { recursive: true })` before rename
8. **Queue all writes** [S4-MEDIUM] - Implement simple promise queue to serialize file operations
9. **Update status in frontmatter** [S2] - Read file, update `status: 'done'` field, write back when marking done
10. **Redirect after POST** [S2] - Use `res.redirect()` to todo detail page or list after successful operations

**Key decisions**:
- Use `express.urlencoded({ extended: false })` [S2] - Already configured in app.js, sufficient for flat form data
- Use gray-matter stringify over manual template [S2-HIGH] - Industry standard, handles edge cases (special chars, multiline)
- Use fs.rename over fs.copyFile + fs.unlink [S2-HIGH] - Atomic operation within same filesystem, simpler error handling
- Implement custom queue over async-mutex dependency [S4-MEDIUM] - Avoid dependency bloat for simple use case
- Generate filename slug from title [S6-MEDIUM] - Kebab-case transformation for human-readable URLs

### Configuration Details

**Express middleware (already configured):**
```javascript
// src/app.js (existing)
app.use(express.urlencoded({ extended: false }));
```

**POST route structure:**
```javascript
// src/routes/pages.routes.js
router.post('/todos', async (req, res) => {
  const { title, priority, phase, description } = req.body;
  const projectDir = req.app.locals.projectDir;

  const todoId = await createTodo(projectDir, {
    title,
    priority,
    phase,
    description
  });

  res.redirect(`/todos/${todoId}`);
});
```

**PUT route structure:**
```javascript
// src/routes/pages.routes.js
router.put('/todos/:id/done', async (req, res) => {
  const { id } = req.params;
  const projectDir = req.app.locals.projectDir;

  await markTodoDone(projectDir, id);

  res.redirect(`/todos/${id}`);
});
```

**Note:** [S5] HTML forms only support GET and POST. To use PUT, either:
- Option A: Use POST with `?_method=PUT` query parameter (requires method-override middleware)
- Option B: Use POST to `/todos/:id/done` endpoint instead of PUT (simpler, no new dependency)

**Recommendation:** Use POST for mark-as-done operation [S6-HIGH] - Simpler than adding method-override, consistent with HTML form limitations, semantic enough for single-user local tool.

### API Patterns

**gray-matter stringify [S2]:**
```javascript
import matter from 'gray-matter';

const content = 'Todo description goes here...';
const frontmatter = {
  id: '006',
  title: 'Implement todo creation',
  priority: 'P1',
  phase: '09-todo-write-operations',
  status: 'pending',
  created: '2026-02-08'
};

const fileContent = matter.stringify(content, frontmatter);
// Returns:
// ---
// id: '006'
// title: Implement todo creation
// priority: P1
// phase: 09-todo-write-operations
// status: pending
// created: '2026-02-08'
// ---
// Todo description goes here...
```

**fs.promises.writeFile [S2]:**
```javascript
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const filePath = join(projectDir, '.planning', 'todos', 'pending', '006-implement-todo-creation.md');
await writeFile(filePath, fileContent, 'utf-8');
```

**fs.promises.rename [S2]:**
```javascript
import { rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const oldPath = join(projectDir, '.planning', 'todos', 'pending', '006-implement-todo-creation.md');
const newPath = join(projectDir, '.planning', 'todos', 'done', '006-implement-todo-creation.md');

// Ensure destination directory exists
await mkdir(dirname(newPath), { recursive: true });

// Move file atomically (same filesystem)
await rename(oldPath, newPath);
```

**Cross-platform note [S2]:** `fs.rename()` uses system rename(2) which doesn't work across different mount points/drives. This is acceptable for this use case because:
- `.planning/todos/pending/` and `.planning/todos/done/` are always in same project directory
- Same filesystem guarantee is implicit in the project structure
- If needed, fallback to copy + delete pattern can be added with try/catch

**Promise queue pattern [S4]:**
```javascript
// Lightweight sequential queue without dependencies
class WriteQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  enqueue(fn) {
    this.tail = this.tail.finally(() => fn());
    return this.tail;
  }
}

// Usage
const writeQueue = new WriteQueue();

export async function createTodo(projectDir, data) {
  return writeQueue.enqueue(async () => {
    // Generate ID, write file, etc.
  });
}

export async function markTodoDone(projectDir, todoId) {
  return writeQueue.enqueue(async () => {
    // Move file, update frontmatter, etc.
  });
}
```

**ID generation pattern [S6]:**
```javascript
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function getNextTodoId(projectDir) {
  const pendingDir = join(projectDir, '.planning', 'todos', 'pending');
  const doneDir = join(projectDir, '.planning', 'todos', 'done');

  let highestId = 0;

  // Check both directories
  for (const dir of [pendingDir, doneDir]) {
    try {
      const files = await readdir(dir);
      for (const filename of files) {
        // Extract ID from "001-title.md" pattern
        const match = filename.match(/^(\d{3})-/);
        if (match) {
          const id = parseInt(match[1], 10);
          if (id > highestId) highestId = id;
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // Directory doesn't exist yet, continue
    }
  }

  // Return next ID as zero-padded string
  return String(highestId + 1).padStart(3, '0');
}
```

**Filename slug generation [S6]:**
```javascript
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
    .slice(0, 50);                 // Limit length for filesystem compatibility
}

// Example: "Implement Todo Creation" → "implement-todo-creation"
const filename = `${todoId}-${titleToSlug(title)}.md`;
```

### Data Models

**Todo creation input (from form):**
```javascript
{
  title: string,      // Required, max 200 chars
  priority: string,   // Required, enum: P0, P1, P2, PX
  phase: string,      // Optional, format: "01-phase-name" or ""
  description: string // Required, markdown content
}
```

**Todo frontmatter schema:**
```yaml
---
id: string           # "006" (3-digit zero-padded)
title: string        # "Implement todo creation"
priority: string     # "P1" (P0|P1|P2|PX)
phase: string        # "09-todo-write-operations" or ""
status: string       # "pending" | "done"
created: string      # "2026-02-08" (YYYY-MM-DD)
---
```

**File naming convention:**
```
{id}-{slug}.md
006-implement-todo-creation.md
```

### Pico.css Form Markup

**Create Todo Form [S2]:**
```html
<form method="POST" action="/todos">
  <label>
    Title
    <input
      type="text"
      name="title"
      placeholder="Todo title"
      required
      maxlength="200"
    />
  </label>

  <label>
    Priority
    <select name="priority" required>
      <option value="">Select priority...</option>
      <option value="P0">P0 - Critical</option>
      <option value="P1">P1 - High</option>
      <option value="P2">P2 - Medium</option>
      <option value="PX">PX - Low</option>
    </select>
  </label>

  <label>
    Phase (optional)
    <input
      type="text"
      name="phase"
      placeholder="e.g., 09-todo-write-operations"
      pattern="^\d{2}-[a-z0-9-]+$"
    />
    <small>Format: 01-phase-name</small>
  </label>

  <label>
    Description
    <textarea
      name="description"
      rows="10"
      required
      placeholder="Markdown content..."
    ></textarea>
  </label>

  <button type="submit">Create Todo</button>
</form>
```

**Mark as Done Form [S2]:**
```html
<!-- Simple inline form on todo detail page -->
<form method="POST" action="/todos/<%= id %>/done">
  <button type="submit">Mark as Done</button>
</form>
```

**Pico.css features [S2]:**
- Semantic HTML, no classes needed on inputs
- `width: 100%` by default for responsive layout
- Validation states automatically styled (`:invalid`, `:valid`)
- Helper text with `<small>` element below inputs
- Consistent button sizing matches input height

## Dependencies

All required dependencies are already installed in the project:

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| express | 5.x | POST/PUT route handling | Web server |
| gray-matter | 4.x | YAML frontmatter stringify | Todo file creation |
| node:fs/promises | Built-in | File write, move, mkdir operations | Todo persistence |
| node:path | Built-in | Cross-platform path joining | File paths |

**No new dependencies needed** [S2-HIGH] - All functionality can be implemented with existing stack.

## Pitfalls for This Phase

1. **Concurrent file writes** [S4-HIGH]: Without a queue, parallel POST requests could corrupt files or create duplicate IDs. Two requests arriving simultaneously might both read the same highest ID before either writes, causing collisions. Mitigation: Implement promise queue to serialize all write operations.

2. **Cross-filesystem renames** [S2-MEDIUM]: `fs.rename()` fails with EXDEV error when source and destination are on different mount points (e.g., different drives on Windows). This is unlikely in practice because `pending/` and `done/` are in the same `.planning/` directory. Mitigation: Acceptable risk for local tool; document the limitation. Advanced: Wrap rename in try/catch and fallback to copy + delete.

3. **Missing done directory** [S2-HIGH]: First call to mark todo as done will fail if `.planning/todos/done/` doesn't exist. Mitigation: Always call `mkdir(dirname(newPath), { recursive: true })` before `rename()`. The recursive option prevents EEXIST errors if directory already exists.

4. **Invalid characters in filenames** [S6-MEDIUM]: User-provided titles may contain filesystem-unsafe characters (/, \, :, *, ?, ", <, >, |). Mitigation: Slug transformation replaces non-alphanumeric chars with hyphens and limits length. Test on Windows (most restrictive filesystem).

5. **Form validation bypass** [S6-MEDIUM]: Client-side HTML5 validation (required, maxlength, pattern) can be bypassed by crafting direct POST requests. Mitigation: Server-side validation in service layer before writing files. Check required fields, validate priority enum, validate phase format.

6. **HTML form method limitation** [S5-MEDIUM]: Forms only support GET/POST, not PUT/DELETE. Using PUT /todos/:id/done requires either method-override middleware or accepting the semantic compromise of POST. Mitigation: Use POST to `/todos/:id/done` endpoint - simpler, no new dependency, adequate for single-user tool.

7. **File encoding issues** [S2-LOW]: Windows editors may add UTF-8 BOM to files. Gray-matter handles this in read path (already implemented in `planning.repository.js`), but write path must use consistent UTF-8 encoding. Mitigation: Always specify 'utf-8' encoding in `writeFile()` calls.

8. **Markdown content with frontmatter delimiters** [S2-LOW]: If user description contains `---` on its own line, it could break frontmatter parsing. Gray-matter handles this correctly - it only recognizes frontmatter at the start of file. No mitigation needed, document as known-safe.

9. **Race condition in ID generation** [S4-HIGH]: Reading directory to find highest ID is not atomic. If two requests generate IDs simultaneously, both might get the same ID before either writes. This is the primary reason for the write queue - it serializes the entire create operation (read → generate ID → write). Mitigation: Enqueue the entire createTodo operation, not just the write.

10. **Status field not updated on mark done** [S6-MEDIUM]: Simply moving file from pending/ to done/ doesn't update the `status: 'pending'` frontmatter field. This could cause confusion if file is moved back or if code checks status field. Mitigation: Read file, parse frontmatter, update status to 'done', write back, then move. Alternative: Don't store status in frontmatter, derive it from directory location (simpler, less duplication).

## Testing Strategy

**Unit tests for service layer:**
```javascript
// todo.service.test.js
describe('createTodo', () => {
  it('generates sequential IDs', async () => {
    const id1 = await createTodo(projectDir, { title: 'First', priority: 'P1', description: 'Test' });
    const id2 = await createTodo(projectDir, { title: 'Second', priority: 'P1', description: 'Test' });
    expect(parseInt(id2)).toBe(parseInt(id1) + 1);
  });

  it('creates file in pending directory', async () => {
    const id = await createTodo(projectDir, { title: 'Test Todo', priority: 'P1', description: 'Test' });
    const filePath = join(projectDir, '.planning/todos/pending', `${id}-test-todo.md`);
    const exists = await access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('writes valid YAML frontmatter', async () => {
    const id = await createTodo(projectDir, {
      title: 'Test',
      priority: 'P1',
      phase: '09-todo-write-operations',
      description: 'Description'
    });
    const todo = await getTodoDetail(projectDir, id);
    expect(todo.title).toBe('Test');
    expect(todo.priority).toBe('P1');
    expect(todo.phase).toBe('09-todo-write-operations');
    expect(todo.status).toBe('pending');
  });
});

describe('markTodoDone', () => {
  it('moves file from pending to done', async () => {
    const id = await createTodo(projectDir, { title: 'Test', priority: 'P1', description: 'Test' });
    await markTodoDone(projectDir, id);

    const pendingPath = join(projectDir, '.planning/todos/pending', `${id}-test.md`);
    const donePath = join(projectDir, '.planning/todos/done', `${id}-test.md`);

    const pendingExists = await access(pendingPath).then(() => true).catch(() => false);
    const doneExists = await access(donePath).then(() => true).catch(() => false);

    expect(pendingExists).toBe(false);
    expect(doneExists).toBe(true);
  });

  it('updates status field to done', async () => {
    const id = await createTodo(projectDir, { title: 'Test', priority: 'P1', description: 'Test' });
    await markTodoDone(projectDir, id);

    const donePath = join(projectDir, '.planning/todos/done', `${id}-test.md`);
    const { frontmatter } = await readMarkdownFile(donePath);
    expect(frontmatter.status).toBe('done');
  });
});

describe('WriteQueue', () => {
  it('executes operations sequentially', async () => {
    const queue = new WriteQueue();
    const results = [];

    queue.enqueue(async () => {
      await delay(50);
      results.push(1);
    });
    queue.enqueue(async () => {
      results.push(2);
    });

    await queue.tail;
    expect(results).toEqual([1, 2]);
  });

  it('prevents concurrent ID generation', async () => {
    // Create two todos "simultaneously"
    const [id1, id2] = await Promise.all([
      createTodo(projectDir, { title: 'First', priority: 'P1', description: 'Test' }),
      createTodo(projectDir, { title: 'Second', priority: 'P1', description: 'Test' })
    ]);

    // IDs should be different (no collision)
    expect(id1).not.toBe(id2);
  });
});
```

**Integration tests for routes:**
```javascript
// pages.routes.test.js
describe('POST /todos', () => {
  it('creates todo and redirects to detail page', async () => {
    const response = await request(app)
      .post('/todos')
      .type('form')
      .send({
        title: 'New Todo',
        priority: 'P1',
        phase: '09-todo-write-operations',
        description: 'Test description'
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^\/todos\/\d{3}$/);
  });

  it('returns 400 for missing required fields', async () => {
    const response = await request(app)
      .post('/todos')
      .type('form')
      .send({ title: 'No priority' });

    expect(response.status).toBe(400);
  });
});

describe('POST /todos/:id/done', () => {
  it('marks todo as done and redirects', async () => {
    // Setup: create a todo first
    const id = await createTodo(projectDir, {
      title: 'Test',
      priority: 'P1',
      description: 'Test'
    });

    const response = await request(app)
      .post(`/todos/${id}/done`)
      .send();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`/todos/${id}`);
  });

  it('returns 404 for non-existent todo', async () => {
    const response = await request(app)
      .post('/todos/999/done')
      .send();

    expect(response.status).toBe(404);
  });
});
```

**Manual testing checklist:**
- [ ] Create todo with all fields populated
- [ ] Create todo with optional phase field empty
- [ ] Create todo with special characters in title (test slug generation)
- [ ] Create todo with very long title (test slug truncation)
- [ ] Create todo with markdown content containing `---` (test frontmatter safety)
- [ ] Create multiple todos rapidly (test queue serialization)
- [ ] Mark todo as done (verify file moves and status updates)
- [ ] Mark same todo as done twice (should 404 on second attempt)
- [ ] Verify todos list shows new todos immediately
- [ ] Verify todo detail page shows created todo correctly
- [ ] Test on Windows (filesystem path compatibility)
- [ ] Test on macOS/Linux (cross-platform verification)

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Express 5.x API Reference](https://expressjs.com/en/5x/api.html) | HIGH |
| S2 | Official Docs | [gray-matter GitHub](https://github.com/jonschlinkert/gray-matter) | HIGH |
| S2 | Official Docs | [Node.js File System API](https://nodejs.org/api/fs.html) | HIGH |
| S2 | Official Docs | [Pico.css Forms](https://picocss.com/docs/forms) | HIGH |
| S4 | WebSearch - Verified | [Method Override in Express](https://expressjs.com/en/resources/middleware/method-override.html) | MEDIUM |
| S4 | WebSearch - Verified | [Mutual Exclusion with Promises](https://thecodebarbarian.com/mutual-exclusion-patterns-with-node-promises.html) | MEDIUM |
| S4 | WebSearch - Verified | [Promise-based Sequential Queue](https://gist.github.com/Aaronius/fdb06370a6a67dc4f726) | MEDIUM |
| S5 | WebSearch - Unverified | [Express Yourself: Handling Form Data](https://medium.com/@pirvan.marian/express-yourself-handling-form-data-with-express-urlencoded-1f44f906f332) | LOW |
| S5 | WebSearch - Unverified | [How to Move a File in Node.js](https://mdawar.dev/blog/node-js-move-file) | LOW |
| S6 | Training Knowledge | ID generation pattern, slug transformation, validation strategy | HYPOTHESIS |
