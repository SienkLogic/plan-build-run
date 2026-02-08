# Roadmap: Towline Dashboard

## Overview

The Towline Dashboard is a Node.js web application that serves as a session viewer and todo manager for Towline-managed projects. Starting from a bare Express 5.x server with three-layer architecture, each phase adds a discrete layer of functionality: first the core parsing infrastructure and UI shell, then the session viewer features (project overview, phase details, roadmap visualization), followed by the todo manager (listing, CRUD operations), and finally real-time updates via file watching and SSE. The journey progresses from "server starts and renders a page" to "fully interactive dashboard with live updates when .planning/ files change."

## Phases

- [x] Phase 01: Project Scaffolding -- Node.js project structure, Express 5.x server, CLI entry point, three-layer skeleton
- [x] Phase 02: Core Parsing Layer -- Markdown/YAML repository and service using gray-matter + marked, cross-platform path handling
- [x] Phase 03: UI Shell -- EJS layout system with Pico.css, header, sidebar navigation, content area, static assets
- [x] Phase 04: Dashboard Landing Page -- Project overview page displaying phase list, current state, overall progress percentage
- [x] Phase 05: Phase Detail View -- Phase detail page showing plans, SUMMARY.md content, verification status
- [x] Phase 06: Roadmap Visualization -- Color-coded roadmap view with status indicators per phase
- [x] Phase 07: Commit History -- Commit history per phase parsed from SUMMARY.md frontmatter
- [x] Phase 08: Todo List and Detail -- List pending todos with priority badges and phase tags, todo detail view
- [x] Phase 09: Todo Write Operations -- Create new todo via form, mark todo as done via UI
- [x] Phase 10: File Watching and SSE -- Chokidar file watcher with Server-Sent Events for live browser updates
- [x] Phase 11: HTMX Dynamic Loading -- Replace full page reloads with HTMX partial content loading
- [x] Phase 12: Polish and Hardening -- Error handling, security hardening, edge cases, cross-platform testing

## Phase Details

### Phase 01: Project Scaffolding
**Goal**: Express 5.x server starts via CLI, serves a placeholder page, and demonstrates three-layer architecture
**Depends on**: None (starting phase)
**Requirements**: [INF-01, INF-04, INF-05]
**Success Criteria**:
  1. Running `node src/server.js --dir /path/to/project` starts the server on port 3000
  2. GET / returns HTTP 200 with a placeholder HTML page
  3. Directory structure follows routes -> services -> repositories pattern
  4. All paths use path.join/path.resolve (no hardcoded separators)
**Plans**: 2 plans

### Phase 02: Core Parsing Layer
**Goal**: Repository and service layers can read and parse any markdown file with YAML frontmatter from a .planning/ directory
**Depends on**: Phase 01
**Requirements**: [INF-02, INF-05]
**Success Criteria**:
  1. PlanningRepository.readMarkdownFile() returns parsed frontmatter and rendered HTML for any .planning/ file
  2. UTF-8 BOM is stripped before parsing
  3. gray-matter JavaScript engine is disabled for safety
  4. Independent file reads use Promise.all() for parallel execution
  5. Unit tests pass with in-memory filesystem mocks
**Plans**: 2 plans

### Phase 03: UI Shell
**Goal**: EJS layout system renders pages with consistent header, sidebar navigation, and content area styled with Pico.css
**Depends on**: Phase 01
**Requirements**: [UI-01, UI-03]
**Success Criteria**:
  1. All pages share a common layout with header, sidebar, and content area
  2. Pico.css provides semantic styling without custom class names
  3. Sidebar shows navigation links for Dashboard, Phases, Todos, and Roadmap
  4. Status color coding works: green for complete, yellow for in-progress, red for blocked/failed, gray for not-started
**Plans**: 2 plans

### Phase 04: Dashboard Landing Page
**Goal**: Landing page displays project overview with phase list from ROADMAP.md, current state from STATE.md, and overall progress percentage
**Depends on**: Phase 02, Phase 03
**Requirements**: [SV-01]
**Success Criteria**:
  1. Dashboard shows project name and current phase from STATE.md
  2. Phase list renders with status indicators from ROADMAP.md
  3. Overall progress percentage is calculated from completed vs total phases
  4. Missing STATE.md or ROADMAP.md displays graceful fallback message
**Plans**: 2 plans

### Phase 05: Phase Detail View
**Goal**: Clicking a phase shows all plans in that phase, each plan's SUMMARY.md content, and verification status
**Depends on**: Phase 04
**Requirements**: [SV-02]
**Success Criteria**:
  1. GET /phases/:phaseId renders a detail page listing all plans in the phase directory
  2. Each plan displays its SUMMARY.md content (status, key decisions, metrics, files modified)
  3. Verification status shows pass/fail indicators from VERIFICATION.md if present
  4. Phase with no plans shows an appropriate empty state
**Plans**: 2 plans

### Phase 06: Roadmap Visualization
**Goal**: Dedicated roadmap page displays all phases with color-coded status indicators
**Depends on**: Phase 04
**Requirements**: [SV-04]
**Success Criteria**:
  1. GET /roadmap renders a visual representation of all project phases
  2. Each phase shows its name, plan count, and completion status
  3. Color coding: green (complete), yellow (in-progress), red (failed), gray (not-started)
  4. Phase dependencies are visible in the visualization
**Plans**: 1 plan

