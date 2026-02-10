---
title: "Create comprehensive Towline development guide"
status: pending
priority: P1
source: user-request
created: 2026-02-10
---

## Goal

Put together a comprehensive list of things that need to be considered when developing for Towline itself. This will serve as a guide for all developers (human and AI) working on the Towline codebase.

## Scope

### Part 1: Towline Workflow Documentation

Document the complete Towline workflow end-to-end so we can verify it's correct and nothing is missed:
- **Full lifecycle map**: begin -> plan -> build -> review -> milestone, with all branching paths (quick, debug, continue, resume, pause, etc.)
- **Skill invocation graph**: which skills can call which other skills, and under what conditions
- **Agent spawning map**: which skills spawn which agents, what data flows between them
- **State transitions**: how STATE.md, ROADMAP.md, config.json, PLAN.md, SUMMARY.md, and VERIFICATION.md evolve through each workflow stage
- **Hook firing sequence**: which hooks fire at each stage and what they enforce/inject
- **Decision points**: where the workflow branches based on config toggles, user input, or gate checks
- **Data flow diagram**: what files each skill reads, writes, and passes to agents — the full artifact pipeline
- **Error paths**: what happens when an executor fails, a gate blocks, verification rejects, etc.

This is the foundation — if the workflow itself has gaps or inconsistencies, everything else built on top will inherit those problems.

### Part 2: Development Conventions

This guide should also cover:
- Project conventions (commit format, file naming, directory structure)
- Hook development rules (CommonJS, cross-platform paths, logHook(), exit codes)
- Skill authoring patterns (frontmatter, Context Budget sections, gate checks, anti-patterns)
- Agent authoring patterns (frontmatter, subagent_type auto-loading, never inline definitions)
- Template conventions (EJS-style .tmpl files, variable naming)
- Testing requirements (Jest, fixture project, test file naming mirrors script names)
- Context budget discipline (what belongs in main context vs delegated to agents)
- State management (STATE.md as source of truth, config.json settings)
- Cross-platform compatibility (path.join(), no hardcoded separators, Node 18/20/22)
- CI requirements (Windows, macOS, Linux must all pass)
- What NOT to do (common mistakes, anti-patterns observed during dogfooding)

## Deliverable

A comprehensive document that will later be condensed into a concise set of rules for CLAUDE.md or a dedicated development reference file.

## Acceptance Criteria

- [ ] Complete workflow map covering every skill, agent, hook, and state transition
- [ ] Workflow verified against actual skill files — no missing paths or dead ends
- [ ] Covers all major development convention areas listed above
- [ ] Includes concrete examples (good and bad) for each convention
- [ ] References specific files as pattern sources
- [ ] Reviewed against existing CLAUDE.md to avoid duplication
- [ ] Can be condensed into actionable rules for daily development
