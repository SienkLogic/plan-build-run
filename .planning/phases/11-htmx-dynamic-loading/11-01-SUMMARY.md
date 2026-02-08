---
phase: "11-htmx-dynamic-loading"
plan: "11-01"
status: "complete"
subsystem: "views/templates"
tags:
  - "htmx"
  - "sse"
  - "templates"
  - "content-partials"
requires:
  - "09-02: todos.ejs, todo-detail.ejs page views"
  - "10-02: layout-bottom.ejs with SSE client script"
provides:
  - "HTMX 2.0.8 loaded on every page via head.ejs CDN script tag"
  - "HTMX SSE extension 2.2.2 loaded on every page via head.ejs CDN script tag"
  - "5 standalone content partials that can be rendered independently for HTMX fragment responses"
  - "main element has id='main-content' for HTMX targeting"
  - "Sidebar links have hx-get, hx-target, hx-push-url attributes for SPA-like navigation"
affects:
  - "src/views/partials/head.ejs"
  - "src/views/partials/layout-top.ejs"
  - "src/views/partials/sidebar.ejs"
  - "src/views/index.ejs"
  - "src/views/phase-detail.ejs"
  - "src/views/todos.ejs"
  - "src/views/todo-detail.ejs"
  - "src/views/roadmap.ejs"
tech_stack:
  - "HTMX 2.0.8 (CDN)"
  - "htmx-ext-sse 2.2.2 (CDN)"
  - "EJS partials"
key_files:
  - "src/views/partials/head.ejs: HTMX and SSE extension CDN script tags"
  - "src/views/partials/layout-top.ejs: main element with id='main-content'"
  - "src/views/partials/sidebar.ejs: navigation links with hx-get, hx-target, hx-push-url"
  - "src/views/partials/dashboard-content.ejs: extracted dashboard content partial"
  - "src/views/partials/phase-content.ejs: extracted phase detail content partial"
  - "src/views/partials/todos-content.ejs: extracted todo list content partial"
  - "src/views/partials/todo-detail-content.ejs: extracted todo detail content partial"
  - "src/views/partials/roadmap-content.ejs: extracted roadmap content partial"
key_decisions:
  - "hx-target uses #main-content (id selector) rather than tag selector for specificity"
  - "hx-swap omitted intentionally because HTMX defaults to innerHTML which is correct behavior"
  - "Content partials contain no layout includes, enabling independent rendering for fragment responses"
patterns:
  - "Content partial extraction: full page view becomes 3-line wrapper (layout-top + content-partial + layout-bottom)"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 5
  files_modified: 8
deferred: []
---

# Plan Summary: 11-01

## What Was Built

Added HTMX 2.0.8 and the SSE extension 2.2.2 to every page via CDN script tags in head.ejs. Set a stable `id="main-content"` on the `<main>` element in layout-top.ejs so HTMX can target it for content swaps.

Extracted the content from all 5 page views (index, phase-detail, todos, todo-detail, roadmap) into standalone content partials in the partials directory. Each full page view was simplified to a 3-line wrapper that includes layout-top, the content partial, and layout-bottom. This separation enables route handlers (in Plan 11-02) to render either the full page or just the content fragment depending on whether the request comes from HTMX.

Updated sidebar navigation links with `hx-get`, `hx-target="#main-content"`, and `hx-push-url="true"` attributes for SPA-like client-side navigation.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 11-01-T1: Add HTMX CDN script tags and set id on main element | done | 13c64cd | 2 | passed |
| 11-01-T2: Extract content partials and update sidebar with HTMX attributes | done | 24fda00 | 11 | passed |

## Key Implementation Details

Content partials are pure content fragments with no layout wrapper includes. They reference the same EJS variables as the original full page views, so route handlers pass the same data regardless of whether they render the full page or just the partial.

The sidebar uses `hx-target="#main-content"` to target the main element by its id attribute. The `hx-push-url="true"` attribute ensures the browser URL bar updates when navigating via HTMX, maintaining bookmarkability.

## Known Issues

None.

## Dependencies Provided

- HTMX library loaded globally for all subsequent HTMX features
- 5 content partials available for fragment rendering in Plan 11-02
- `#main-content` target id available for any HTMX swap operations
