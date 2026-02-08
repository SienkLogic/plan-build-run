---
phase: "02-core-parsing-layer"
plan: "02-02"
status: "complete"
subsystem: "service-layer"
tags: ["service", "parsing", "path-traversal", "testing"]
requires: ["02-01: readMarkdownFile, listPlanningFiles"]
provides:
  - "getHomepage(projectDir) function (enhanced with real parsing)"
  - "getMarkdownFile(projectDir, relativePath) function"
affects:
  - "src/services/project.service.js (replaced placeholder)"
  - "tests/services/ directory (new)"
tech_stack: ["vitest", "memfs"]
key_files:
  - "src/services/project.service.js: getHomepage with ENOENT fallback, getMarkdownFile with path traversal protection"
  - "tests/services/project.service.test.js: comprehensive service unit tests"
key_decisions: []
deferred: []
metrics:
  tasks_completed: 3
  tasks_total: 3
  commits: ["e08fdd0", "ee1f33e"]
  files_created: ["tests/services/project.service.test.js"]
  files_modified: ["src/services/project.service.js"]
---

# Summary: Plan 02-02 - Service Layer Enhancement and Tests

## What was done

Replaced the Phase 1 placeholder `project.service.js` with a real service layer that calls the repository functions from Plan 02-01. Added comprehensive unit tests using memfs mocks.

## Tasks completed

### Task 02-02-T1: Implement service layer with getHomepage and getMarkdownFile
- **Commit**: `e08fdd0`
- Replaced hardcoded placeholder with real service logic
- `getHomepage(projectDir)` reads `.planning/README.md`, parses frontmatter for title, returns HTML content
- `getHomepage` returns friendly fallback `{title: 'Welcome', content: '<p>No project README found.</p>'}` on ENOENT
- `getHomepage` re-throws non-ENOENT errors (malformed YAML, permission denied)
- `getMarkdownFile(projectDir, relativePath)` reads any file under `.planning/` with parsed result
- `getMarkdownFile` uses `path.relative()` to detect path traversal; throws custom error with `code: 'PATH_TRAVERSAL'` and `status: 403`
- `listPlanningFiles` imported but not yet consumed by a service function (available for Phase 04/08)

### Task 02-02-T2: Create service layer unit tests
- **Commit**: `ee1f33e`
- Created `tests/services/project.service.test.js` with 10 tests
- Uses same memfs mock pattern as repository tests
- getHomepage tests: parsed content, default title fallback, missing README, missing .planning dir, malformed YAML re-throw
- getMarkdownFile tests: normal read, root-level read, missing file ENOENT, basic `..` traversal, deeply nested `phases/../../` traversal

### Task 02-02-T3: Run full test suite
- Verification-only task, no commit needed
- All 26 tests pass (16 repository + 10 service)
- No test interference between repository and service test files
- End-to-end import chain verified: `node -e "import(...).then(m => m.getHomepage('.'))"` returns "Welcome" fallback

## Test results

```
 ✓ tests/services/project.service.test.js (10 tests) 21ms
 ✓ tests/repositories/planning.repository.test.js (16 tests) 28ms

 Test Files  2 passed (2)
      Tests  26 passed (26)
```

## Notes

- The template variable name changed from `message` to `content` in the service return value. The existing Phase 01 `index.ejs` template uses `<%= message %>` which renders as empty when undefined (EJS does not throw). The `content` field with HTML will be integrated in Phase 03 when templates are rebuilt with `<%- content %>` (unescaped).
- `listPlanningFiles` is imported in the service module but not yet consumed by a service function. It will be used by future dashboard/todo services in Phase 04 and Phase 08.
