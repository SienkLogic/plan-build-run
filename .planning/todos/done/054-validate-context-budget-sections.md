---
title: "Add Context Budget section validation to plugin structure validator"
status: pending
priority: P2
source: dev-guide-review-pass-2
created: 2026-02-10
theme: quality
---

## Goal

The development guide states "Every skill MUST have a 'Context Budget' section" but only 6 of 21 skills actually have one. There's no automated enforcement — `validate-plugin-structure.js` doesn't check for this.

Two options:
1. **Add validation** — Require all skills to have `## Context Budget`
2. **Relax the requirement** — Only require it for skills that spawn agents (begin, build, plan, review, quick, import, milestone, scan, debug)

Option 2 is more practical — simple skills like `note`, `help`, `todo`, `config` don't spawn agents and don't need context budget guidance.

## Changes

1. **`plugins/dev/scripts/validate-plugin-structure.js`** — Add check:
   - Skills with `Task` in their `allowed-tools` MUST contain `## Context Budget` in SKILL.md
   - Skills without `Task` in `allowed-tools` are exempt

2. **Add `## Context Budget` sections** to skills that spawn agents but currently lack them:
   - milestone, scan, debug, continue (4 skills need sections added)

3. **Update DEVELOPMENT-GUIDE.md** — Clarify that Context Budget is required for agent-spawning skills, not all skills

## Acceptance Criteria

- [ ] validate-plugin-structure.js enforces Context Budget for agent-spawning skills
- [ ] All agent-spawning skills have Context Budget sections
- [ ] Guide accurately reflects the requirement scope
- [ ] `npm run validate` passes
