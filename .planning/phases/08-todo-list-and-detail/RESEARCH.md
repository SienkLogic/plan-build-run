# Phase Research: Todo List and Detail

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 08-todo-list-and-detail
> Confidence: HIGH

## User Constraints

**Locked Decisions:**
- Node.js 24 LTS
- Express 5.x
- HTMX + Alpine.js (no build step, server-rendered)
- EJS templates
- Pico.css
- gray-matter (frontmatter parser)
- marked (markdown renderer)
- Three-layer architecture (Routes → Services → Repositories)

**Project Constraints:**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Phase Goal

Build a todo list view that displays all pending todos from `.planning/todos/pending/` with priority badges (P0/P1/P2/PX) and phase tags, plus a detail view for individual todos at `/todos/:id`.

## Implementation Approach

### Recommended Approach

**Architecture:** Follow the existing three-layer pattern used in Phase 05 (phase detail view).

**Steps:**

1. **Repository Layer** - Extend `planning.repository.js` with todo-specific functions [S2]
   - Use existing `readMarkdownFile()` to parse todo frontmatter [S3-existing]
   - Add new function to list files from a specific directory (non-recursive)
   - Filter for `.md` files only

2. **Service Layer** - Create `todo.service.js` [S3-existing pattern]
   - List all pending todos from `.planning/todos/pending/`
   - Parse frontmatter for each todo (id, title, priority, phase, status)
   - Sort by priority (P0 first, then P1, P2, PX) then alphabetically by title [S2]
   - Get individual todo by ID with full markdown content

3. **Route Layer** - Update `pages.routes.js` [S2]
   - Replace coming-soon placeholder for `GET /todos`
   - Add new route `GET /todos/:id` with ID validation [S2]
   - Use Express route parameters pattern: `req.params.id` [S2-HIGH]

4. **View Layer** - Create EJS templates [S3-existing]
   - Create `todos.ejs` for list view
   - Create `todo-detail.ejs` for individual todo view
   - Use table layout (consistent with roadmap and phase detail views) [S3-existing]
   - Add priority badge CSS extending existing `status-badge` pattern [S3-existing]

**Key Decisions:**

- **Table vs. Card layout**: Use table layout [S3-existing, MEDIUM] - The existing roadmap and phase detail views use tables. Consistency is more important than theoretical "best practice" for card layouts.
- **Directory listing**: Use Node.js `fs.readdir()` without recursive option [S2-HIGH] - Native API, no need for third-party packages.
- **Priority sorting**: Use array sort with multiple criteria [S2-HIGH] - Standard JavaScript pattern with fallback comparison.
- **Badge styling**: Extend existing `status-badge` class with new priority variants [S3-existing, HIGH] - Reuse proven pattern rather than create new badge system.

### Configuration Details

**Todo File Structure** [S3-existing]:
```
.planning/
  todos/
    pending/
      001-example.md
      002-another.md
    done/
      001-completed.md
```

**Todo Frontmatter Format** [S3-existing]:
```yaml
---
title: "Todo title here"
status: pending
priority: P1
phase: general
source: dogfood-testing
created: 2026-02-07
---
```

**Priority Levels** [S3-context]:
- P0: Critical
- P1: High
- P2: Medium
- PX: Nice to have

**Priority Sort Order** [S6-HYPOTHESIS]:
Order should be P0 → P1 → P2 → PX. Need to map string values to numeric sort order.

### API Patterns

#### List Todos Endpoint

```javascript
// Route: GET /todos
router.get('/todos', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const todos = await getTodoList(projectDir);

  res.render('todos', {
    title: 'Todos',
    activePage: 'todos',
    todos: todos
  });
});
```

**Response Shape** [S3-existing pattern]:
```javascript
[
  {
    id: "001",
    title: "Todo title",
    priority: "P1",
    phase: "general",
    status: "pending",
    filename: "001-example.md"
  }
]
```

#### Get Todo Detail Endpoint

```javascript
// Route: GET /todos/:id
router.get('/todos/:id', async (req, res) => {
  const { id } = req.params; // [S2-HIGH]

  // Validate ID format (3 digits)
  if (!/^\d{3}$/.test(id)) {
    const err = new Error('Todo ID must be a three-digit number (e.g., 001, 005, 042)');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const todo = await getTodoDetail(projectDir, id);

  res.render('todo-detail', {
    title: `Todo ${id}: ${todo.title}`,
    activePage: 'todos',
    ...todo
  });
});
```

**URL Pattern** [S2-HIGH]:
- `/todos/001` → loads `001-*.md` from pending directory
- ID is always 3 digits (001, 042, 123)
- Express extracts as `req.params.id`

**Response Shape** [S3-existing pattern]:
```javascript
{
  id: "001",
  title: "Todo title",
  priority: "P1",
  phase: "general",
  status: "pending",
  created: "2026-02-07",
  html: "<h2>Problem</h2><p>...</p>",
  filename: "001-example.md"
}
```

