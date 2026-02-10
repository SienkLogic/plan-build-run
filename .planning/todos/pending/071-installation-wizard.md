---
title: "Create interactive installation/onboarding wizard skill"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: ux
---

## Goal

Create an interactive onboarding skill that guides new users through Towline setup using AskUserQuestion for step-by-step configuration.

## Context

ECC's `configure-ecc` skill provides guided setup with:
- User-level vs project-level installation choice
- Selective component installation
- Post-installation verification
- Optimization for the user's tech stack

Towline has `/dev:config` for settings but no guided first-run experience.

## Scope

- New skill: `/dev:setup` or enhance existing `/dev:config`
- Step 1: Detect if .planning/ exists, offer to initialize
- Step 2: Configure model preferences (quality/balanced/budget)
- Step 3: Configure workflow toggles (gates, auto-continue, etc.)
- Step 4: Verify hook installation
- Step 5: Run `/dev:health` to confirm everything works
- Use AskUserQuestion for each step

## Acceptance Criteria

- [ ] New users can configure Towline by following the wizard
- [ ] Each step uses AskUserQuestion for clear choices
- [ ] Post-setup verification confirms everything works
- [ ] Works for both fresh installs and existing projects
