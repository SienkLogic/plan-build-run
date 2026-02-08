---
phase: "12-polish-and-hardening"
plan: "12-01"
status: "complete"
subsystem: "middleware"
tags:
  - "error-handling"
  - "404"
  - "htmx"
  - "middleware"
requires:
  - "01-01: Express 5.x server and app structure"
  - "11-02: HTMX fragment rendering pattern"
provides:
  - "Production-quality error handler with headersSent check, env-aware stack traces, HTMX fragment support"
  - "404 catch-all middleware for unmatched routes"
  - "error.ejs template with conditional stack trace display"
  - "12 unit tests covering all error handler behaviors"
affects:
  - "src/middleware/errorHandler.js"
  - "src/middleware/notFoundHandler.js"
  - "src/views/error.ejs"
  - "src/app.js"
tech_stack:
  - "Express 5.x"
  - "EJS"
  - "Vitest"
key_files:
  - "src/middleware/errorHandler.js: Enhanced global error handler with headersSent, HTMX, and env-aware stack traces"
  - "src/middleware/notFoundHandler.js: 404 catch-all for unmatched routes"
  - "src/views/error.ejs: Error template with conditional stack trace in details element"
  - "src/app.js: Registers notFoundHandler after routes, before errorHandler"
  - "tests/middleware/errorHandler.test.js: 12 unit tests for error handler and 404 handler"
key_decisions:
  - "isDev uses NODE_ENV !== 'production' (not === 'development') so unset env defaults to dev behavior"
  - "HTMX error fragments use res.send() with inline HTML, normal requests use res.render('error')"
  - "Stack trace in error.ejs uses escaped output (<%= stack %>) to prevent XSS"
  - "Stack trace wrapped in <details> element for collapsible display"
patterns:
  - "Vary: HX-Request header for proper caching of dual-response routes"
  - "headersSent guard as first check in error middleware"
deferred: []
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 3
---

# Plan Summary: 12-01

## What Was Built

Enhanced the global error handler middleware to be production-quality. The error handler now checks `res.headersSent` before attempting to render (delegating to Express default handler if headers are already sent), detects `NODE_ENV` to show or hide stack traces (defaulting to visible when NODE_ENV is unset), and supports HTMX requests by returning HTML fragments instead of full-page renders when the `HX-Request` header is present.

Created a new 404 catch-all middleware (`notFoundHandler`) that creates a 404 error for any request that doesn't match a defined route. This middleware is registered after all route handlers but before the error handler in `app.js`.

Updated the `error.ejs` template to conditionally display stack traces inside a collapsible `<details>` element, using escaped output to prevent XSS. Added 12 comprehensive unit tests covering status rendering, stack trace visibility by environment, headersSent delegation, HTMX fragment responses, full-page layout rendering for normal requests, and 404 catch-all behavior.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 12-01-T1: Enhance error handler, create 404 handler, update error template | done | 2111b80 | 4 | passed |
| 12-01-T2: Write error handler and 404 handler unit tests | done | 7ca45f4 | 1 | passed |

## Key Implementation Details

- The error handler has a 4-parameter signature `(err, req, res, next)` with an eslint-disable comment for the unused `next` parameter (required by Express to recognize it as error middleware).
- `notFoundHandler` creates an Error with `status = 404` and passes it to `next()`, which flows into the error handler.
- The `Vary: HX-Request` header is set on all error responses for proper CDN/cache behavior.
- HTMX error fragments include the stack trace in a `<pre><code>` block when in dev mode.

## Known Issues

None.

## Dependencies Provided

- Other plans can rely on unmatched routes producing 404 error pages.
- Other plans can rely on the error handler supporting HTMX fragment responses.
- Error template accepts `stack` variable (optional) for conditional display.

## Verification

All verify commands passed. 126 tests passing across 9 test files (114 existing + 12 new).
