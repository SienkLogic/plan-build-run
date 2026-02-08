---
phase: "09"
plan: "09-01"
status: "complete"
subsystem: "todo service layer"
tags:
  - "write-operations"
  - "sequential-queue"
  - "todo-crud"
requires:
  - "08-01: todo.service.js with listPendingTodos and getTodoDetail"
  - "08-01: todo.service.test.js with 14 existing tests"
provides:
  - "createTodo(projectDir, todoData) - creates new todo markdown files with frontmatter"
  - "completeTodo(projectDir, todoId) - moves todo from pending to done with status update"
  - "WriteQueue class - serializes concurrent write operations to prevent ID collisions"
affects:
  - "src/services/todo.service.js"
  - "tests/services/todo.service.test.js"
tech_stack:
  - "Node.js ESM"
  - "gray-matter"
  - "Vitest + memfs"
key_files:
  - "src/services/todo.service.js: todo service with read and write operations, WriteQueue for concurrency control"
  - "tests/services/todo.service.test.js: 33 total tests covering list, detail, create, complete, and queue serialization"
key_decisions:
  - "WriteQueue uses promise chaining (tail pattern): simple, no external dependencies, serializes all writes through a single queue"
  - "ID generation scans both pending/ and done/ directories: prevents ID reuse after completion"
  - "Slug truncation at 50 chars: keeps filenames reasonable while remaining descriptive"
  - "Validation throws before enqueue: invalid requests fail fast without entering the queue"
patterns:
  - "Promise-chain queue: WriteQueue.enqueue() chains operations via this.tail.then(fn, fn)"
  - "mkdir recursive: both createTodo and completeTodo ensure target directories exist"
  - "gray-matter stringify: used to generate frontmatter+content markdown files"
metrics:
  duration_minutes: 2
  start_time: "2026-02-08T14:01:40Z"
  end_time: "2026-02-08T14:03:34Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 0
  files_modified: 2
deferred: []
---

# Plan Summary: 09-01

## What Was Built

Added write operations to the existing todo service layer. The `createTodo` function generates sequential three-digit IDs by scanning both pending and done directories, converts titles to filesystem-safe slugs, and writes markdown files with gray-matter frontmatter. The `completeTodo` function updates the status field in frontmatter to "done" and moves the file from the pending directory to the done directory.

A `WriteQueue` class was introduced to serialize concurrent write operations. It uses a promise-chaining pattern where each enqueued operation waits for the previous one to complete, preventing race conditions in ID generation when multiple creates happen simultaneously.

Both functions were thoroughly tested with 18 new unit tests using Vitest and memfs, covering happy paths, edge cases (missing fields, nonexistent directories, long titles, special characters), error handling (400 for validation, 404 for missing todos), and concurrency serialization. The full test suite now has 102 tests across 6 files with zero regressions.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| T1: Add WriteQueue, createTodo, completeTodo | done | 1ac4789 | 1 | passed |
| T2: Add 18 unit tests | done | 3ac2863 | 1 | passed (33/33 tests) |

## Key Implementation Details

- `WriteQueue` is a module-level singleton -- all write operations across the service share the same queue
- `createTodo` validates inputs (title, priority, description required) before entering the queue, so invalid requests fail fast
- `getNextTodoId` scans both pending/ and done/ directories to find the highest existing ID
- `titleToSlug` strips non-alphanumeric characters, lowercases, and truncates to 50 characters
- `completeTodo` reads the file, updates frontmatter via gray-matter, writes back, then renames (move) to done/
- The `{ engines: { javascript: false } }` option is passed to gray-matter in completeTodo to prevent code execution in frontmatter

## Known Issues

None discovered during execution.

## Dependencies Provided

- `createTodo(projectDir, { title, priority, description, phase? })` -- returns the new three-digit ID string
- `completeTodo(projectDir, todoId)` -- returns undefined on success, throws 404 if not found
- Both functions are exported from `src/services/todo.service.js` and available for route wiring in plan 09-02
