---
title: Create a lightweight towline-general agent
status: done
priority: P2
source: dogfood-testing
created: 2026-02-07
---

## Problem

SKILL.md files currently use `subagent_type: "general-purpose"` (the built-in Claude Code agent) when delegating work, then compensate by inlining 400+ line specialized agent definitions into the prompt. This wastes main context and is fragile.

The immediate fix is to use correct specialized types (`dev:towline-researcher`, etc.) where they exist. But some delegation tasks don't fit any of the 9 specialized roles — ad-hoc tasks in `/dev:quick`, simple file operations, or edge cases.

## Proposal

Create `agents/towline-general.md` as a lightweight agent that carries:
- Knowledge of `.planning/` directory structure and file formats
- Commit format rules and conventions
- Towline workflow awareness (phases, plans, state tracking)
- NO specialized methodology (no research hierarchy, no goal-backward verification)

Register as `dev:towline-general` subagent type.

## Use Cases

- `/dev:quick` ad-hoc task delegation
- Simple file generation or formatting tasks
- Any skill that needs to delegate without a perfect specialized agent match
- Fallback when a specialized agent would be overkill

## Impact

Eliminates the need to ever use raw `"general-purpose"` with inlined definitions. Every Towline delegation gets at least baseline project context.
