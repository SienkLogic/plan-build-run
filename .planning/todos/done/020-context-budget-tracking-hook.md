---
title: "Add PostToolUse hook on Read to track context budget"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

No automatic tracking exists for how much the orchestrator reads. A PostToolUse hook on Read can warn when cumulative reads in a single skill invocation exceed a threshold.

## Implementation

New script: `plugins/dev/scripts/track-context-budget.js`
- Maintain session-scoped counter in `.planning/.context-tracker`
- Track: `{ skill, reads, total_chars, files[] }`
- Warn at >15 reads or >30k chars via `additionalContext`
- Reset on SessionStart or when `.active-skill` changes

Register in hooks.json:
```json
{
  "matcher": "Read",
  "hooks": [{
    "type": "command",
    "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/track-context-budget.js"
  }]
}
```

## Acceptance Criteria

- [ ] Hook fires on every Read and tracks cumulative usage
- [ ] Warning injected when thresholds exceeded
- [ ] Counter resets between skill invocations
- [ ] Test file created
- [ ] Doesn't slow down Read calls noticeably (<50ms)
