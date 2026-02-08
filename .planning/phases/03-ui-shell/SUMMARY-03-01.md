---
phase: "03-ui-shell"
plan: "03-01"
status: "complete"
subsystem: "layout-infrastructure"
tags: ["css-grid", "pico-css", "sidebar", "status-colors", "layout"]
requires: []
provides:
  - "layout-top.ejs and layout-bottom.ejs partials for all page templates"
  - "Sidebar navigation partial with activePage highlighting"
  - "CSS Grid dashboard layout"
  - "Status color system via data-status attributes"
affects:
  - "public/css/ directory (new)"
  - "src/views/partials/ (updated and new files)"
tech_stack: ["Pico.css v2", "CSS Grid", "EJS"]
key_files:
  - "public/css/layout.css: CSS Grid layout for dashboard"
  - "public/css/status-colors.css: status color definitions"
  - "src/views/partials/layout-top.ejs: DRY layout wrapper top"
  - "src/views/partials/layout-bottom.ejs: DRY layout wrapper bottom"
  - "src/views/partials/sidebar.ejs: sidebar navigation"
key_decisions:
  - "Deprecated src/views/layout.ejs (Phase 01 reference file) in favor of layout-top.ejs and layout-bottom.ejs"
  - "Removed container class from header.ejs and footer.ejs since CSS Grid now controls positioning"
  - "Removed Dashboard link from header nav since it is now in the sidebar"
  - "Used hardcoded color values in status-colors.css because Pico.css v2 does not expose named color variables"
  - "Added typeof guards on activePage and title in EJS templates to prevent ReferenceError"
deferred: []
metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: ["f0b5a51", "da12147"]
  files_created: ["public/css/layout.css", "public/css/status-colors.css", "src/views/partials/sidebar.ejs", "src/views/partials/layout-top.ejs", "src/views/partials/layout-bottom.ejs"]
  files_modified: ["src/views/partials/head.ejs", "src/views/partials/header.ejs", "src/views/partials/footer.ejs", "src/views/layout.ejs"]
---

# Summary: Plan 03-01 -- Layout Infrastructure, Sidebar, and CSS

## What was built

This plan established the foundational layout system for the Towline Dashboard. Two tasks were completed:

### Task 03-01-T1: CSS Grid layout and status colors
- Created `public/css/layout.css` with a CSS Grid dashboard layout using `grid-template-areas` for header, sidebar, content, and footer regions. The sidebar is fixed at 250px with the content area filling the remaining space. Uses Pico.css custom properties for border colors and theming.
- Created `public/css/status-colors.css` with `data-status` attribute selectors for complete (green), in-progress (yellow), blocked/failed (red), and not-started/pending (gray). Includes `.status-badge` class for pill-style badges with background and text color combinations.

### Task 03-01-T2: Layout partials and partial updates
- Created `src/views/partials/layout-top.ejs` -- the top half of the layout wrapper that includes head, header, and sidebar partials, opens the `.page-wrapper` grid container and `<main>` element.
- Created `src/views/partials/layout-bottom.ejs` -- the bottom half that closes `</main>`, includes footer, and closes the HTML document.
- Created `src/views/partials/sidebar.ejs` with four navigation links (Dashboard, Phases, Todos, Roadmap) and `aria-current="page"` attribute for active page highlighting based on the `activePage` template variable.
- Updated `src/views/partials/head.ejs` to link the two new CSS files (`/css/layout.css` and `/css/status-colors.css`).
- Updated `src/views/partials/header.ejs` -- removed `container` class (grid handles positioning) and removed the Dashboard link (now in sidebar).
- Updated `src/views/partials/footer.ejs` -- removed `container` class.
- Deprecated `src/views/layout.ejs` with a comment pointing to the new layout partials.

## Usage pattern for page templates (Plan 03-02)

After this plan, page templates should use the layout wrapper like this:

```ejs
<%- include('partials/layout-top', { title: 'Page Title', activePage: 'dashboard' }) %>
  <!-- Page-specific content here -->
<%- include('partials/layout-bottom') %>
```

## Verification

All verification checks passed:
- Both CSS files contain expected selectors (`grid-template-areas`, `data-status`)
- All 6 partials exist with expected content
- layout-top.ejs includes `page-wrapper` class and sidebar include
- sidebar.ejs contains `aria-current` and all four navigation links (`/phases`, `/todos`, `/roadmap`)
- head.ejs links to both custom CSS files
