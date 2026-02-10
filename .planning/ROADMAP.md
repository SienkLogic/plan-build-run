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
- [x] Phase 13: Extract & Deduplicate -- Mechanically extract ~1,900 lines of inline templates and prompt templates from SKILL.md files and agent definitions into external files, updating all references to lazy-load via Read
- [x] Phase 14: Reference Architecture & GSD Parity -- Consolidate 7 scattered reference docs into a `references/` directory, create new templates and reference docs for GSD structural parity


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
| 01. Project Scaffolding | 2/2 | Complete | 2026-02-08 |
| 02. Core Parsing Layer | 2/2 | Complete | 2026-02-08 |
| 03. UI Shell | 2/2 | Complete | 2026-02-08 |
| 04. Dashboard Landing Page | 2/2 | Complete | 2026-02-08 |
| 05. Phase Detail View | 2/2 | Complete | 2026-02-08 |
| 06. Roadmap Visualization | 1/1 | Complete | 2026-02-08 |
| 07. Commit History | 1/1 | Complete | 2026-02-08 |
| 08. Todo List and Detail | 2/2 | Complete | 2026-02-08 |
| 09. Todo Write Operations | 2/2 | Complete | 2026-02-08 |
| 10. File Watching and SSE | 2/2 | Complete | 2026-02-08 |
| 11. HTMX Dynamic Loading | 2/2 | Complete | 2026-02-08 |
| 12. Polish and Hardening | 2/2 | Complete | 2026-02-08 |
| 13. Extract & Deduplicate | 8/8 | Complete | 2026-02-09 |
| 14. Reference Architecture & GSD Parity | 6/6 | Complete | 2026-02-09 |
| 15. Gate Check Upgrades | 2/2 | Built | 2026-02-10 |
| 16. Config & Routing Upgrades | 0/3 | Planned | — |
| 17. Discussion & Discovery Upgrades | 0/? | Not Started | — |
| 18. Reference Docs & Testing | 0/? | Not Started | — |
| 19. Rich Hook Matchers | 0/? | Not Started | — |
| 20. Auto-Format Hooks | 0/? | Not Started | — |
| 21. Proactive Compaction Hook | 0/? | Not Started | — |
| 22. Doc File Creation Blocker | 0/? | Not Started | — |
| 23. Async Hooks | 0/? | Not Started | — |
| 24. JSON Schemas | 0/? | Not Started | — |
| 25. Atomic File Writes | 0/? | Not Started | — |
| 26. CI Improvements | 0/? | Not Started | — |
| 27. Hook Spawn Testing | 0/? | Not Started | — |
| 28. Iterative Retrieval Pattern | 0/? | Not Started | — |
| 29. Contexts & Mode Switching | 0/? | Not Started | — |
| 30. Eval-Driven Development | 0/? | Not Started | — |
| 31. Plugin Manifest Knowledge | 0/? | Not Started | — |
| 32. Installation Wizard | 0/? | Not Started | — |
| 33. Instinct Learning Research | 0/? | Not Started | — |
| 34. Multi-Model Orchestration Research | 0/? | Not Started | — |

---

## Milestone: Plugin Context Optimization

**Goal:** Reduce context pressure in Towline's plugin by extracting ~2,400 lines of inline content from SKILL.md files and agent definitions into external template/reference files, then consolidate scattered cross-cutting docs and achieve structural parity with GSD's reference architecture.
**Phases:** 13 - 14
**Source:** Todo 006 (context optimization audit, 2026-02-09)

### Phase 13: Extract & Deduplicate
**Goal**: Mechanically extract ~1,900 lines of inline templates and prompt templates from SKILL.md files and agent definitions into external files, updating all references to lazy-load via Read
**Depends on**: None (standalone — operates on plugin source, not dashboard)
**Requirements**: Context budget reduction, no functional changes
**Success Criteria**:
  1. No SKILL.md file contains inline templates >20 lines
  2. No agent definition contains document format templates (use shared templates/)
  3. Skill-local `templates/` directories created for plan, review, begin, debug, discuss, pause, milestone
  4. Shared `templates/codebase/` created with 8 output templates (deduplicated between scan skill and codebase-mapper agent)
  5. All SKILL.md files use explicit `Read` calls for templates instead of inline content
  6. All existing tests pass after extraction
  7. Net reduction of ~1,900 lines from SKILL.md + agent definitions