### Phase 07: Commit History
**Goal**: Phase detail view includes commit history parsed from SUMMARY.md frontmatter
**Depends on**: Phase 05
**Requirements**: [SV-03]
**Success Criteria**:
  1. Phase detail page shows a commit history section
  2. Commits are parsed from SUMMARY.md frontmatter (key-files, metrics fields)
  3. Each commit entry shows description, files modified, and timestamp
  4. Phase with no commits shows an appropriate empty state
**Plans**: 1 plan

### Phase 08: Todo List and Detail
**Goal**: Todo manager lists all pending todos with priority badges and phase tags, with a detail view for individual todos
**Depends on**: Phase 02, Phase 03
**Requirements**: [TD-01, TD-04]
**Success Criteria**:
  1. GET /todos lists all markdown files from .planning/todos/pending/ directory
  2. Each todo displays title, priority badge (P0/P1/P2/PX), and phase tag from frontmatter
  3. Todos are sorted by priority (P0 first) then title
  4. GET /todos/:id renders the full markdown content with frontmatter metadata displayed
**Plans**: 2 plans

### Phase 09: Todo Write Operations
**Goal**: Users can create new todos and mark existing todos as done through the web UI
**Depends on**: Phase 08
**Requirements**: [TD-02, TD-03]
**Success Criteria**:
  1. POST /todos creates a new markdown file with YAML frontmatter in .planning/todos/pending/
  2. Web form captures title, priority, phase, and description
  3. PUT /todos/:id/done moves the file from pending/ to done/ directory
  4. Write operations use a sequential queue to prevent concurrent file corruption
**Plans**: 2 plans

### Phase 10: File Watching and SSE
**Goal**: Dashboard updates automatically when .planning/ files change on disk
**Depends on**: Phase 04, Phase 08
**Requirements**: [INF-03]
**Success Criteria**:
  1. Chokidar watches .planning/**/*.md with awaitWriteFinish debouncing
  2. GET /api/events/stream returns an SSE connection
  3. File changes emit SSE events to all connected browsers
  4. Browser receives events and refreshes the current view
  5. Watcher properly closes on server shutdown (SIGTERM/SIGINT)
**Plans**: 2 plans

### Phase 11: HTMX Dynamic Loading
**Goal**: Navigation and todo operations use HTMX for partial content loading without full page reloads
**Depends on**: Phase 09, Phase 10
**Requirements**: [UI-02]
**Success Criteria**:
  1. Phase detail loading uses hx-get to swap content area without full reload
  2. Todo creation uses hx-post to append the new todo to the list
  3. Todo completion uses hx-put to update the todo item in-place
  4. SSE events trigger HTMX content refresh for the affected page section
  5. All routes return HTML fragments when HX-Request header is present
**Plans**: 2 plans

### Phase 12: Polish and Hardening
**Goal**: Production-quality error handling, security hardening, cross-platform validation, and edge case coverage
**Depends on**: Phase 11
**Requirements**: [INF-01, INF-05]
**Success Criteria**:
  1. Global error handler renders user-friendly error pages
  2. Path traversal protection validates all file access stays within .planning/
  3. Server binds to 127.0.0.1 only (not 0.0.0.0)
  4. All async routes handle errors gracefully (missing files, malformed YAML, empty directories)
  5. Cross-platform tests pass on Windows and macOS/Linux path handling
**Plans**: 2 plans

## Dependency Graph

```
Phase 01 ──> Phase 02 ──> Phase 04 ──> Phase 05 ──> Phase 07
         |             |            |
         |             |            └──> Phase 06
         |             |
         └──> Phase 03 ──> Phase 04
                       |
                       └──> Phase 08 ──> Phase 09
                                    |
Phase 04 + Phase 08 ──> Phase 10 ──┘
                                    |
Phase 09 + Phase 10 ──> Phase 11 ──> Phase 12
```

## Requirement Traceability

| Requirement | Phase | Description |
|-------------|-------|-------------|
| INF-01 | 01, 12 | Express 5.x three-layer architecture |
| INF-02 | 02 | Markdown/YAML parsing with gray-matter + marked |
| INF-03 | 10 | File watching with chokidar + SSE |
| INF-04 | 01 | CLI entry point |
| INF-05 | 01, 02, 12 | Cross-platform path handling |
| UI-01 | 03 | EJS templates with consistent layout |
| UI-02 | 11 | HTMX dynamic content loading |
| UI-03 | 03 | Pico.css semantic styling with status colors |
| SV-01 | 04 | Dashboard landing page with project overview |
| SV-02 | 05 | Phase detail view with plans and verification |
| SV-03 | 07 | Commit history per phase from SUMMARY.md |
| SV-04 | 06 | Roadmap visualization with color-coded status |
| TD-01 | 08 | List pending todos with priority and phase tags |
| TD-02 | 09 | Mark todo as done via web UI |
| TD-03 | 09 | Create new todo via web form |
| TD-04 | 08 | Todo detail view with full markdown content |

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 01. Project Scaffolding | 0/2 | Not started | -- |
| 02. Core Parsing Layer | 0/2 | Not started | -- |
| 03. UI Shell | 0/2 | Not started | -- |
| 04. Dashboard Landing Page | 0/2 | Not started | -- |
| 05. Phase Detail View | 0/2 | Not started | -- |
| 06. Roadmap Visualization | 0/1 | Not started | -- |
| 07. Commit History | 0/1 | Not started | -- |
| 08. Todo List and Detail | 0/2 | Not started | -- |
| 09. Todo Write Operations | 0/2 | Not started | -- |
| 10. File Watching and SSE | 0/2 | Not started | -- |
| 11. HTMX Dynamic Loading | 0/2 | Not started | -- |
| 12. Polish and Hardening | 0/2 | Not started | -- |
