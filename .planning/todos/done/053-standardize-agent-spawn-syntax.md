---
title: "Standardize agent spawning syntax across all skills"
status: pending
priority: P2
source: dev-guide-review-pass-2
created: 2026-02-10
theme: quality
---

## Goal

Skills use two different syntaxes to describe agent spawning:
- **Modern**: `subagent_type: "dev:towline-{name}"` (begin, plan, build, review, import)
- **Legacy**: `Task(towline-{name})` (debug, scan, milestone, quick)

The modern syntax makes it clear that agent definitions are auto-loaded by Claude Code. The legacy syntax is ambiguous. All skills should use consistent language.

## Changes

1. **Audit all 21 skills** — Identify which use legacy `Task(towline-{name})` phrasing
2. **Update to modern syntax** — Replace legacy references with `subagent_type: "dev:towline-{name}"` or equivalent clear phrasing
3. **Document convention** in DEVELOPMENT-GUIDE.md skill authoring section

## Note: This is a documentation/clarity change in SKILL.md files, not a code change. Claude Code interprets both correctly — this is about contributor understanding.

## Acceptance Criteria

- [ ] All skills use consistent agent spawning terminology
- [ ] Convention documented in development guide
- [ ] `npm run validate` passes
