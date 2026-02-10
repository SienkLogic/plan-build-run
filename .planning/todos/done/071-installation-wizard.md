---
title: "Create interactive installation/onboarding wizard skill"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: ux
---

## Goal

Create an interactive onboarding skill that guides new users through Towline setup using AskUserQuestion for step-by-step configuration.

## What Was Done

1. Created `/dev:setup` skill (`skills/setup/SKILL.md`):
   - Step 1: Detect if .planning/ exists, offer to initialize
   - Step 2: Project type selection (greenfield/existing/prototype) with auto-config
   - Step 3: Model profile selection (balanced/quality/budget)
   - Step 4: Workflow feature selection (multi-select: auto-continue, TDD, strict gates, branching)
   - Step 5: Health verification
   - Handles both fresh installs and existing projects
2. Created command mapping (`commands/setup.md`)
3. Updated help skill with `/dev:setup` in project management table
4. Updated integration test for status-line.js to match new ANSI-colored output format
5. Validator detects 21 skills (was 20)

## Design Decisions

- Created `/dev:setup` as separate skill rather than enhancing `/dev:config` — config is for changing individual settings, setup is a guided journey
- Prototype project type auto-configures for lighter workflow (depth: quick, gates disabled)
- Model profiles match the existing `/dev:config model-profile` presets
- Default config.json uses all current schema defaults — setup creates a valid starting point
- No new scripts needed — this is purely a skill prompt using AskUserQuestion

## Acceptance Criteria

- [x] New users can configure Towline by following the wizard
- [x] Each step uses AskUserQuestion for clear choices
- [x] Post-setup verification confirms everything works
- [x] Works for both fresh installs and existing projects
