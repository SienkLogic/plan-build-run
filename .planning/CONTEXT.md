# Project Context

## Locked Decisions
| Decision | Rationale | Locked By |
|----------|-----------|-----------|
| Node.js 24 LTS | Latest LTS, support through 2028 | Research |
| Express 5.x | Better async error handling, security improvements | Research |
| HTMX + Alpine.js | No build step, server-rendered | User + Research |
| EJS templates | Simple, HTML-familiar syntax | Research |
| Pico.css | Semantic styling, minimal footprint | Research |
| gray-matter | Industry standard frontmatter parser | Research |
| marked | Fast markdown renderer | Research |
| chokidar 5.x | Cross-platform file watching | Research |
| SSE for real-time | Unidirectional, simpler than WebSocket | Research |
| Three-layer architecture | Routes → Services → Repositories | Research |
| Vitest for testing | Faster than Jest, native ESM | Research |

## User Constraints
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Separate repo from Towline source

## Deferred Ideas
| Idea | Reason Deferred |
|------|----------------|
| Responsive/mobile layout | Desktop-first, local tool |
| Multi-project support | Complexity, not needed for v1 |
| In-browser file editing | Write safety, view-only for v1 |
