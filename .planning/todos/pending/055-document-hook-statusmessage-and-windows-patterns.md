---
title: "Document hook statusMessage field and Windows retry patterns"
status: pending
priority: P3
source: dev-guide-review-pass-2
created: 2026-02-10
theme: documentation
---

## Goal

Two undocumented patterns found in the codebase:

1. **Hook `statusMessage` field**: All 8 hook configurations in `hooks.json` have a `statusMessage` field that's never explained in the development guide. Contributors adding new hooks won't know what it does or how to write good status messages.

2. **Windows file deletion retry pattern**: `auto-continue.js` (lines 46-50) implements a retry loop for file deletion to handle Windows antivirus/indexer locks. This is a real production pattern that should be documented as a best practice for any hook that deletes files.

## Changes

1. **`references/DEVELOPMENT-GUIDE.md`** — In Hook Development Rules section, add:
   - `statusMessage` field documentation (what it is, when shown, best practices)
   - Windows file deletion retry pattern as a recommended practice

2. **Consider adding** checkpoint manifest lifecycle to State Transitions section (`.checkpoint-manifest.json` is used by build skill but not documented in state transition diagrams)

## Acceptance Criteria

- [ ] statusMessage field explained in hook development section
- [ ] Windows retry pattern documented as best practice
- [ ] Checkpoint manifest mentioned in state transitions
