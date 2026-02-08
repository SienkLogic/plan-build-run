---
phase: "03-ui-shell"
plan: "03-02"
status: "complete"
subsystem: "page-templates"
tags: ["templates", "routes", "sidebar", "layout", "placeholder"]
requires: ["03-01: layout-top/bottom partials, sidebar, CSS"]
provides:
  - "Restructured index.ejs with layout wrapper and content variable"
  - "Restructured error.ejs with layout wrapper"
  - "coming-soon.ejs for placeholder pages"
  - "GET /phases, /todos, /roadmap placeholder routes"
  - "Status color demo on homepage"
affects:
  - "src/views/ (restructured templates)"
  - "src/routes/ (new pages router)"
  - "src/app.js (registers pages router)"
  - "src/middleware/errorHandler.js (passes activePage)"
tech_stack: ["EJS", "Express 5.x"]
key_files:
  - "src/views/index.ejs: restructured with layout-top/bottom, uses <%- content %>"
  - "src/views/error.ejs: restructured with layout-top/bottom"
  - "src/views/coming-soon.ejs: placeholder for future pages"
  - "src/routes/pages.routes.js: GET /phases, /todos, /roadmap"
  - "src/app.js: registers pagesRouter"
key_decisions: []
deferred: []
metrics:
  tasks_completed: 3
  tasks_total: 3
  commits: ["4092d08", "38478e8", "c22e29a"]
  files_created: ["src/views/coming-soon.ejs", "src/routes/pages.routes.js"]
  files_modified: ["src/views/index.ejs", "src/views/error.ejs", "src/app.js", "src/middleware/errorHandler.js", "src/routes/index.routes.js"]
---

# Summary: Plan 03-02 -- Page Template Restructuring and Placeholder Routes

## What Changed

All existing page templates were migrated from the Phase 01 "full HTML document" pattern to the Phase 03 "layout-top/layout-bottom" pattern. Three new placeholder routes were added so every sidebar link navigates to a working page.

## Tasks Completed

### T1: Restructure page templates (4092d08)
- Replaced full HTML document wrappers in `index.ejs` and `error.ejs` with `layout-top` / `layout-bottom` includes
- Fixed the template variable mismatch: changed `<%= message %>` to `<%- content %>` (unescaped HTML from marked)
- Created `coming-soon.ejs` template accepting `featureName`, `title`, and `activePage`

### T2: Add placeholder routes and wire up pages router (38478e8)
- Created `pages.routes.js` with GET `/phases`, `/todos`, `/roadmap` routes rendering `coming-soon` template
- Updated `index.routes.js` to pass `activePage: 'dashboard'` to the index template
- Registered `pagesRouter` in `app.js` after `indexRouter` (error handler remains last)
- Updated `errorHandler.js` to pass `activePage: ''` so no sidebar link highlights on error pages

### T3: Add status color legend to dashboard (c22e29a)
- Added status badge demo section to `index.ejs` showing all four status states
- Verified `status-colors.css` and `layout.css` are loaded and render correctly
- Section will be replaced with real phase status data in Phase 04

## Verification Results

All three tasks passed their verification scripts:
- T1: All 3 templates restructured correctly (no DOCTYPE, layout-top/bottom present, content variable used)
- T2: All 4 routes (/, /phases, /todos, /roadmap) return HTTP 200 with page-wrapper grid, sidebar, and aria-current highlighting
- T3: Status badges render with all 4 data-status attributes; layout.css and status-colors.css linked in head

## Architecture Notes

- `index.ejs` hardcodes `activePage: 'dashboard'` in its layout-top include (route also passes it, but template wins)
- `pagesRouter` is mounted on `/` (not `/pages`) because routes like `/phases` are top-level paths
- Router registration order: indexRouter -> pagesRouter -> errorHandler (error handler must be last)
- `coming-soon.ejs` returns HTTP 200 (not 501) since the routes exist and are intentionally placeholder
