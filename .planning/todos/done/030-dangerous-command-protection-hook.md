---
title: "Add PreToolUse hook on Bash for dangerous command detection"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: hook-hardening
---

## Goal

Only `git commit` messages are validated. Destructive commands like `rm -rf .planning/` or `git reset --hard` pass through unchecked.

## Implementation

New script: `plugins/dev/scripts/check-dangerous-commands.js`
- Patterns to block: `rm -rf .planning`, `git reset --hard`, `git push --force` to main/master
- Patterns to warn: `git clean`, large `rm` operations
- Register alongside validate-commit.js for Bash matcher

## Acceptance Criteria

- [ ] Destructive .planning/ operations blocked
- [ ] Dangerous git operations blocked
- [ ] Non-dangerous commands pass through
- [ ] Test file created
