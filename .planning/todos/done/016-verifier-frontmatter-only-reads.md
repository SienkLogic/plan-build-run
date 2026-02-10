---
title: "Verifier should read SUMMARY frontmatter only, not full bodies"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

The `/dev:build` Step 7 currently inlines full SUMMARY.md content into the verifier prompt. The verifier only needs frontmatter fields (status, key_files, commits) — it can read full bodies from disk in its own 200k context window.

## Impact

- Estimated 3,000-8,000 token savings per phase (15-40% of orchestrator context)
- Directly prevents the kind of context bloat that caused the 88% incident

## Changes

1. **`plugins/dev/skills/build/SKILL.md`** — Step 7 verifier prompt: change to inline only SUMMARY frontmatter, not full body
2. **`plugins/dev/skills/review/SKILL.md`** — Same pattern if applicable
3. Verify the verifier agent reads full SUMMARY bodies from disk when it needs detail

## Acceptance Criteria

- [ ] Build skill Step 7 only passes SUMMARY frontmatter to verifier prompt
- [ ] Verifier agent still produces correct VERIFICATION.md (reads full files from disk)
- [ ] All tests pass
