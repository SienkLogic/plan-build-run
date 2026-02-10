---
title: "Extract verifier stub-detection patterns to reference file"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: agent-improvement
---

## Goal

`towline-verifier.md` lines 420-527 contain 100+ lines of stub detection patterns consuming context in the verifier's window. Extract to a shared reference.

## Changes

1. **New file: `plugins/dev/references/stub-patterns.md`** — All stub detection patterns by technology
2. **`plugins/dev/agents/towline-verifier.md`** — Replace inline patterns with "Read `references/stub-patterns.md`"

## Acceptance Criteria

- [ ] Patterns extracted to reference file
- [ ] Verifier agent references the file
- [ ] Verifier still detects stubs correctly