### Phase 14: Reference Architecture & GSD Parity
**Goal**: Consolidate 7 scattered reference docs into a `references/` directory, create new templates and reference docs for GSD structural parity
**Depends on**: Phase 13 (references may point to extracted templates)
**Requirements**: Structural parity with GSD references/templates architecture
**Success Criteria**:
  1. `references/` directory exists with consolidated cross-cutting docs (continuation-format, verification-patterns, ui-formatting, questioning, commit-conventions, deviation-rules, plan-format)
  2. All SKILL.md and agent cross-references updated to point to `references/`
  3. `templates/research/` created with 5 research project output templates
  4. New top-level templates created: DEBUG.md.tmpl, UAT.md.tmpl, discovery.md.tmpl, milestone-archive.md.tmpl, milestone.md.tmpl, continue-here.md.tmpl
  5. New reference docs written: checkpoints.md, git-integration.md, model-profiles.md, planning-config.md
  6. No orphaned files remain in skill subdirectories
  7. All existing tests pass

---

## Milestone: AskUserQuestion UI Upgrade

**Goal:** Replace plain-text gate checks and interactive prompts across all skills with Claude Code's AskUserQuestion tool. Currently skills output text like "Type approved" and wait for freeform input. AskUserQuestion provides structured UI with labeled options, multi-select, and descriptions — dramatically better UX.
**Phases:** 15 - 18
**Source:** Todo 057 (AskUserQuestion UI upgrade, 2026-02-10)

### Phase 15: Gate Check Upgrades
**Goal**: Replace approve/revise/abort gate checks in 6 skills (plan, build, review, import, milestone, scan) with AskUserQuestion structured prompts
**Depends on**: None (standalone — operates on plugin source)
**Skills affected**: plan, build, review, import, milestone, scan
**Success Criteria**:
  1. All `confirm_plan`, `confirm_execute`, `confirm_transition` gate checks use AskUserQuestion with Approve/Revise/Abort options
  2. Plan approval in `/dev:plan` uses AskUserQuestion instead of freeform text
  3. Build confirmation in `/dev:build` uses AskUserQuestion instead of freeform text
  4. Review walkthrough decisions use AskUserQuestion for pass/fail/revise
  5. Import conflict resolution uses AskUserQuestion for resolution choices
  6. Milestone transitions (complete, archive) use AskUserQuestion
  7. All existing tests pass after changes

### Phase 16: Config & Routing Upgrades
**Goal**: Replace settings menus and "what next" routing decisions in 5 skills (config, status, continue, resume, quick) with AskUserQuestion
**Depends on**: Phase 15 (establishes the pattern)
**Skills affected**: config, status, continue, resume, quick
**Success Criteria**:
  1. `/dev:config` settings selection uses AskUserQuestion with category options
  2. `/dev:config` toggle and model changes use AskUserQuestion
  3. `/dev:status` "what to do next" routing uses AskUserQuestion with suggested actions
  4. `/dev:continue` auto-routing confirmation uses AskUserQuestion when ambiguous
  5. `/dev:resume` session selection uses AskUserQuestion when multiple pause points exist
  6. `/dev:quick` scope confirmation uses AskUserQuestion
  7. All existing tests pass after changes

### Phase 17: Discussion & Discovery Upgrades
**Goal**: Replace multi-option questioning in 4 skills (begin, discuss, explore, debug) with AskUserQuestion for structured decision capture
**Depends on**: Phase 16 (pattern fully established)
**Skills affected**: begin, discuss, explore, debug
**Success Criteria**:
  1. `/dev:begin` depth selection uses AskUserQuestion (quick/standard/comprehensive)
  2. `/dev:begin` project type and technology choices use AskUserQuestion where applicable
  3. `/dev:discuss` topic routing uses AskUserQuestion for multi-option decisions
  4. `/dev:explore` routing decisions (note/todo/plan) use AskUserQuestion
  5. `/dev:debug` hypothesis selection and retry/skip/abort use AskUserQuestion
  6. Freeform inputs remain as plain text (not forced into AskUserQuestion)
  7. All existing tests pass after changes

