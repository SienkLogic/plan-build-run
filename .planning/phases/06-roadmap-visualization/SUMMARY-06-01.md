---
phase: "06-roadmap-visualization"
plan: "06-01"
status: "complete"
subsystem: "roadmap"
tags:
  - "service"
  - "template"
  - "route"
  - "unit-tests"
requires:
  - "04-01: parseRoadmapFile from dashboard.service.js"
  - "05-02: pages.routes.js with /roadmap coming-soon placeholder"
  - "05-02: status-colors.css with data-status selectors"
provides:
  - "getRoadmapData(projectDir) in roadmap.service.js -- returns phases with planCount and dependencies"
  - "GET /roadmap route rendering roadmap.ejs with enhanced phase table"
affects:
  - "src/services/roadmap.service.js"
  - "tests/services/roadmap.service.test.js"
  - "src/views/roadmap.ejs"
  - "src/routes/pages.routes.js"
tech_stack:
  - "Node.js ESM"
  - "Express 5.x"
  - "EJS"
  - "Pico.css"
  - "Vitest + memfs"
key_files:
  - "src/services/roadmap.service.js: service with getRoadmapData that enhances parseRoadmapFile output with plan counts and dependencies"
  - "tests/services/roadmap.service.test.js: 8 unit tests covering all edge cases with memfs mocking"
  - "src/views/roadmap.ejs: EJS template with phase table, status badges, dependency links"
  - "src/routes/pages.routes.js: updated /roadmap route using getRoadmapData instead of coming-soon"
key_decisions:
  - "Two reads of ROADMAP.md: parseRoadmapFile for checkbox parsing, raw readFile for dependency extraction -- avoids duplicating parsing logic"
  - "stripBOM duplicated intentionally: this service reads raw text, not via repository layer"
  - "Plan count reads run in parallel via Promise.all for all phases simultaneously"
  - "Dependencies default to empty array when phase has no Phase Details section entry"
patterns:
  - "memfs mocking: same vi.mock pattern as dashboard.service.test.js and phase.service.test.js"
  - "async route handler: Express 5.x auto-catches rejections, no explicit try/catch needed"
  - "data-status attribute: reuses existing status-colors.css badge system"
metrics:
  duration_minutes: 3
  start_time: "2026-02-08T12:55:53Z"
  end_time: "2026-02-08T12:58:35Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 3
  files_modified: 1
deferred:
  - "T2 verify command false-negative: the plan's verify checks for co-occurrence of 'coming-soon', 'Roadmap', and 'featureName' in the whole file, but these strings still appear in other route blocks -- used targeted route-block extraction for accurate verification"
---

# Plan Summary: 06-01

## What Was Built

Created the roadmap visualization feature end-to-end: a `roadmap.service.js` that enhances the base phase data from `parseRoadmapFile` with plan counts (from phase directories) and dependency information (parsed from ROADMAP.md Phase Details sections), 8 unit tests with memfs mocking, an EJS template with an enhanced table layout using Pico.css and existing status badges, and route wiring in `pages.routes.js` to replace the coming-soon placeholder.

The service reads ROADMAP.md twice: once via `parseRoadmapFile` for the proven checkbox-to-phase parsing, and once via raw `readFile` for dependency extraction from the Phase Details section. Plan counts are derived by scanning each phase directory for files matching the `NN-NN-PLAN.md` pattern, with all directory reads running in parallel via `Promise.all`.

The roadmap table shows each phase with its zero-padded ID, clickable name (linking to phase detail), description, plan count, color-coded status badge, and clickable dependency links. An empty state gracefully handles missing ROADMAP.md files.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 06-01-T1: Create roadmap.service.js with getRoadmapData and unit tests | done | d5b5fd4 | 2 | passed (8/8 tests) |
| 06-01-T2: Create roadmap.ejs template and wire GET /roadmap route | done | 7345666 | 2 | passed |

## Key Implementation Details

- `getRoadmapData(projectDir)` returns `{ phases: [{id, name, description, status, planCount, dependencies}] }`
- `countPlansForPhase` zero-pads the phase ID to match directory naming convention (e.g., "01-project-scaffolding")
- `extractAllDependencies` uses a single regex pass over all Phase Details sections, returning a Map of phaseId to dependency arrays
- The `/roadmap` route handler is async and reads `projectDir` from `req.app.locals.projectDir` (established pattern)
- Template uses `<%= %>` for all user-sourced text (auto-escaped by EJS)
- Status badge uses `phase.status.replace('-', ' ')` to display "not started" instead of "not-started"
- Full test suite: 60 tests across 5 files (52 existing + 8 new), all passing

## Known Issues

- The plan's T2 verify command produces a false negative due to overly broad string matching (checks for `coming-soon`, `Roadmap`, and `featureName` across the entire file, but these strings exist in other route blocks). A targeted extraction of the `/roadmap` route block confirms correctness.

## Dependencies Provided

- `roadmap.service.js` exports `getRoadmapData(projectDir)` for use by any route or service needing enhanced phase data
- `GET /roadmap` is now a live route rendering the roadmap table (no longer coming-soon)
- `roadmap.ejs` template can be used as a pattern for future table-based views
