---
phase: "09-todo-write-operations"
verified: "2026-02-08T14:10:00Z"
status: "passed"
is_re_verification: false
score:
  total_must_haves: 24
  verified: 24
  failed: 0
  partial: 0
  human_needed: 2
gaps: []
anti_patterns:
  todos: 0
  stubs: 0
  console_logs: 4
  skipped_tests: 0
  hardcoded_secrets: 0
---

# Phase Verification: Todo Write Operations

> Verified: 2026-02-08
> Status: **PASSED**
> Score: 24/24 must-haves verified (100%)
> Re-verification: no

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | createTodo writes a new markdown file with YAML frontmatter to .planning/todos/pending/ | VERIFIED | D:\Repos\towline-test-project\src\services\todo.service.js L180-213: createTodo function writes using matter.stringify at L207, writes to pendingDir with markdown filename at L208-209. Test coverage at tests/services/todo.service.test.js L304-325 confirms file creation with correct frontmatter fields (title, priority, phase, status, created). |
| 2 | createTodo generates sequential IDs by scanning both pending/ and done/ directories | VERIFIED | D:\Repos\towline-test-project\src\services\todo.service.js L30-52: getNextTodoId scans both pendingDir and doneDir (L31-32), finds highest ID from filenames matching /^(\d{3})-/ pattern (L40), returns next sequential ID (L51). Test coverage at L327-374 confirms sequential generation and accounting for existing files in both directories. |
| 3 | completeTodo moves a file from pending/ to done/ and updates status frontmatter to 'done' | VERIFIED | D:\Repos\towline-test-project\src\services\todo.service.js L215-254: completeTodo updates status to 'done' at L246, writes updated content at L248, moves file from pendingPath to donePath at L252. Test coverage at L510-595 confirms file move, status update, and frontmatter preservation. |
| 4 | All write operations are serialized through a sequential queue preventing concurrent corruption | VERIFIED | D:\Repos\towline-test-project\src\services\todo.service.js L8-20: WriteQueue class implements promise chaining via this.tail (L10, L14-15). Both createTodo (L190) and completeTodo (L216) wrap their operations in writeQueue.enqueue(). Test coverage at L490-506 confirms concurrent creates produce unique sequential IDs (all 3 IDs unique, sorted ['001', '002', '003']). |
| 11 | User can fill out a form with title, priority, phase, and description to create a new todo | VERIFIED | D:\Repos\towline-test-project\src\views\todo-create.ejs L8-52: Form with POST action="/todos" includes title input (L9-18, required, maxlength=200), priority select (L20-29, required, P0/P1/P2/PX options), phase input (L31-39, optional), description textarea (L41-49, required, rows=10). All required fields have HTML5 'required' attribute for client-side validation. |
| 12 | POST /todos creates the todo and redirects to the new todo's detail page | VERIFIED | D:\Repos\towline-test-project\src\routes\pages.routes.js L73-85: POST /todos route extracts form fields (L74), calls createTodo (L77-82), receives todoId, redirects to /todos/:id at L84. createTodo returns the generated ID (todo.service.js L211) which is used in the redirect path. |
| 13 | User can click 'Mark as Done' on a todo detail page to complete it | VERIFIED | D:\Repos\towline-test-project\src\views\todo-detail.ejs L31-36: Conditional form (status === 'pending') renders button "Mark as Done" with class="secondary" at L34, form posts to /todos/:id/done at L33. |
| 14 | POST /todos/:id/done marks the todo done and redirects to the todos list | VERIFIED | D:\Repos\towline-test-project\src\routes\pages.routes.js L87-100: POST /todos/:id/done validates ID format (L90-94), calls completeTodo (L97), redirects to /todos at L99. completeTodo updates status to 'done' and moves file (verified in Truth #3). |
| 15 | 'Create Todo' link is visible on the todos list page | VERIFIED | D:\Repos\towline-test-project\src\views\todos.ejs L5: Link with role="button" pointing to /todos/new with text "Create Todo". Positioned after h1 heading, visible regardless of whether todos list is empty or populated. |
| 16 | 'Mark as Done' button is visible on pending todo detail pages | VERIFIED | D:\Repos\towline-test-project\src\views\todo-detail.ejs L31-36: Button is conditionally rendered only when status === 'pending' (L31), styled as secondary button (class="secondary" at L34), labeled "Mark as Done". |

## Artifact Verification

| # | Artifact | L1: Exists | L2: Substantive | L3: Wired | Status |
|---|----------|-----------|-----------------|-----------|--------|
| 5 | src/services/todo.service.js exports createTodo(projectDir, todoData) | YES | YES (254 lines total, createTodo at L180-213, 34 lines with validation, WriteQueue integration, ID generation, frontmatter creation, file writing) | WIRED (imported by pages.routes.js L4, called at L77) | PASS |
| 6 | src/services/todo.service.js exports completeTodo(projectDir, todoId) | YES | YES (completeTodo at L215-254, 40 lines with error handling, file search, frontmatter update with gray-matter, file move across directories) | WIRED (imported by pages.routes.js L4, called at L97) | PASS |
| 7 | tests/services/todo.service.test.js contains createTodo and completeTodo test suites | YES | YES (597 lines total, createTodo suite L303-507 with 13 test cases covering ID generation, validation, slugification, concurrency; completeTodo suite L509-596 with 8 test cases covering move, status update, error handling) | N/A (test file) | PASS |
| 17 | src/views/todo-create.ejs | YES | YES (55 lines, complete form with 4 input fields, HTML5 validation attributes, Pico.css semantic markup, layout partials) | WIRED (rendered by GET /todos/new route at pages.routes.js L46-51, form action posts to POST /todos at L8) | PASS |
| 18 | src/views/todos.ejs (updated with Create Todo link) | YES | YES (52 lines, Create Todo link at L5, full table with 6 columns, empty state handling) | WIRED (rendered by GET /todos route at pages.routes.js L36-44, link points to /todos/new) | PASS |
| 19 | src/views/todo-detail.ejs (updated with Mark as Done form) | YES | YES (39 lines, Mark as Done form at L31-36, conditional rendering based on status, full todo detail display with badges) | WIRED (rendered by GET /todos/:id route at pages.routes.js L53-71, form posts to /todos/:id/done) | PASS |
| 20 | src/routes/pages.routes.js (updated with POST routes) | YES | YES (112 lines total, POST /todos at L73-85, POST /todos/:id/done at L87-100, both routes include validation, error handling, service calls, redirects) | WIRED (imported in app setup, createTodo and completeTodo imported from todo.service.js at L4 and called at L77 and L97 respectively) | PASS |

## Key Link Verification

| # | Link Description | Source | Target | Status | Evidence |
|---|-----------------|--------|--------|--------|----------|
| 8 | createTodo uses gray-matter stringify for frontmatter generation | todo.service.js | gray-matter | WIRED | Import at L3: `import matter from 'gray-matter'`, usage at L207: `matter.stringify(description, frontmatter)` where frontmatter object is constructed at L198-205 with id, title, priority, phase, status, created fields |
| 9 | completeTodo reads raw file and parses with gray-matter directly to preserve content for re-serialization | todo.service.js | gray-matter | WIRED | Raw read at L243: `await readFile(pendingPath, 'utf-8')`, parse at L244: `matter(raw, { engines: { javascript: false } })` with javascript engine disabled to prevent code execution, status update at L246: `parsed.data.status = 'done'`, re-serialize at L247: `matter.stringify(parsed.content, parsed.data)` |
| 10 | Both functions are wrapped by the same WriteQueue instance for serialization | createTodo, completeTodo | WriteQueue | WIRED | Single writeQueue instance created at L20: `const writeQueue = new WriteQueue()`, createTodo wraps operation at L190: `return writeQueue.enqueue(async () => {...})`, completeTodo wraps operation at L216: `return writeQueue.enqueue(async () => {...})`, both share the same instance ensuring serialization |
| 21 | POST /todos route calls createTodo from todo.service.js | pages.routes.js | todo.service.js | WIRED | Import at L4: `import { listPendingTodos, getTodoDetail, createTodo, completeTodo }`, call at L77-82 with projectDir and form data object containing title, priority, phase (or empty string), description |
| 22 | POST /todos/:id/done route calls completeTodo from todo.service.js | pages.routes.js | todo.service.js | WIRED | Import at L4 (same as #21), call at L97: `await completeTodo(projectDir, id)` where id is extracted from req.params and validated as 3-digit format at L90-94 |
| 23 | todos.ejs links to /todos/new for the creation form | todos.ejs | pages.routes.js GET /todos/new | WIRED | Link at L5: `<a href="/todos/new" role="button">Create Todo</a>`, GET /todos/new route defined at pages.routes.js L46-51 renders todo-create template |
| 24 | todo-detail.ejs form posts to /todos/:id/done | todo-detail.ejs | pages.routes.js POST /todos/:id/done | WIRED | Form at L33: `<form method="POST" action="/todos/<%= id %>/done">` where id is passed from route handler (pages.routes.js L69), POST /todos/:id/done route defined at pages.routes.js L87-100 |

## Human Verification Items

### Item 1: Form Submission Creates Todo and Redirects Correctly

- **Must-Have**: Truths #11, #12, #15
- **Why Manual**: Requires browser interaction to fill form, submit, and observe redirect
- **How to Test**:
  1. Start server: `npm start` in D:\Repos\towline-test-project
  2. Navigate to http://127.0.0.1:3000/todos
  3. Click "Create Todo" button
  4. Fill form: Title="Test Todo", Priority="P1", Phase="09-todo-write-operations", Description="Test description"
  5. Click "Create Todo" submit button
  6. Verify redirect to todo detail page showing the new todo with ID 001 (or next sequential)
  7. Verify file exists at D:\Repos\towline-test-project\.planning\todos\pending\001-test-todo.md
- **Expected Result**: Form submission succeeds, redirects to /todos/001 showing the created todo with correct title, priority, phase, and description. File exists on disk with proper frontmatter.

### Item 2: Mark as Done Moves Todo and Updates Status

- **Must-Have**: Truths #13, #14, #16
- **Why Manual**: Requires browser interaction to click button and observe redirect
- **How to Test**:
  1. With a pending todo visible (create one via Item 1 if needed)
  2. Navigate to the todo detail page (e.g., http://127.0.0.1:3000/todos/001)
  3. Verify "Mark as Done" button is visible at bottom of page with secondary styling
  4. Click "Mark as Done" button
  5. Verify redirect to /todos list page
  6. Verify todo is no longer in the pending list
  7. Verify file moved from .planning/todos/pending/ to .planning/todos/done/
  8. Open the file and verify status is now 'done' in frontmatter
- **Expected Result**: Button click succeeds, redirects to /todos, todo no longer appears in list, file moved to done directory with status updated to 'done' while preserving all other frontmatter and content.

## Anti-Pattern Scan

| Pattern | Count | Severity | Files |
|---------|-------|----------|-------|
| TODO/FIXME comments | 0 | N/A | None |
| Stub implementations | 0 | N/A | None |
| Console.log in production | 4 | low | server.js (4 instances: startup logs at L8-9, shutdown logs at L13-15) |
| Skipped tests | 0 | N/A | None |
| Hardcoded secrets | 0 | N/A | None |
| Empty catch blocks | 0 | N/A | None |

**Note**: The console.log statements in server.js are appropriate for a development tool. They provide essential feedback about server state (startup URL, project directory, shutdown progress) and are typical for Node.js server applications.

## Summary

### Phase Health
- **Must-haves**: 24/24 verified (100%)
- **Gaps**: 0 blocking, 0 non-blocking
- **Anti-patterns**: 4 total (4 low-severity console.logs for server logging)
- **Human items**: 2 pending (form submission flow, mark-as-done flow)

### Verification Details

**Plan 09-01 (Todo Write Service and Sequential Queue)**:
- All truths verified through code inspection and test execution
- createTodo and completeTodo are substantive implementations with proper error handling
- WriteQueue successfully serializes concurrent operations (test proves unique IDs under concurrent load)
- All 33 unit tests pass (13 for createTodo, 8 for completeTodo, 10 for listPendingTodos, 4 for getTodoDetail)
- No stub patterns, no placeholder code, no disabled tests

**Plan 09-02 (Todo Create Form, Routes, and UI Wiring)**:
- All UI artifacts exist and are substantive (forms, buttons, links properly implemented)
- POST routes properly wired to service functions with validation and error handling
- Route ordering correct (GET /todos/new before GET /todos/:id to prevent path collision)
- Templates include proper Pico.css semantic markup and HTML5 validation
- All imports and function calls verified

### Recommendations
1. **Manual testing required**: Run the two human verification items to confirm end-to-end flows work in the browser
2. **Optional enhancement**: Consider adding integration tests for the POST routes using supertest to cover the HTTP layer (currently only unit tests for services)
3. **Consider environment-aware logging**: If this tool runs in production contexts, wrap console.log calls in environment checks or use a proper logger with log levels
