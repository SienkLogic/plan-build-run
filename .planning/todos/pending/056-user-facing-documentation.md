---
title: "Create user-facing documentation"
status: pending
priority: P2
source: session-review
created: 2026-02-10
theme: documentation
---

## Goal

Create user-facing documentation for people installing Towline and using `/dev:*` commands on their own projects. The internal DEVELOPMENT-GUIDE.md serves plugin developers but there's no guide for end users.

## Scope

From the v1 Build Plan `docs/` directory:

1. **Getting Started** — Install, configure, first project walkthrough
2. **CREATING_SKILLS.md** — Guide for adding new skills to the plugin
3. **CREATING_AGENTS.md** — Guide for adding or modifying agents
4. **WORKFLOW_REFERENCE.md** — End-user workflow reference (begin → plan → build → review → milestone)
5. **MIGRATION.md** — Upgrading between versions (if needed)

Also consider: CHANGELOG.md, CODE_OF_CONDUCT.md (from v1 plan).

## Acceptance Criteria

- [ ] Users can install Towline and start a project by following the docs alone
- [ ] Skill/agent creation guides include concrete examples
- [ ] Workflow reference covers all 20 commands with when-to-use guidance
