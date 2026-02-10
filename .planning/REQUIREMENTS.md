# Requirements: Towline Dashboard

## v1 Requirements (committed scope)

### Session Viewer
- [x] **SV-01**: Dashboard landing page displays project overview — phase list from ROADMAP.md, current state from STATE.md, overall progress percentage
- [x] **SV-02**: Phase detail view shows all plans in the phase, each plan's SUMMARY.md content (status, key decisions, metrics, files modified), and verification status
- [x] **SV-03**: Commit history per phase parsed from SUMMARY.md frontmatter key-files and metrics fields
- [x] **SV-04**: Roadmap visualization with color-coded status indicators (complete/in-progress/not-started/failed) per phase

### Todo Manager
- [x] **TD-01**: List all pending todos from `.planning/todos/pending/` with priority badges and phase tags
- [x] **TD-02**: Mark a todo as done via web UI (moves file from `pending/` to `done/`)
- [x] **TD-03**: Create new todo via web form (writes markdown file with YAML frontmatter to `pending/`)
- [x] **TD-04**: Todo detail view renders full markdown content with frontmatter metadata displayed

### Infrastructure
- [x] **INF-01**: Express 5.x server with three-layer architecture (routes → services → repositories)
- [x] **INF-02**: Markdown/YAML frontmatter parsing using gray-matter + marked
- [x] **INF-03**: File watching with chokidar + Server-Sent Events for live browser updates when `.planning/` files change
- [x] **INF-04**: CLI entry point — `npx towline-dashboard --dir /path/to/project` or `node server.js --dir .`
- [x] **INF-05**: Cross-platform path handling using path.join/path.resolve (Windows + macOS/Linux)

### UI
- [x] **UI-01**: Server-side templates using EJS with consistent layout (header, sidebar navigation, content area)
- [x] **UI-02**: HTMX for dynamic content loading — phase details, todo operations without full page reload
- [x] **UI-03**: Pico.css for minimal semantic styling with status-appropriate color coding

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
| SV-01 | 04 | Complete |
| SV-02 | 05 | Complete |
| SV-03 | 07 | Complete |
| SV-04 | 06 | Complete |
| TD-01 | 08 | Complete |
| TD-02 | 09 | Complete |
| TD-03 | 09 | Complete |
| TD-04 | 08 | Complete |
| INF-01 | 01, 12 | Complete |
| INF-02 | 02 | Complete |
| INF-03 | 10 | Complete |
| INF-04 | 01 | Complete |
| INF-05 | 01, 02, 12 | Complete |
| UI-01 | 03 | Complete |
| UI-02 | 11 | Complete |
| UI-03 | 03 | Complete |
