---
phase: "08-todo-list-and-detail"
verified: "2026-02-08T18:41:00Z"
status: "passed"
is_re_verification: false
score:
  total_must_haves: 34
  verified: 34
  failed: 0
  partial: 0
  human_needed: 0
gaps: []
anti_patterns:
  todos: 0
  stubs: 0
  console_logs: 3
  skipped_tests: 0
  hardcoded_secrets: 0
---

# Phase Verification: Todo List and Detail

> Verified: 2026-02-08T18:41:00Z
> Status: **PASSED**
> Score: 34/34 must-haves verified
> Re-verification: no

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | listPendingTodos returns array of todo objects | VERIFIED | Function at D:\Repos\towline-test-project\src\services\todo.service.js:31-81, returns sorted array with all required fields |
| 2 | Each todo object contains id, title, priority, phase, status, created, filename | VERIFIED | Test at todo.service.test.js:229-246 verifies all fields present, runtime test confirms structure |
| 3 | Todos sorted by priority then title | VERIFIED | sortTodosByPriority function at L13-21 uses PRIORITY_ORDER (P0=0, P1=1, P2=2, PX=3), test at L94-113 passes |
| 4 | Unknown priorities sort after PX | VERIFIED | Test at L207-227 verifies unknown priority "HIGH" sorts after P1, uses nullish coalescing to assign 99 |
| 5 | Todos with missing title or priority are skipped | VERIFIED | Filter logic at L65-67, test at L157-168 confirms only valid entries returned |
| 6 | Missing pending directory returns empty array | VERIFIED | ENOENT handler at L38-39, test at L137-145 confirms no crash |
| 7 | getTodoDetail returns todo with frontmatter + HTML | VERIFIED | Function at L92-131 returns object with html field from readMarkdownFile, test at L250-263 confirms |
| 8 | getTodoDetail throws 404 when no file matches | VERIFIED | Error with status 404 thrown at L100-102 and L113-115, test at L265-277 confirms |
| 9 | Todo ID extracted from filename prefix (NNN-*.md) | VERIFIED | Regex at L48 matches /^(\d{3})-/, fallback ID logic at L70, test at L182-195 confirms |
| 10 | Priority badge CSS renders P0 red, P1 orange, P2 yellow, PX indigo | VERIFIED | CSS rules at status-colors.css:79-97 with correct colors: P0=#fee2e2/#7f1d1d, P1=#fed7aa/#7c2d12, P2=#fef9c3/#713f12, PX=#e0e7ff/#312e81 |
| 11 | Unit tests pass using memfs | VERIFIED | All 14 tests pass (vitest output), memfs mock at test file L4-8 |
| 18 | GET /todos renders table with todos | VERIFIED | Route at pages.routes.js:36-44 calls listPendingTodos and renders todos.ejs, runtime test confirms table with priority badges |
| 19 | Each todo title is clickable link to /todos/:id | VERIFIED | todos.ejs:23-25 wraps title in <a href="/todos/<%= todo.id %>"> |
| 20 | Priority badges use data-priority and display text | VERIFIED | todos.ejs:28-30 and todo-detail.ejs:11-13 use data-priority attribute with <%= todo.priority %> text |
| 21 | Empty state displays helpful message | VERIFIED | todos.ejs:45-46 shows "No pending todos found. Add a todo file to .planning/todos/pending/" |
| 22 | GET /todos/:id renders full markdown with metadata | VERIFIED | Route at pages.routes.js:46-64 calls getTodoDetail, renders todo-detail.ejs with metadata header and <%- html %> body |
| 23 | Todo detail has back link to /todos | VERIFIED | todo-detail.ejs:5 has <a href="/todos">&larr; Back to Todos</a> |
| 24 | Invalid todo ID format returns 404 | VERIFIED | Regex validation at pages.routes.js:50-54 rejects non-three-digit IDs, runtime test confirms /todos/abc, /todos/1, /todos/9999 all return 404 |
| 25 | Non-existent todo ID returns 404 | VERIFIED | getTodoDetail throws 404 error when file not found, runtime test confirms /todos/999 returns 404 |
| 26 | Both routes set activePage to 'todos' | VERIFIED | pages.routes.js:41 and :61, todos.ejs:1, todo-detail.ejs:1 all set activePage: 'todos', sidebar.ejs:15 uses it for aria-current |
| 27 | Coming-soon placeholder replaced | VERIFIED | Grep search for "coming-soon.*Todos" returns no matches in src/ directory |

## Artifact Verification

| # | Artifact | L1: Exists | L2: Substantive | L3: Wired | Status |
|---|----------|-----------|-----------------|-----------|--------|
| 12 | src/services/todo.service.js | YES (ls confirms 132 lines) | SUBSTANTIVE (2 exported functions with full logic, PRIORITY_ORDER constant, sortTodosByPriority helper) | WIRED (imported by pages.routes.js:4, used at :38 and :57) | PASS |
| 13 | tests/services/todo.service.test.js | YES (ls confirms 302 lines) | SUBSTANTIVE (14 unit tests covering all edge cases, memfs mocks, fixture constants) | WIRED (executed by vitest, all 14 tests pass) | PASS |
| 14 | public/css/status-colors.css | YES (ls confirms 98 lines) | SUBSTANTIVE (4 priority badge rules added at L79-97, proper color values) | WIRED (loaded by layout, used by todos.ejs and todo-detail.ejs via data-priority attribute) | PASS |
| 28 | src/views/todos.ejs | YES (ls confirms 51 lines) | SUBSTANTIVE (full table layout with 6 columns, priority badges, status badges, empty state, proper EJS escaping) | WIRED (rendered by pages.routes.js:39, includes layout-top/layout-bottom partials) | PASS |
| 29 | src/views/todo-detail.ejs | YES (ls confirms 33 lines) | SUBSTANTIVE (metadata header with badges, conditional phase/created fields, back link, unescaped HTML body) | WIRED (rendered by pages.routes.js:59, includes layout-top/layout-bottom partials) | PASS |