### Data Models

**Priority Badge Mapping** [S3-existing]:

Extend `status-colors.css` with priority variants:

```css
/* Priority badge variants - extends existing status-badge pattern */
.status-badge[data-priority="P0"] {
  background-color: #fee2e2; /* red-100 */
  color: #7f1d1d;            /* red-900 */
}

.status-badge[data-priority="P1"] {
  background-color: #fed7aa; /* orange-200 */
  color: #7c2d12;            /* orange-900 */
}

.status-badge[data-priority="P2"] {
  background-color: #fef9c3; /* yellow-200 */
  color: #713f12;            /* yellow-900 */
}

.status-badge[data-priority="PX"] {
  background-color: #e0e7ff; /* indigo-100 */
  color: #312e81;            /* indigo-900 */
}
```

**Color Rationale** [S4-MEDIUM]:
- P0 (Critical): Red - urgent, blocking
- P1 (High): Orange - important, high attention
- P2 (Medium): Yellow - standard priority
- PX (Nice to have): Indigo/Purple - low priority, nice accent color

**Sort Implementation** [S2-HIGH]:

```javascript
function sortTodosByPriority(todos) {
  const priorityOrder = { P0: 0, P1: 1, P2: 2, PX: 3 };

  return todos.sort((a, b) => {
    // Sort by priority first
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // If priority is the same, sort alphabetically by title
    return a.title.localeCompare(b.title);
  });
}
```

