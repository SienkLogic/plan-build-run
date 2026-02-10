---
title: "Add PostToolUse hook on Task to validate subagent output"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: hook-hardening
---

## Goal

Skills trust that agents wrote expected files. No automatic verification exists. A PostToolUse hook on Task() can map agent types to expected outputs and warn if missing.

## Implementation

New script: `plugins/dev/scripts/check-subagent-output.js`
- Map agent types to expected outputs:
  - towline-executor → SUMMARY-{plan}.md
  - towline-planner → PLAN-{MM}.md
  - towline-verifier → VERIFICATION.md
  - towline-researcher → RESEARCH.md
- Check if expected files exist and have valid frontmatter
- Log to hooks.jsonl
- Return warning via additionalContext if missing

## Acceptance Criteria

- [ ] Hook fires after every Task() completion
- [ ] Missing expected outputs produce warnings
- [ ] Test file created
