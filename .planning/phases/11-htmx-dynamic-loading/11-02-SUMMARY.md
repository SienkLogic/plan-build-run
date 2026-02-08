---
phase: "11-htmx-dynamic-loading"
plan: "11-02"
status: "complete"
subsystem: "routes, templates, SSE"
tags:
  - "htmx"
  - "fragment-rendering"
  - "sse"
  - "progressive-enhancement"
requires:
  - "11-01: content partials, HTMX CDN tags, id=main-content on main element"
provides:
  - "All GET routes return content partials for HX-Request, full pages otherwise"
  - "All GET routes set Vary: HX-Request header for cache correctness"
  - "POST /todos returns todo-detail-content fragment for HTMX, redirect for normal"
  - "POST /todos/:id/done returns todos-content fragment for HTMX, redirect for normal"
  - "HTMX SSE extension replaces sse-client.js for live content refresh"
  - "Todo forms use hx-post for in-place operations"
  - "Create Todo link uses hx-get for HTMX navigation"
  - "currentPath template variable available in all routes for SSE refresh targeting"
affects:
  - "routes/index.routes.js"
  - "routes/pages.routes.js"
  - "layout-bottom.ejs (SSE extension replaces script tag)"
  - "footer.ejs (sse-status indicator removed)"
  - "todo-detail-content.ejs (hx-post on Mark as Done)"
  - "todos-content.ejs (hx-get on Create Todo)"
  - "todo-create.ejs (refactored to use partial)"
tech_stack:
  - "Express 5.x"
  - "EJS templates"
  - "HTMX 2.0.8"
  - "HTMX SSE extension 2.2.2"
key_files:
  - "src/routes/index.routes.js: HX-Request detection, Vary header, dashboard fragment"
  - "src/routes/pages.routes.js: HX-Request detection for all GET/POST handlers, currentPath"
  - "src/views/partials/todo-create-content.ejs: extracted form with hx-post"
  - "src/views/todo-create.ejs: refactored to use todo-create-content partial"
  - "src/views/partials/layout-bottom.ejs: HTMX SSE extension div replaces sse-client.js script"
  - "src/views/partials/footer.ejs: simplified, sse-status indicator removed"
  - "src/views/partials/todo-detail-content.ejs: hx-post on Mark as Done form"
  - "src/views/partials/todos-content.ejs: hx-get on Create Todo link"
key_decisions:
  - "Inline HTML fragment for /phases coming-soon route (no content partial exists for placeholder page)"
  - "currentPath defaults to '/' via typeof check in EJS template for safety"
  - "sse-client.js deleted entirely -- HTMX SSE extension handles connection, reconnection, and event-driven refresh"
  - "CSS for #sse-status in layout.css left in place (harmless, can be cleaned up in Phase 12)"
patterns:
  - "HX-Request header detection: every GET handler checks req.get('HX-Request') === 'true'"
  - "Vary header: every GET handler sets res.setHeader('Vary', 'HX-Request') for cache correctness"
  - "Progressive enhancement: forms have both method/action (non-JS) and hx-post (HTMX)"
  - "SSE-driven refresh: hidden div listens for sse:file-change and triggers hx-get to current path"
deferred: []
metrics:
  duration_minutes: 4
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 1
  files_modified: 7
  start_time: "2025-02-08T15:00:57Z"
  end_time: "2025-02-08T15:04:23Z"
---

# Plan Summary: 11-02

## What Was Built

Updated all route handlers in the Towline Dashboard to detect the `HX-Request` header and return content partials (fragments) instead of full pages when serving HTMX requests. Every GET route now sets the `Vary: HX-Request` response header for HTTP cache correctness. POST handlers for todo creation and completion return rendered fragments for HTMX clients and standard redirects for non-HTMX clients.

Replaced the custom `sse-client.js` (which used `window.location.reload()`) with HTMX SSE extension attributes on a hidden div in `layout-bottom.ejs`. File-change SSE events now trigger an `hx-get` to refresh only the main content area, providing a smoother live-reload experience. The `sse-status` connection indicator was removed from the footer since the HTMX SSE extension has no built-in visual indicator (can be added in Phase 12 if desired).

Added HTMX attributes to todo forms: the "Mark as Done" button uses `hx-post` for in-place update, the "Create Todo" link uses `hx-get` for HTMX navigation, and the create form uses `hx-post` for submission without full page reload. All forms retain standard HTML attributes for progressive enhancement (non-JS fallback).

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 11-02-T1: Update route handlers with HX-Request fragment detection | done | 922470a | 4 | passed |
| 11-02-T2: Replace sse-client.js with HTMX SSE extension and update forms | done | cb0a809 | 7 | passed |

## Key Implementation Details

- Every GET route handler follows the pattern: build templateData, set Vary header, check HX-Request, render partial or full page
- The `currentPath` template variable is passed by every route handler so the SSE refresh div knows which URL to re-fetch
- The HTMX SSE connection div uses `sse-close="close"` for server-initiated disconnect and has built-in auto-reconnection
- The `/phases` coming-soon route uses `res.send()` with inline HTML for its fragment since no content partial exists for this placeholder page
- POST handlers do not set the Vary header (POST responses are not cached by default)

## Known Issues

None discovered during execution.

## Dependencies Provided

- All routes support HTMX fragment rendering -- future HTMX navigation features can rely on this
- `currentPath` is available in all templates for any feature that needs to know the current route
- HTMX SSE extension is wired and active -- file changes trigger content-area refresh instead of full page reload