### Phase 18: Reference Docs & Testing
**Goal**: Update reference docs, add tests for AskUserQuestion patterns, ensure cross-cutting consistency
**Depends on**: Phase 17 (all skill changes complete)
**Success Criteria**:
  1. `references/towline-rules.md` updated with AskUserQuestion usage rules
  2. `references/ui-formatting.md` updated with AskUserQuestion patterns and examples
  3. DEVELOPMENT-GUIDE.md updated to document AskUserQuestion conventions
  4. Test coverage added for AskUserQuestion pattern validation (no freeform gate checks remain)
  5. All 20 skills audited for consistency — no missed opportunities
  6. All existing tests pass

---

## Milestone: Hook System Modernization

**Goal:** Make Towline's hook system smarter, more efficient, and non-blocking. Replace wildcard matchers with expression-based filtering, add code-quality hooks, proactive compaction, doc-sprawl prevention, and async execution for non-critical hooks.
**Phases:** 19 - 23
**Source:** ECC review (todos 058, 059, 060, 069, 070), 2026-02-10

### Phase 19: Rich Hook Matchers
**Goal**: Refactor hooks.json from wildcard `*` matchers to expression-based matchers (`tool == "Bash" && tool_input.command matches "(pattern)"`) so hooks only fire when relevant
**Depends on**: None (standalone)
**Source Todo**: 058-rich-hook-matchers
**Success Criteria**:
  1. All PreToolUse hooks in hooks.json use expression-based `tool_name` matchers instead of `*`
  2. All PostToolUse hooks use expression-based matchers targeting specific tools (Write, Edit)
  3. Hook scripts no longer need internal tool-name filtering logic (removed)
  4. All existing tests pass — no behavioral changes
  5. Measured reduction in unnecessary hook script invocations

### Phase 20: Auto-Format Hooks
**Goal**: Add opt-in PostToolUse hooks that run Prettier, tsc type-check, and console.log detection on modified files
**Depends on**: Phase 19 (rich matchers needed for efficient triggering)
**Source Todo**: 059-postuse-autoformat-hooks
**Success Criteria**:
  1. New PostToolUse hook runs Prettier on written/edited files when `hooks.autoFormat` is enabled
  2. New PostToolUse hook runs tsc type-check when `hooks.typeCheck` is enabled and tsconfig.json exists
  3. New PostToolUse hook detects leftover console.log statements when `hooks.detectConsoleLogs` is enabled
  4. All three hooks are opt-in via config.json toggles (default: off)
  5. Hooks use rich matchers to target only Write/Edit on .ts/.tsx/.js/.jsx files

### Phase 21: Proactive Compaction Hook
**Goal**: New PreToolUse hook that counts tool calls per session and suggests `/compact` when approaching configurable threshold
**Depends on**: Phase 19 (rich matchers for efficient triggering)
**Source Todo**: 060-proactive-compaction-hook
**Success Criteria**:
  1. New `suggest-compact.js` script tracks tool call count per session
  2. Threshold is configurable via `hooks.compactThreshold` in config.json (default: 50)
  3. At threshold, hook outputs a non-blocking suggestion (does not block the tool call)
  4. Counter resets on session start
  5. Works alongside existing context-budget-check.js without conflict

