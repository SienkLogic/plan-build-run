---
phase: "07-commit-history"
plan: "07-01"
status: "complete"
subsystem: "phase-detail"
tags:
  - "commit-history"
  - "parsing"
  - "template"
requires:
  - "05-02: phase-detail.ejs template and GET /phases/:phaseId route"
provides:
  - "parseTaskResultsTable() exported from phase.service.js for reuse"
  - "Commit History section in phase-detail.ejs showing per-plan commits"
affects:
  - "src/services/phase.service.js"
  - "tests/services/phase.service.test.js"
  - "src/views/phase-detail.ejs"
tech_stack:
  - "Node.js ESM"
  - "Vitest + memfs"
  - "EJS"
key_files:
  - "src/services/phase.service.js: parseTaskResultsTable() parses Task Results markdown tables into commit objects; getPhaseDetail() now includes commits on each plan"
  - "tests/services/phase.service.test.js: 9 new tests (6 unit + 3 integration) covering parsing, empty states, edge cases"
  - "src/views/phase-detail.ejs: Commit History section with table display and empty state"
key_decisions:
  - "Exported parseTaskResultsTable for direct unit testing rather than keeping it private"
  - "Used escaped EJS output (<%= %>) exclusively for commit data to prevent XSS"
  - "Commits aggregated across all plans with planId tag for grouping in the template"
patterns:
  - "Regex-based markdown table parsing: section extraction then row splitting"
  - "Empty array fallback for missing/unparseable data ensures template safety"
metrics:
  duration_minutes: 3
  start_time: "2026-02-08T13:11:21Z"
  end_time: "2026-02-08T13:13:52Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 0
  files_modified: 3
deferred: []
---

# Plan Summary: 07-01

## What Was Built

Added commit history tracking to the phase detail page. A new `parseTaskResultsTable()` function in `phase.service.js` extracts commit data (hash, task description, files count, verification status) from the standardized "Task Results" markdown table found in each plan's SUMMARY.md body content. The function uses regex to locate the table section and then splits rows by pipe delimiters, filtering out invalid entries (missing hashes, malformed rows, separator lines).

The `getPhaseDetail()` function was enhanced to call `parseTaskResultsTable()` on each plan's raw SUMMARY content, adding a `commits` array property to every plan object. Plans without summaries or without Task Results tables get an empty array, ensuring the template always has safe data to iterate.

The phase-detail.ejs template now includes a "Commit History" section that aggregates commits across all plans and displays them in a table with columns for commit hash (monospaced), task description, plan ID, files count, and verification status (with color-coded status badges). An empty state message is shown when no commits exist for the phase.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 07-01-T1: Add parseTaskResultsTable and integrate into getPhaseDetail | done | 5170457 | 2 | passed |
| 07-01-T2: Add Commit History section to phase-detail.ejs template | done | c099e26 | 1 | passed |

## Key Implementation Details

The `parseTaskResultsTable()` function handles several edge cases: null/undefined/empty input returns empty array, missing "## Task Results" section returns empty array, rows with fewer than 5 columns are skipped, and commit hashes that are dashes, empty, or non-hex strings are filtered out. The regex `## Task Results\s*\n([\s\S]*?)(?=\n##\s|\n\n\n|$)` captures table content between the section header and the next section, triple newline, or EOF.

All commit data in the template uses escaped EJS output (`<%= %>`) rather than unescaped (`<%- %>`) to prevent XSS from user-controlled SUMMARY.md content.

Test count increased from 60 to 69 (9 new tests: 6 unit tests for parseTaskResultsTable + 3 integration tests for getPhaseDetail commits).

## Known Issues

None.

## Dependencies Provided

- `parseTaskResultsTable(rawContent)` is exported from `phase.service.js` and can be reused by any service that needs to parse Task Results tables from SUMMARY.md files.
- `getPhaseDetail()` now returns `commits: Array<{task, status, hash, files, verify}>` on each plan object, available to any consumer of the phase detail data.
