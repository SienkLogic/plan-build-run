---
phase: "08-todo-list-and-detail"
plan: "08-02"
status: "complete"
subsystem: "views/routes"
tags:
  - "ejs-templates"
  - "express-routes"
  - "todo-list"
  - "todo-detail"
requires:
  - "08-01: listPendingTodos and getTodoDetail from todo.service.js"
  - "08-01: data-priority CSS badge rules in status-colors.css"
  - "01-02: layout-top/layout-bottom EJS partials"
  - "05-02: pages.routes.js with existing route pattern"
provides:
  - "GET /todos renders todos.ejs with pending todo list table"
  - "GET /todos/:id renders todo-detail.ejs with full markdown content"
  - "todos.ejs template with priority badges, status badges, and clickable title links"
  - "todo-detail.ejs template with metadata header and rendered markdown body"
affects:
  - "src/views/todos.ejs"
  - "src/views/todo-detail.ejs"
  - "src/routes/pages.routes.js"
tech_stack:
  - "EJS"
  - "Express 5.x"
  - "Pico.css"
key_files:
  - "src/views/todos.ejs: table layout listing pending todos with ID, title (linked), priority badge, phase, status badge, created date; empty state message"
  - "src/views/todo-detail.ejs: detail view with metadata header (priority/status badges), conditional phase/created fields, rendered markdown body"
  - "src/routes/pages.routes.js: GET /todos (list) and GET /todos/:id (detail with 3-digit ID validation) routes replacing coming-soon placeholder"
key_decisions:
  - "Table layout for todo list: consistent with roadmap.ejs pattern, 6 columns (ID, Title, Priority, Phase, Status, Created)"
  - "Priority badge uses data-priority attribute: wires directly to CSS from plan 08-01"
  - "3-digit ID validation regex: /^\\d{3}$/ prevents invalid route access"
  - "Spread todo object into template data: ...todo provides id, title, priority, phase, status, created, html, filename"
  - "Unescaped html output only for pre-rendered markdown body: <%- html %> follows index.ejs pattern"
patterns:
  - "EJS table layout with empty state: consistent with roadmap.ejs"
  - "Detail view with back link and metadata header: consistent with phase-detail.ejs"
  - "Async route handler with Express 5.x auto-catch: same pattern as phases/:phaseId"
  - "ID format validation throwing 404 error: same pattern as phaseId validation"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 1
  start_time: "2026-02-08T13:35:23Z"
  end_time: "2026-02-08T13:37:47Z"
deferred: []
---

# Plan Summary: 08-02

## What Was Built

Created two EJS templates for the todo feature: `todos.ejs` for the list view and `todo-detail.ejs` for the detail view, then wired both routes in `pages.routes.js` replacing the existing coming-soon placeholder.

The list view (`todos.ejs`) renders a Pico.css-styled table with six columns: ID, Title (clickable link to detail), Priority (badge with data-priority attribute), Phase, Status (badge with data-status attribute), and Created date. An empty state message guides users to add todo files. The detail view (`todo-detail.ejs`) shows a metadata header with the todo ID, priority badge, and status badge, followed by conditional phase and created date fields, a horizontal rule, and the full rendered markdown body using unescaped EJS output.

The route wiring in `pages.routes.js` adds imports for `listPendingTodos` and `getTodoDetail` from the todo service, replaces the `/todos` coming-soon placeholder with a real async handler, and adds a new `/todos/:id` route with three-digit ID validation. Invalid ID formats and non-existent IDs both return 404 errors. Both routes set `activePage: 'todos'` for sidebar highlighting.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 08-02-T1: Create todos.ejs and todo-detail.ejs templates | done | d87247d | 2 | passed |
| 08-02-T2: Wire GET /todos and GET /todos/:id routes | done | 1ccc384 | 1 | passed |

## Key Implementation Details

- Route ordering in pages.routes.js: /phases, /phases/:phaseId, /todos, /todos/:id, /roadmap
- The `/todos/:id` route validates ID format with `/^\d{3}$/` before calling the service
- Template data for todo-detail uses spread operator (`...todo`) to pass all properties
- All user-sourced text uses escaped EJS tags (`<%= %>`); only pre-rendered markdown body uses unescaped (`<%- html %>`)
- Full test suite (83 tests across 6 files) passes with no regressions

## Known Issues

None.

## Dependencies Provided

- `GET /todos` endpoint rendering `todos.ejs` with full pending todo list
- `GET /todos/:id` endpoint rendering `todo-detail.ejs` with full markdown content
- Both templates wired to sidebar highlighting via `activePage: 'todos'`
- Coming-soon placeholder for /todos is fully removed
