---
title: "Add hook to block unnecessary documentation file creation"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: hooks
---

## Goal

Add a PreToolUse hook that blocks creation of random .md/.txt files (except known documentation files), preventing doc sprawl during builds.

## Context

ECC blocks Write on `.md`/`.txt` files unless they match known patterns (README.md, CLAUDE.md, AGENTS.md, CONTRIBUTING.md). This prevents Claude from creating unnecessary documentation files.

For Towline, the allowlist would include: README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, and anything under `.planning/`.

## Scope

- Add PreToolUse hook with Write matcher for `.md`/`.txt` files
- Allowlist: README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, .planning/**
- Block with helpful error message suggesting alternatives
- Opt-in via config toggle `hooks.blockDocSprawl`

## Acceptance Criteria

- [ ] Hook blocks random .md creation outside allowlist
- [ ] Allowlist includes all legitimate doc files
- [ ] .planning/ directory is always allowed
- [ ] Config toggle controls behavior