Reference: [Sorting an array by multiple criteria with vanilla JavaScript](https://gomakethings.com/sorting-an-array-by-multiple-criteria-with-vanilla-javascript/) [S2]

### Directory Listing Implementation

**Non-Recursive Directory Read** [S2-HIGH]:

```javascript
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * List all markdown files in .planning/todos/pending/ directory.
 *
 * @param {string} projectDir - Absolute path to project root
 * @returns {Promise<string[]>} Array of absolute file paths to .md files
 */
export async function listPendingTodos(projectDir) {
  const todosDir = join(projectDir, '.planning', 'todos', 'pending');

  try {
    const entries = await readdir(todosDir, { withFileTypes: true });

    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => join(todosDir, entry.name));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // Directory doesn't exist yet
    }
    throw error;
  }
}
```

**Key Points** [S2-HIGH]:
- `readdir()` is non-recursive by default
- `withFileTypes: true` returns `fs.Dirent` objects with `.isFile()` method
- Filter for `.md` extension only
- Handle ENOENT gracefully (directory might not exist yet)

Reference: [Node.js File system documentation](https://nodejs.org/api/fs.html) [S2]

### View Template Structure

**List View** (`todos.ejs`) [S3-existing pattern]:

```html
<%- include('partials/layout-top', { title: 'Todos', activePage: 'todos' }) %>

<h1>Todos</h1>

<% if (todos.length > 0) { %>
<article>
  <table>
    <thead>
      <tr>
        <th scope="col">ID</th>
        <th scope="col">Title</th>
        <th scope="col">Priority</th>
        <th scope="col">Phase</th>
        <th scope="col">Status</th>
      </tr>
    </thead>
    <tbody>
      <% todos.forEach(function(todo) { %>
      <tr>
        <td><%= todo.id %></td>
        <td>
          <a href="/todos/<%= todo.id %>">
            <%= todo.title %>
          </a>
        </td>
        <td>
          <span class="status-badge" data-priority="<%= todo.priority %>">
            <%= todo.priority %>
          </span>
        </td>
        <td><%= todo.phase %></td>
        <td>
          <span class="status-badge" data-status="<%= todo.status %>">
            <%= todo.status %>
          </span>
        </td>
      </tr>
      <% }); %>
    </tbody>
  </table>
</article>
<% } else { %>
<article>
  <p>No pending todos found. Add a todo file to .planning/todos/pending/ to see it here.</p>
</article>
<% } %>

<%- include('partials/layout-bottom') %>
```

**Detail View** (`todo-detail.ejs`) [S3-existing pattern]:

```html
<%- include('partials/layout-top', { title: title, activePage: 'todos' }) %>

<h1><%= title %></h1>

<p><a href="/todos">&larr; Back to Todos</a></p>

<article>
  <header>
    <strong>Todo <%= id %></strong>
    <span class="status-badge" data-priority="<%= priority %>">
      <%= priority %>
    </span>
    <span class="status-badge" data-status="<%= status %>">
      <%= status %>
    </span>
  </header>

  <p><strong>Phase:</strong> <%= phase %></p>
  <% if (created) { %>
  <p><strong>Created:</strong> <%= created %></p>
  <% } %>

  <hr>

  <%- html %>
</article>

<%- include('partials/layout-bottom') %>
```

## Dependencies

All dependencies already installed [S3-existing]:

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| gray-matter | Latest | Parse YAML frontmatter | Repository layer |
| marked | Latest | Render markdown to HTML | Repository layer |
| express | 5.x | Route parameter extraction | Route layer |
| Node.js fs/promises | Native | Directory listing | Repository layer |

## Pitfalls for This Phase

1. **Todo ID format inconsistency** [S6-HYPOTHESIS]
   - Todo files use 3-digit IDs (001, 042)
   - Phase files use 2-digit IDs (01, 05)
   - Validation regex must be `/^\d{3}$/` not `/^\d{2}$/`
   - Error: Copying phase detail validation pattern without adjusting

2. **Filename parsing** [S3-existing]
   - Todo files are named `001-description.md`
   - Need to extract ID from filename to match against URL parameter
   - Pattern: `^(\d{3})-.*\.md$`
   - Must handle case where ID in frontmatter doesn't match filename

3. **Empty directory handling** [S2-HIGH]
   - `.planning/todos/pending/` might not exist in new projects
   - `readdir()` throws ENOENT if directory doesn't exist
   - Must catch and return empty array, not crash

4. **Priority sort edge cases** [S6-HYPOTHESIS]
   - What if a todo has invalid priority like "P5" or "high"?
   - Need fallback: unknown priorities sort to end
   - Consider: log warning for invalid priorities

5. **Status vs Priority badge confusion** [S3-existing]
   - Todos have both `status` (pending/done) and `priority` (P0/P1/P2/PX)
   - Badge CSS uses `data-status` for status colors
   - Need separate `data-priority` attribute for priority colors
   - Error: Using same attribute for both will cause conflicts

6. **BOM handling** [S3-existing]
   - Existing `stripBOM()` function in repository handles UTF-8 BOM
   - Windows editors may add BOM to markdown files
   - Already solved, no additional work needed

## Testing Strategy

**Unit Tests** (Service Layer):
1. Test `sortTodosByPriority()` with mixed priorities
2. Test priority sort stability (same priority → alphabetical)
3. Test edge cases: empty array, invalid priorities

**Integration Tests** (Repository + Service):
1. List todos from real directory
2. Get todo detail by ID
3. Handle ENOENT for missing directory
4. Handle ENOENT for missing todo file

**Route Tests**:
1. GET /todos returns 200 with todo list
2. GET /todos/001 returns 200 with todo detail
3. GET /todos/999 returns 404 if todo doesn't exist
4. GET /todos/abc returns 404 (invalid ID format)
5. GET /todos/1 returns 404 (wrong digit count)

**Visual Tests** (Manual):
1. Priority badges display correct colors
2. Table layout is readable
3. Links work correctly
4. Empty state displays properly
5. Detail view renders markdown correctly

## Open Questions

1. **Should "done" todos be shown?** [OPEN]
   - Phase requirements say "lists all pending todos"
   - But there's also a `.planning/todos/done/` directory
   - Recommendation: Phase 08 shows only pending. Future phase could add "done" view.

2. **Todo without frontmatter?** [OPEN]
   - What if a `.md` file exists but has no frontmatter?
   - gray-matter returns empty object for `data`
   - Recommendation: Skip todos with missing required fields (id, title, priority)

3. **Phase tag format?** [S3-existing]
   - Real todos use `phase: general` (string)
   - Is this always a string or could it be numeric like "01"?
   - Based on existing files: always string, freeform text

4. **ID extraction strategy?** [IMPLEMENTATION-DECISION]
   - Should ID come from frontmatter `id` field or filename prefix?
   - Existing todos have both: `001-example.md` has `id: "001"` in frontmatter
   - Recommendation: Use filename as source of truth, validate against frontmatter

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2 | Official Docs | [Express routing](https://expressjs.com/en/guide/routing.html) | HIGH |
| S2 | Official Docs | [Node.js fs documentation](https://nodejs.org/api/fs.html) | HIGH |
| S2 | Tutorial | [Sorting by multiple criteria](https://gomakethings.com/sorting-an-array-by-multiple-criteria-with-vanilla-javascript/) | HIGH |
| S2 | Tutorial | [Express route parameters - MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs/routes) | HIGH |
| S3 | Existing Code | planning.repository.js - readMarkdownFile, listPlanningFiles | HIGH |
| S3 | Existing Code | phase.service.js - service layer patterns | HIGH |
| S3 | Existing Code | pages.routes.js - route patterns, validation | HIGH |
| S3 | Existing Code | roadmap.ejs, phase-detail.ejs - table layout | HIGH |
| S3 | Existing Code | status-colors.css - badge styling pattern | HIGH |
| S3 | Real Data | .planning/todos/done/001-agent-monitoring.md | HIGH |
| S4 | Search | [UX Patterns: Table vs List vs Cards](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards) | MEDIUM |
| S4 | Search | [JavaScript Array.sort() - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort) | MEDIUM |
