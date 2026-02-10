---
title: "GSD tools review"
status: done
priority: P2
source: user-request
created: 2026-02-10
completed: 2026-02-10
---

## Goal

Review GSD's shared tools/utilities and compare with Towline's scripts.

## GSD Tools Architecture

### gsd-tools.js (162KB monolith)

GSD's primary utility is a single 162KB CLI script (`get-shit-done/bin/gsd-tools.js`) that handles deterministic operations:

| Command Group | Operations |
|--------------|-----------|
| Phase management | add, insert, remove, complete |
| Roadmap analysis | analyze |
| Milestone lifecycle | complete |
| Validation | consistency checks |
| Progress rendering | json, table, bar formats |
| Todo management | complete |
| Scaffolding | context, uat, verification, phase-dir |
| Verification suite | plan-structure, phase-completeness, references, commits, artifacts, key-links |
| Frontmatter CRUD | get, set, merge, validate |
| Template filling | summary, plan, verification |
| State progression | advance-plan, update-progress, record-metric, add-decision, add-blocker, resolve-blocker, record-session |

### GSD Hooks (2 scripts)

| Script | Event | Purpose |
|--------|-------|---------|
| gsd-check-update.js | SessionStart | Background npm version check |
| gsd-statusline.js | StatusLine | Formatted status display with context bar |

### GSD build-hooks.js

Generates `hooks.json` from hook source files. Towline's `hooks.json` is hand-maintained.

## Towline Tools Architecture

### towline-tools.js (shared utility library)

Towline's equivalent is a lighter shared library used by hook scripts:

| Function | Purpose |
|----------|---------|
| stateLoad() | Parse STATE.md into structured data |
| configLoad() | Load and validate config.json |
| configValidate() | Validate config against schema |
| planningDir() | Resolve .planning/ path |
| logHook() | Standardized hook logging |

### Towline Scripts (25 files)

Towline has 25 script files vs GSD's 3 (gsd-tools.js + 2 hooks). Towline's philosophy is **many small scripts** vs GSD's **one large CLI**:

| Category | Scripts | Count |
|----------|---------|-------|
| Hook enforcement | validate-commit, check-plan-format, check-roadmap-sync, check-dangerous-commands, check-phase-boundary, check-skill-workflow, check-doc-sprawl, check-subagent-output | 8 |
| Dispatchers | pre-write-dispatch, post-write-dispatch, post-write-quality | 3 |
| Session lifecycle | progress-tracker, session-cleanup, auto-continue, context-budget-check, suggest-compact, track-context-budget | 6 |
| Logging | hook-logger, event-logger, log-subagent, log-tool-failure | 4 |
| Display | status-line | 1 |
| Utilities | towline-tools, validate-plugin-structure, local-llm | 3 |

## Comparative Analysis

### What GSD's gsd-tools.js does that Towline handles differently

| gsd-tools.js Feature | How Towline Handles It |
|----------------------|----------------------|
| Phase add/insert/remove | Plan skill does this inline — agent modifies ROADMAP.md directly |
| Roadmap analyze | Status skill reads ROADMAP.md and STATE.md directly |
| Milestone complete | Milestone skill orchestrates archiving directly |
| Validate consistency | Health skill + validation scripts (check-plan-format, check-roadmap-sync) |
| Progress rendering | Status skill + progress-tracker hook |
| Todo complete | Todo skill moves files from pending/ to done/ |
| Scaffolding | Begin/plan skills create directories and files |
| Verification suite | Verifier agent + check-plan-format + validate-plugin-structure |
| Frontmatter CRUD | Agents read/write frontmatter directly (no abstraction layer) |
| Template filling | Skills use EJS-style .tmpl files read by agents |
| State progression | Agents update STATE.md directly via Write tool |

### Key Differences

1. **GSD offloads deterministic ops to Node.js CLI** — reduces agent token usage for operations that don't need AI (phase number calculation, file scaffolding, frontmatter parsing). This is a genuine optimization.

2. **Towline keeps agents in charge** — agents handle everything including file creation and state updates. This is simpler (one abstraction layer) but spends more tokens on deterministic operations.

3. **Hook philosophy diverges sharply**: GSD has 2 passive hooks (display-only). Towline has 25 active scripts including 8 enforcement hooks that block bad actions. Towline's hook system is significantly more sophisticated.

4. **No build step**: GSD uses `build-hooks.js` to generate hooks.json. Towline maintains hooks.json manually. Neither approach is clearly better.

## Recommendations

1. **Consider a lightweight towline-tools CLI** for deterministic operations that waste agent tokens:
   - Phase number calculation (decimal phase insertion math)
   - Directory scaffolding (creating phase directories)
   - Frontmatter parsing (extracting metadata from markdown files)
   - This would be an optimization, not a gap — everything works without it.
   - **Priority**: Low — the token savings are marginal vs the maintenance cost of a new CLI.

2. **Towline's hook system is a clear advantage** — GSD has no equivalent of commit validation, plan format checking, roadmap sync, dangerous command blocking, doc sprawl detection, or subagent output verification. This is Towline's most differentiated feature.

3. **No action needed** — the architectural differences are design choices, not gaps. GSD chose CLI tooling optimization; Towline chose hook enforcement. Both are valid.

## Acceptance Criteria

- [x] Review of gsd-tools.js capabilities and architecture
- [x] Comparison with Towline's script ecosystem
- [x] Assessment of what to adopt — no changes recommended (different but valid approaches)