### Phase 22: Doc File Creation Blocker
**Goal**: PreToolUse hook that blocks creation of random .md/.txt files outside an allowlist, preventing doc sprawl during builds
**Depends on**: Phase 19 (rich matchers)
**Source Todo**: 069-doc-file-creation-blocker
**Success Criteria**:
  1. New PreToolUse hook blocks Write tool on `.md`/`.txt` files outside allowlist
  2. Allowlist includes: README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, .planning/**
  3. Block returns exit code 2 with helpful error message
  4. Controlled by `hooks.blockDocSprawl` config toggle (default: off)

### Phase 23: Async Hooks
**Goal**: Research and apply async execution for non-blocking hooks (log-subagent.js, session-cleanup.js)
**Depends on**: None (independent research)
**Source Todo**: 070-async-hooks
**Success Criteria**:
  1. Research complete on which hooks benefit from `"async": true, "timeout": 30`
  2. hooks.json updated with async flag where appropriate
  3. Verified no race conditions with async execution
  4. Tested on Windows, macOS, and Linux

---

## Milestone: Reliability & Quality Infrastructure

**Goal:** Add formal contracts, crash safety, better CI, and more realistic test coverage. No user-facing features — pure engineering quality.
**Phases:** 24 - 27
**Source:** ECC review (todos 063, 064, 067, 068), 2026-02-10

### Phase 24: JSON Schemas
**Goal**: Create formal JSON schemas for config.json and hooks.json with `$schema` references enabling IDE autocompletion and CI validation
**Depends on**: None (standalone)
**Source Todo**: 063-json-schemas
**Success Criteria**:
  1. `schemas/config.schema.json` validates all config.json fields, types, and defaults
  2. `schemas/hooks.schema.json` validates hooks.json structure and matcher expressions
  3. config.json and hooks.json include `$schema` references
  4. CI step validates both files against schemas
  5. IDE autocompletion works in VS Code when editing config.json

### Phase 25: Atomic File Writes
**Goal**: Add `atomicWrite()` utility to towline-tools.js that uses write-to-temp + rename + backup/restore for crash-safe file operations
**Depends on**: None (standalone)
**Source Todo**: 064-atomic-file-writes
**Success Criteria**:
  1. New `atomicWrite(filePath, content)` function in towline-tools.js
  2. Writes to temp file first, then renames to target (atomic on most filesystems)
  3. Creates `.bak` backup before overwrite, restores on failure
  4. All STATE.md, config.json, and ROADMAP.md writes in hook scripts use atomicWrite()
  5. Cross-platform tests pass (Windows and POSIX rename semantics differ)

### Phase 26: CI Improvements
**Goal**: Add markdownlint, release workflow, maintenance automation, and CLAUDE_PLUGIN_ROOT path verification test
**Depends on**: None (standalone)
**Source Todo**: 067-ci-improvements
**Success Criteria**:
  1. Markdownlint added to CI pipeline for .planning/ and references/ markdown files
  2. Release workflow automates version tagging and changelog generation
  3. Test added that verifies all hooks.json script paths resolve with ${CLAUDE_PLUGIN_ROOT}
  4. All existing CI checks continue to pass

### Phase 27: Hook Spawn Testing
**Goal**: Add integration tests that spawn hook scripts as real child processes with simulated stdin, complementing existing mock-based tests
**Depends on**: None (standalone)
**Source Todo**: 068-hook-spawn-testing
**Success Criteria**:
  1. Test helper spawns hook scripts via `child_process.spawn()` with JSON stdin
  2. Tests validate actual stdout/stderr output and exit codes
  3. At least validate-commit.js and check-plan-format.js have spawn-based tests
  4. Tests work cross-platform (Windows and POSIX)
  5. Spawn tests run alongside existing mock tests in CI

---

## Milestone: Agent Intelligence Upgrade

**Goal:** Make Towline's agents smarter and more adaptive. Upgrade the researcher with iterative retrieval, add lightweight behavioral profiles, and explore formal metrics for verification.
**Phases:** 28 - 30
**Source:** ECC review (todos 061, 065, 066), 2026-02-10

### Phase 28: Iterative Retrieval Pattern
**Goal**: Upgrade towline-researcher agent prompt with a 4-phase DISPATCH/EVALUATE/REFINE/LOOP protocol (max 3 cycles) for more thorough context gathering
**Depends on**: None (standalone)
**Source Todo**: 061-iterative-retrieval-pattern
**Success Criteria**:
  1. towline-researcher.md agent prompt includes DISPATCH → EVALUATE → REFINE → LOOP protocol
  2. Max 3 refinement cycles before finalizing results
  3. Each cycle evaluates coverage gaps and adjusts search strategy
  4. Researcher outputs include confidence indicators for coverage completeness
  5. No regression in existing research workflows

### Phase 29: Contexts & Mode Switching
**Goal**: Create lightweight dev/research/review context files that change Claude's behavioral approach without full skill invocation
**Depends on**: None (standalone)
**Source Todo**: 065-contexts-mode-switching
**Success Criteria**:
  1. Context files created: `contexts/dev.md`, `contexts/research.md`, `contexts/review.md`
  2. Each context defines behavioral profile (verbosity, risk tolerance, tool preferences)
  3. Skills can reference context files to set agent behavioral tone
  4. Documentation explains when to use each context

### Phase 30: Eval-Driven Development
**Goal**: Research pass@k (at least 1 of k succeeds) and pass^k (all k must succeed) metrics for strengthening Towline's verification system
**Depends on**: None (standalone, research phase)
**Source Todo**: 066-eval-driven-development
**Success Criteria**:
  1. Research document explaining pass@k and pass^k metrics
  2. Assessment of how metrics could improve towline-verifier's assessment methodology
  3. Recommendation on whether to adopt, defer, or reject
  4. If adopted: design doc for integration into verification workflow

---

## Milestone: Developer Experience

**Goal:** Make Towline easier for new users and ready for the plugin marketplace. Guided onboarding and publishing documentation.
**Phases:** 31 - 32
**Source:** ECC review (todos 062, 071), 2026-02-10

### Phase 31: Plugin Manifest Knowledge
**Goal**: Document undocumented plugin validator constraints discovered from ECC review for marketplace publishing readiness
**Depends on**: None (standalone)
**Source Todo**: 062-plugin-manifest-knowledge
**Success Criteria**:
  1. DEVELOPMENT-GUIDE.md updated with plugin validator constraints
  2. Documented: agents need explicit file paths (not directories)
  3. Documented: hooks must NOT be in plugin.json (auto-loaded from hooks/)
  4. Documented: all fields must be arrays, version is mandatory
  5. CI test validates plugin.json against documented constraints

### Phase 32: Installation Wizard
**Goal**: Interactive onboarding skill (`/dev:setup` or enhanced `/dev:config`) using AskUserQuestion for step-by-step first-run configuration
**Depends on**: Phase 18 (AskUserQuestion patterns established)
**Source Todo**: 071-installation-wizard
**Success Criteria**:
  1. New skill guides users through Towline setup step-by-step
  2. Step 1: Detect .planning/ existence, offer to initialize
  3. Step 2: Configure model preferences (quality/balanced/budget)
  4. Step 3: Configure workflow toggles (gates, auto-continue, etc.)
  5. Step 4: Verify hook installation
  6. Step 5: Run `/dev:health` to confirm everything works
  7. Works for both fresh installs and existing projects

---

## Milestone: Future Research

**Goal:** Exploratory research into advanced capabilities. Deliverable is a recommendation document, not code. No implementation commitment.
**Phases:** 33 - 34
**Source:** ECC review (todos 072, 073), 2026-02-10

### Phase 33: Instinct Learning Research
**Goal**: Research whether an instinct-based continuous learning system (inspired by ECC's continuous-learning-v2) would add value to Towline
**Depends on**: None (standalone research)
**Source Todo**: 072-instinct-learning-system
**Success Criteria**:
  1. Research document covering: minimal instinct system design, learnable patterns (commit conventions, file organization, test patterns), cost/benefit analysis
  2. Assessment of whether instincts could piggyback on existing hooks
  3. Clear recommendation: adopt, defer, or reject

### Phase 34: Multi-Model Orchestration Research
**Goal**: Research multi-model orchestration patterns (Codex for backend, Gemini for frontend, Claude as orchestrator) for potential future Towline capabilities
**Depends on**: None (standalone research)
**Source Todo**: 073-multi-model-orchestration
**Success Criteria**:
  1. Research document covering: which Towline workflows would benefit, trust-routing in Towline's phase system, cost/latency impact
  2. Assessment of "dirty prototype refactoring" pattern applicability
  3. Clear recommendation on if/when to pursue