## Key Link Verification

| # | Link Description | Source | Target | Status | Evidence |
|---|-----------------|--------|--------|--------|----------|
| 15 | todo.service.js imports readMarkdownFile | planning.repository.js | todo.service.js | WIRED | Import at todo.service.js:3, called at L54 and L119 |
| 16 | todo.service.js imports readdir | node:fs/promises | todo.service.js | WIRED | Import at todo.service.js:1, called at L36 and L97 |
| 17 | Priority CSS uses data-priority attribute | status-colors.css | todos.ejs, todo-detail.ejs | WIRED | CSS selectors .status-badge[data-priority="P0|P1|P2|PX"] at L79-97, templates use data-priority attribute at todos.ejs:28, todo-detail.ejs:11 |
| 30 | pages.routes.js imports todo.service.js functions | todo.service.js | pages.routes.js | WIRED | Import at pages.routes.js:4, listPendingTodos called at L38, getTodoDetail called at L57 |
| 31 | GET /todos calls listPendingTodos | todo.service.js | pages.routes.js | WIRED | Route handler at pages.routes.js:36-44, calls listPendingTodos(projectDir) and passes todos to template |
| 32 | GET /todos/:id validates ID and calls getTodoDetail | todo.service.js | pages.routes.js | WIRED | Route handler at pages.routes.js:46-64, regex validation at L50, calls getTodoDetail at L57 |
| 33 | todos.ejs links to /todos/:id | todos.ejs | todo-detail.ejs | WIRED | Link at todos.ejs:23, tested runtime confirms navigation works |
| 34 | todo-detail.ejs links back to /todos | todo-detail.ejs | todos.ejs | WIRED | Link at todo-detail.ejs:5 |

## Anti-Pattern Scan

| Pattern | Count | Severity | Files |
|---------|-------|----------|-------|
| TODO/FIXME comments | 0 | - | None found in src/services/todo.service.js, src/views/*.ejs |
| Stub implementations | 0 | - | All functions have substantive logic |
| Console.log in production | 3 | low | src/server.js:8,9,13,15 (server startup/shutdown messages only, not in business logic) |
| Skipped tests | 0 | - | All 14 tests in todo.service.test.js execute |
| Hardcoded secrets | 0 | - | None detected |
| Empty catch blocks | 0 | - | All error handlers have proper logic (ENOENT returns empty array or throws 404) |

## Summary

### Phase Health
- **Must-haves**: 34/34 verified (100%)
- **Gaps**: 0 blocking, 0 non-blocking
- **Anti-patterns**: 3 total (0 critical, 3 low severity console.log in server startup)
- **Human items**: 0 pending

### Verification Evidence

**Service Layer (08-01)**:
- todo.service.js exports listPendingTodos and getTodoDetail with full implementation
- Priority sorting uses PRIORITY_ORDER constant (P0=0, P1=1, P2=2, PX=3), unknown priorities get 99
- Missing directory returns empty array (ENOENT handler), missing frontmatter skips entries
- Promise.allSettled provides partial failure tolerance
- 14 comprehensive unit tests pass covering: priority sorting, alphabetical tie-breaking, empty/missing directories, invalid frontmatter, filename pattern filtering, fallback ID, date coercion, unknown priorities, field completeness, detail retrieval, 404 errors, BOM handling
- Priority badge CSS rules added for P0/P1/P2/PX using data-priority attribute (separate from data-status)

**Templates and Routes (08-02)**:
- todos.ejs renders table with 6 columns (ID, Title, Priority, Phase, Status, Created)
- Title column wraps in <a href="/todos/<%= todo.id %>"> for navigation
- Priority badges use data-priority attribute with color-coded backgrounds
- Empty state shows helpful message when no pending todos
- todo-detail.ejs shows metadata header with ID, priority badge, status badge
- Conditional phase and created fields, horizontal rule separates metadata from body
- Full rendered markdown body uses unescaped <%- html %>
- All user-sourced text uses escaped <%= %> tags (XSS prevention)
- Both routes set activePage: 'todos' for sidebar highlighting
- GET /todos/:id validates three-digit ID format before calling service
- Coming-soon placeholder completely removed from pages.routes.js

**Runtime Testing**:
- /todos returns 200 with empty state when pending directory is empty
- /todos returns 200 with table when todos exist
- /todos/001 returns 200 with full detail view
- /todos/abc, /todos/1, /todos/9999 all return 404 (invalid format)
- /todos/999 returns 404 (non-existent todo)
- Priority badges render with correct data-priority attribute
- Sidebar highlighting works via activePage

**Full Test Suite**: 83 tests across 6 test files pass with no regressions

### Recommendations
None. All must-haves verified, no gaps found, no critical anti-patterns detected. Phase 08 is complete and ready for Phase 09 (Todo Write Operations).
