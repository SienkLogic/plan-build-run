# Towline Dashboard

## What This Is
A Node.js web application that serves as a session viewer and todo manager for Towline-managed projects. It reads the `.planning/` directory structure (STATE.md, ROADMAP.md, SUMMARY.md, VERIFICATION.md, todos/) and renders project progress visually in a browser. Also provides a web UI for the file-based todo system that `/dev:todo` manages via CLI.

## Core Value
Give Towline users visual insight into their project's progress without leaving the browser.

## Requirements
### Active (current scope)
See: .planning/REQUIREMENTS.md (16 committed requirements across Session Viewer, Todo Manager, Infrastructure, and UI)

### Out of Scope
- Large project optimization (pagination/lazy-loading) — premature, `.planning/` directories are small
- User authentication — local dev tool, single user
- Database backend — file-based by design
- Deployment/hosting — runs locally only

## Context
- Built as a companion tool for Towline (Claude Code development workflow plugin)
- Also serves as the first real test of Towline's own workflow (dogfooding)
- Tech stack: Node.js 24 LTS, Express 5.x, EJS, gray-matter, marked, chokidar, HTMX, Pico.css
- Will live in a separate directory from the Towline source repo (D:\Repos\towline-test-project)
- Loaded as a plugin via `claude --plugin-dir D:\Repos\towline`

## Constraints
- Must work cross-platform (Windows + macOS/Linux)
- No build step — HTMX + Alpine.js + server-side templates
- Reads `.planning/` files read-only for session viewer (write only for todo operations)
- Single-user local tool — no auth, no deployment

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Express 5.x over Fastify | Simplicity + ecosystem maturity for small tool | Adopted |
| HTMX + Alpine.js over React/Vue | No build step, server-rendered, simpler | Adopted |
| SSE over WebSocket | Unidirectional updates sufficient, simpler | Adopted |
| Pico.css over Tailwind | Semantic styling, no build step | Adopted |
| gray-matter + marked | Industry standard, battle-tested | Adopted |
| Three-layer architecture | Clean separation for testability | Adopted |
