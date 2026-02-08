---
phase: "09"
plan: "09-02"
status: "complete"
subsystem: "todo UI and routes"
tags:
  - "form-template"
  - "post-routes"
  - "todo-crud-ui"
requires:
  - "09-01: createTodo and completeTodo functions from todo.service.js"
  - "08-02: todos.ejs and todo-detail.ejs templates, GET /todos and GET /todos/:id routes"
provides:
  - "GET /todos/new - renders todo creation form"
  - "POST /todos - creates a new todo and redirects to detail page"
  - "POST /todos/:id/done - marks a todo as done and redirects to list"
  - "Create Todo button on todos list page"
  - "Mark as Done button on todo detail page (pending todos only)"
affects:
  - "src/views/todo-create.ejs"
  - "src/routes/pages.routes.js"
  - "src/views/todos.ejs"
  - "src/views/todo-detail.ejs"
tech_stack:
  - "Express 5.x"
  - "EJS templates"
  - "Pico.css v2"
key_files:
  - "src/views/todo-create.ejs: form template with title, priority, phase, and description fields"
  - "src/routes/pages.routes.js: updated with GET /todos/new, POST /todos, POST /todos/:id/done routes"
  - "src/views/todos.ejs: added Create Todo button link"
  - "src/views/todo-detail.ejs: added Mark as Done button for pending todos"
key_decisions:
  - "GET /todos/new placed before GET /todos/:id: prevents Express from matching 'new' as an :id parameter"
  - "POST /todos/:id/done validates 3-digit ID format: consistent with GET route validation pattern"
  - "Mark as Done button only shown for pending status: prevents double-completion attempts"
  - "Phase field is optional with empty string fallback: matches createTodo API contract"
patterns:
  - "POST-redirect-GET: POST /todos redirects to detail, POST /todos/:id/done redirects to list"
  - "Conditional rendering: Mark as Done button only shown when status === 'pending'"
metrics:
  duration_minutes: 1
  start_time: "2026-02-08T14:05:37Z"
  end_time: "2026-02-08T14:06:53Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 1
  files_modified: 3
deferred: []
---

# Plan Summary: 09-02

## What Was Built

Created the todo creation form template and wired all POST routes for the todo write operations UI. The `todo-create.ejs` template provides a form with title, priority (select dropdown with P0-PX options), optional phase, and description (textarea) fields, all posting to `POST /todos`.

Three new routes were added to `pages.routes.js`: `GET /todos/new` renders the creation form, `POST /todos` calls `createTodo` and redirects to the new todo's detail page, and `POST /todos/:id/done` calls `completeTodo` and redirects back to the todo list. The existing templates were updated with action links -- a "Create Todo" button on the todos list page and a "Mark as Done" button on the todo detail page (shown only for pending todos).

All 102 existing tests continue to pass with zero regressions.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| T1: Create todo-create.ejs form template | done | b3d56d8 | 1 | passed |
| T2: Wire POST routes and update templates | done | a175f98 | 3 | passed (102/102 tests) |

## Key Implementation Details

- Route order matters: `GET /todos/new` must precede `GET /todos/:id` to prevent Express from treating "new" as an ID parameter
- `POST /todos` destructures `req.body` for title, priority, phase, description and passes to `createTodo` with `phase: phase || ''` fallback
- `POST /todos/:id/done` includes the same 3-digit ID validation as the existing GET route
- The Mark as Done button uses `class="secondary"` for visual distinction from primary actions
- Form uses `method="POST"` with `action="/todos"` -- standard HTML form submission, no JavaScript required

## Known Issues

None discovered during execution.

## Dependencies Provided

- Complete todo CRUD UI: users can list, view, create, and complete todos through the web interface
- All routes follow POST-redirect-GET pattern for proper browser behavior
