---
title: "Fix 6 factual errors in DEVELOPMENT-GUIDE.md"
status: pending
priority: P1
source: dev-guide-review-pass-2
created: 2026-02-10
theme: documentation
---

## Goal

Second-pass review found 6 factual errors in the development guide. These will mislead contributors.

## Changes

1. **Line ~420 (Agent Spawning Map)**: `/dev:build` does NOT spawn integration-checker. Integration-checker is spawned by `/dev:milestone audit`. Move it to the correct row.

2. **Line ~432 (Agent Spawning Map)**: `/dev:quick` spawns `towline-executor`, NOT `towline-general`. Fix agent name.

3. **Line ~430 (Agent Spawning Map)**: `/dev:debug` writes to `.planning/debug/{NNN}-{slug}.md`, NOT `.planning/DEBUG.md`. Fix output path.

4. **Line ~1215**: Says "20 skills total" but there are 21 skill directories. Update count and identify the missing skill in the documentation.

5. **Lines ~2212-2220, ~2550**: Claims coverage threshold of 70% is "enforced by CI" — it is NOT enforced. CI runs `npm test` without `--coverage` flag. Current coverage is ~67%. Correct to say "target" not "enforced" (until todo 040 is implemented).

6. **RECON.md reference**: Guide says `/dev:scan` writes 8 output files including RECON.md, but only 7 codebase templates exist (no RECON.md.tmpl). Either create the template or fix the count and remove RECON.md from the list.

## Acceptance Criteria

- [ ] All 6 errors corrected
- [ ] Agent spawning map matches actual skill source code
- [ ] Skill count matches actual directory count
- [ ] Coverage claims are accurate
