# Requirements: Towline Dashboard

## v1 Requirements (committed scope)

### Session Viewer
- [ ] **SV-01**: Dashboard landing page displays project overview — phase list from ROADMAP.md, current state from STATE.md, overall progress percentage
- [ ] **SV-02**: Phase detail view shows all plans in the phase, each plan's SUMMARY.md content (status, key decisions, metrics, files modified), and verification status
- [ ] **SV-03**: Commit history per phase parsed from SUMMARY.md frontmatter key-files and metrics fields
- [ ] **SV-04**: Roadmap visualization with color-coded status indicators (complete/in-progress/not-started/failed) per phase

### Todo Manager
- [ ] **TD-01**: List all pending todos from `.planning/todos/pending/` with priority badges and phase tags
- [ ] **TD-02**: Mark a todo as done via web UI (moves file from `pending/` to `done/`)
- [ ] **TD-03**: Create new todo via web form (writes markdown file with YAML frontmatter to `pending/`)
- [ ] **TD-04**: Todo detail view renders full markdown content with frontmatter metadata displayed

### Infrastructure
- [ ] **INF-01**: Express 5.x server with three-layer architecture (routes → services → repositories)
- [ ] **INF-02**: Markdown/YAML frontmatter parsing using gray-matter + marked
- [ ] **INF-03**: File watching with chokidar + Server-Sent Events for live browser updates when `.planning/` files change
- [ ] **INF-04**: CLI entry point — `npx towline-dashboard --dir /path/to/project` or `node server.js --dir .`
- [ ] **INF-05**: Cross-platform path handling using path.join/path.resolve (Windows + macOS/Linux)

### UI
- [ ] **UI-01**: Server-side templates using EJS with consistent layout (header, sidebar navigation, content area)
- [ ] **UI-02**: HTMX for dynamic content loading — phase details, todo operations without full page reload
- [ ] **UI-03**: Pico.css for minimal semantic styling with status-appropriate color coding

## v2 Requirements (deferred)
- **UI-04**: Responsive/mobile layout — local dev tool, desktop-first is fine for v1
- **OQ-02**: Multi-project support — switch between Towline projects without restart
- **OQ-03**: In-browser editing of `.planning/` files — adds write complexity, view-only for v1

## Out of Scope
| Feature | Reason |
|---------|--------|
| Large project optimization (pagination/lazy-loading) | Premature — `.planning/` directories are small |
| User authentication | Local dev tool, single user |
| Database backend | File-based by design, reads `.planning/` directly |
| Deployment/hosting | Runs locally only |

## Traceability
| Requirement | Phase | Status |
|-------------|-------|--------|
| SV-01 | -- | Pending |
| SV-02 | -- | Pending |
| SV-03 | -- | Pending |
| SV-04 | -- | Pending |
| TD-01 | -- | Pending |
| TD-02 | -- | Pending |
| TD-03 | -- | Pending |
| TD-04 | -- | Pending |
| INF-01 | -- | Pending |
| INF-02 | -- | Pending |
| INF-03 | -- | Pending |
| INF-04 | -- | Pending |
| INF-05 | -- | Pending |
| UI-01 | -- | Pending |
| UI-02 | -- | Pending |
| UI-03 | -- | Pending |
