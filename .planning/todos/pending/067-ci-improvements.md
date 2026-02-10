---
title: "CI improvements: markdownlint, maintenance workflow, release workflow"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: ci
---

## Goal

Add CI improvements inspired by ECC's workflow setup.

## Context

ECC has several CI patterns Towline lacks:
1. Markdownlint on all agent/skill/command markdown files
2. Release workflow with plugin.json version-tag verification
3. Scheduled maintenance workflow (weekly deps check, security audit, stale issues)
4. `${CLAUDE_PLUGIN_ROOT}` path verification test (ensures no hardcoded paths in hooks.json)

## Scope

- Add markdownlint to CI (lint agents/*.md, skills/**/SKILL.md, references/*.md)
- Add `.markdownlint.json` config
- Add release workflow (tag-based, version verification)
- Add maintenance workflow (weekly cron: npm outdated, npm audit, stale issues)
- Add test that verifies all hooks.json script paths use `${CLAUDE_PLUGIN_ROOT}`

## Acceptance Criteria

- [ ] Markdownlint runs in CI and passes
- [ ] Release workflow creates GitHub releases on tag push
- [ ] Maintenance workflow runs weekly
- [ ] Hook path test catches hardcoded paths
