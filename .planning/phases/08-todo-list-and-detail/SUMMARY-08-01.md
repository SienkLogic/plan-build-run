---
phase: "08-todo-list-and-detail"
plan: "08-01"
status: "complete"
subsystem: "services"
tags:
  - "todo"
  - "service-layer"
  - "css"
  - "unit-tests"
requires:
  - "03-01: planning.repository.js readMarkdownFile"
provides:
  - "todo.service.js exports listPendingTodos(projectDir) and getTodoDetail(projectDir, todoId)"
  - "Priority badge CSS rules for data-priority attribute (P0/P1/P2/PX)"
affects:
  - "src/services/"
  - "public/css/status-colors.css"
  - "tests/services/"
tech_stack:
  - "Node.js ESM"
  - "Vitest + memfs"
  - "gray-matter + marked (via planning.repository.js)"
key_files:
  - "src/services/todo.service.js: Service with listPendingTodos and getTodoDetail functions"
  - "tests/services/todo.service.test.js: 14 unit tests covering sorting, filtering, errors, BOM handling"
  - "public/css/status-colors.css: Added priority badge rules for P0/P1/P2/PX"
key_decisions:
  - "Promise.allSettled for partial failure tolerance: one bad todo file does not crash the list"
  - "Filename must match ^(\\d{3})- pattern: ensures consistent 3-digit ID extraction"
  - "data-priority attribute separate from data-status: avoids CSS conflicts between status and priority badges"
  - "Error.status = 404 convention: matches Express error handler pattern for not-found errors"
patterns:
  - "memfs vi.mock pattern: same mock setup as phase.service.test.js and roadmap.service.test.js"
  - "readMarkdownFile reuse: delegates markdown parsing and BOM stripping to planning.repository.js"
metrics:
  duration_minutes: 2
  start_time: "2026-02-08T18:31:54Z"
  end_time: "2026-02-08T18:33:53Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 1
deferred: []
---

# Plan Summary: 08-01

## What Was Built

Created `todo.service.js` with two exported functions for reading and parsing todo markdown files from the `.planning/todos/pending/` directory. `listPendingTodos(projectDir)` reads all markdown files, parses YAML frontmatter, filters out entries missing required fields (title, priority), and returns a sorted array (P0 first, then P1, P2, PX, with alphabetical tie-breaking within each priority level). `getTodoDetail(projectDir, todoId)` finds a single todo by matching its 3-digit ID prefix in the filename and returns full metadata plus rendered HTML content.

Added 14 unit tests using Vitest and memfs, covering priority sorting, alphabetical tie-breaking, empty/missing directories, invalid frontmatter filtering, filename pattern filtering, fallback ID from filename, date coercion, unknown priority handling, field completeness, detail retrieval with HTML rendering, 404 errors, and UTF-8 BOM handling.

Updated `status-colors.css` with four priority badge CSS rules using the `data-priority` attribute (separate from the existing `data-status` attribute system), providing P0 red, P1 orange, P2 yellow, and PX indigo badge variants.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 08-01-T1: Create todo.service.js | done | a9903b3 | 1 | passed |
| 08-01-T2: Unit tests and priority badge CSS | done | 2e29849 | 2 | passed |

## Key Implementation Details

- `listPendingTodos` uses `readdir` with `withFileTypes: true` for efficient directory listing
- ENOENT on the pending directory returns empty array (project may not have todos yet)
- `Promise.allSettled` ensures one bad file does not crash the entire list
- ID source: prefers frontmatter `id` field, falls back to 3-digit filename prefix
- `created` field is coerced to string because gray-matter may parse YAML dates as Date objects
- `getTodoDetail` throws errors with `status: 404` property for Express error handler integration
- Total test count after this plan: 83 tests across 6 test files (was 69 across 5)

## Known Issues

None.

## Dependencies Provided

- `todo.service.js` exports `listPendingTodos(projectDir)` returning `Array<{id, title, priority, phase, status, created, filename}>`
- `todo.service.js` exports `getTodoDetail(projectDir, todoId)` returning `{id, title, priority, phase, status, created, html, filename}`
- CSS rules for `.status-badge[data-priority="P0|P1|P2|PX"]` are available for templates
