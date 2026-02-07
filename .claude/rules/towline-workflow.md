---
paths:
  - ".planning/**"
---

# Towline Workflow Rules

When a `.planning/` directory exists, this is a Towline-managed project. Follow these rules:

## Context Awareness

- Check `.planning/STATE.md` for current project context before starting work
- Read `.planning/config.json` for workflow preferences
- Respect phase boundaries — don't work on Phase 4 code when Phase 2 is in progress

## Commit Discipline

- Prefer atomic commits per logical change
- Follow the commit format: `{type}({phase}-{plan}): {description}`
- Valid types: feat, fix, refactor, test, docs, chore

## Workflow Discipline

- When asked to implement multi-step changes, suggest `/dev:plan` before diving in
- When asked to fix bugs, suggest `/dev:debug` for systematic investigation
- When asked about project status, suggest `/dev:status`
- When starting a new session, suggest `/dev:resume` if paused work exists

## Planning Integrity

- Do not modify files in `.planning/phases/` directly — use `/dev:plan` and `/dev:build`
- Do not skip verification — use `/dev:review` after building
- Respect locked decisions in CONTEXT.md files
- Do not implement deferred ideas from CONTEXT.md
