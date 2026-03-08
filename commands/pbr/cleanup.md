---
name: gsd:cleanup
description: Archive accumulated phase directories from completed milestones
---
<objective>
Archive phase directories from completed milestones into `.planning/milestones/v{X.Y}-phases/`.

Use when `.planning/phases/` has accumulated directories from past milestones.
</objective>

<execution_context>
@~/.claude/plan-build-run/workflows/cleanup.md
</execution_context>

<process>
Follow the cleanup workflow at @~/.claude/plan-build-run/workflows/cleanup.md.
Identify completed milestones, show a dry-run summary, and archive on confirmation.
</process>
