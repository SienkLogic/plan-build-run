---
title: "Block AI co-author lines in validate-commit.js"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: hook-hardening
---

## Goal

MEMORY.md says "NEVER add AI co-author to commits" but the hook doesn't enforce it. Scan commit messages for `Co-Authored-By: Claude` or similar AI patterns and block.

## Changes

1. **`plugins/dev/scripts/validate-commit.js`** — Add check in `main()` after format validation: scan full commit message (including heredoc body) for AI co-author patterns
2. **`tests/validate-commit.test.js`** — Add test cases for blocked co-author lines

## Patterns to Block

- `Co-Authored-By: Claude`
- `Co-Authored-By:.*Anthropic`
- `Co-Authored-By:.*noreply@anthropic.com`

## Acceptance Criteria

- [ ] Commits with AI co-author lines are blocked (exit 2)
- [ ] Normal co-author lines (human contributors) pass through
- [ ] Tests cover all blocked patterns
