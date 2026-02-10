---
title: "CI improvements: markdownlint, maintenance workflow"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: ci
---

## Goal

Add CI improvements inspired by ECC's workflow setup.

## What Was Done

1. Created `.markdownlint.json` config tuned for prompt-style markdown:
   - Disabled 13 rules that conflict with agent/skill prompt formatting
   - Rules still active: MD001, MD003, MD004, MD005, MD009, MD010, MD012, MD018, MD019, MD023, MD025, MD027, MD028, MD030, MD035, MD037, MD038, MD039, MD042, MD043, MD044, MD045, MD046, MD047, MD048, MD049, MD050, MD051, MD052, MD053, MD054, MD055, MD056
2. Added markdownlint step to CI lint job using `DavidAnson/markdownlint-cli2-action@v19`
   - Lints 67 files: agents/*.md, skills/**/SKILL.md, references/*.md, commands/*.md
3. Created `.github/workflows/maintenance.yml`:
   - Weekly cron (Monday 9am UTC) + manual trigger
   - Runs `npm outdated` and `npm audit --audit-level=moderate`
4. Pre-existing items verified:
   - Release workflow already exists (release.yml with tag-based triggers)
   - Hook path verification test already exists (schema-validation.test.js:101-113)

## Design Decisions

- No `markdownlint-cli2` devDependency — CI uses the GitHub Action which bundles its own binary
- Many rules disabled because prompt-style markdown (agent definitions, skill instructions) uses intentionally compact formatting: no blank lines around lists/headings/tables, bare URLs, trailing colons in headings, 4-space indentation, continuous numbered lists
- Maintenance workflow uses `|| true` to prevent failures from blocking — it's informational only
- Did not add stale issues bot — repo is single-developer, not needed

## Acceptance Criteria

- [x] Markdownlint runs in CI and passes (67 files, 0 errors)
- [x] Release workflow creates GitHub releases on tag push (pre-existing)
- [x] Maintenance workflow runs weekly
- [x] Hook path test catches hardcoded paths (pre-existing in schema-validation.test.js)
