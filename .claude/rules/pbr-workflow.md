---
paths:
  - ".planning/**"
---

# Plan-Build-Run Workflow Rules

When a `.planning/` directory exists, this is a Plan-Build-Run-managed project. Follow these rules:

## Context Awareness

- Check `.planning/STATE.md` for current project context before starting work
- Read `.planning/config.json` for workflow preferences
- Respect phase boundaries — don't work on Phase 4 code when Phase 2 is in progress

## Context Budget Management

Context is your scarcest resource. Protect it:

- **Delegate heavy work** to Task() subagents — never analyze, research, or build in the main context
- **Never read agent definitions** (agents/*.md) — subagent_type auto-loads them
- **Read summaries, not full files** — when checking subagent results, read only frontmatter or first 20 lines
- **Proactive session boundaries**: When you sense context is getting heavy (long conversation, many tool calls, large file reads), proactively tell the user:
  - "Context is getting full. I recommend running `/pbr:pause` now so we can resume fresh."
  - Do this BEFORE hitting the limit — once context is compacted, details are lost
- **After compaction**: If the conversation was auto-compacted, immediately read STATE.md to reorient
- **One phase per session** is a good rule of thumb for complex work

## Commit Discipline

- Prefer atomic commits per logical change
- Follow the commit format: `{type}({phase}-{plan}): {description}`
- Valid types: feat, fix, refactor, test, docs, chore

## Workflow Discipline

- When asked to implement multi-step changes, suggest `/pbr:plan` before diving in
- When asked to fix bugs, suggest `/pbr:debug` for systematic investigation
- When asked about project status, suggest `/pbr:status`
- When starting a new session, suggest `/pbr:resume` if paused work exists

## Planning Integrity

- Do not modify files in `.planning/phases/` directly — use `/pbr:plan` and `/pbr:build`
- Do not skip verification — use `/pbr:review` after building
- Respect locked decisions in CONTEXT.md files
- Do not implement deferred ideas from CONTEXT.md
