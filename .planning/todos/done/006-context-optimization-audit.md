---
title: Context optimization — extract inline content from skills and agents
status: done
promoted_to: "phases 13-14 (Plugin Context Optimization milestone)"
completed: 2026-02-09
priority: P1
source: gsd-comparison-audit
created: 2026-02-09
---

## Problem

Towline SKILL.md files and agent definitions contain ~2,400 lines of inline content (templates, prompt templates, reference tables, pattern libraries) that gets loaded into context even when the specific code path doesn't need it. This competes with project-specific context (STATE.md, ROADMAP.md, plans, code) and contributes to the known context budget pressure.

GSD solves this with dedicated `references/` and `templates/codebase/` directories. Towline should adopt a similar approach.

## Audit Summary

### SKILL.md files (20 files, 6,634 total lines)
- **~1,700 extractable lines** (26% of total content)
- Top 5 offenders by extractable content:
  1. `plan/SKILL.md` — 300 lines (48%) — subagent prompt templates
  2. `scan/SKILL.md` — 225 lines (37%) — 8 document format templates
  3. `review/SKILL.md` — 210 lines (35%) — verifier/debugger/gap-planner prompts
  4. `begin/SKILL.md` — 175 lines (34%) — researcher/synthesis/roadmap prompts
  5. `discuss/SKILL.md` — 115 lines (35%) — CONTEXT.md template + decision categories

### Agent definitions (10 files, 5,376 total lines)
- **~700 extractable lines** (13% of total content)
- Top offender: `towline-codebase-mapper.md` (894 lines) — contains 8 full document templates
- All agents use fully inline content — zero external file references
- Note: agents load into subagent context (not main), but oversized agents still waste subagent budget

### Possibly orphaned files
- `plan/deviation-rules.md` (112 lines) — not referenced in any SKILL.md
- `plan/plan-format.md` (254 lines) — not referenced in any SKILL.md
- `build/commit-conventions.md` (119 lines) — not referenced in build SKILL.md
- These may be referenced by agent definitions or loaded implicitly — needs verification

## Proposed Structure

### New: `references/` directory
Cross-cutting reference docs (inspired by GSD's `references/` folder):

**Extracted from existing inline content:**
- `stub-patterns.md` — extracted from towline-verifier agent (~150 lines)
- `tech-patterns/` — extracted from towline-integration-checker (~100 lines)

**Consolidated from scattered skill subdirs:**
- `continuation-format.md` — currently in `skills/build/` (212 lines), used across build/resume
- `verification-patterns.md` — currently in `skills/plan/` (198 lines), used across build/review
- `ui-formatting.md` — currently in `skills/shared/` (81 lines), cross-cutting
- `questioning.md` — currently in `skills/begin/` as questioning-guide.md (214 lines), reusable for discuss/explore
- `commit-conventions.md` — currently in `skills/build/` (119 lines), cross-cutting
- `deviation-rules.md` — currently in `skills/plan/` (112 lines), used by executor agents
- `plan-format.md` — currently in `skills/plan/` (254 lines), used by planner agents

**New reference docs (GSD has these, Towline doesn't):**
- `checkpoints.md` — checkpoint/restore protocol (pause/resume lack a reference spec)
- `git-integration.md` — broader git workflow conventions beyond just commit format
- `model-profiles.md` — model selection and profile resolution (currently inline in config skill)
- `planning-config.md` — config.json file specification (currently documented inline)
- `tdd.md` — test-driven development patterns (GSD has this; nice-to-have)

### New: `templates/codebase/` directory
Output templates for scan/mapper (extracted from scan skill + codebase-mapper agent):
- `RECON.md.tmpl`
- `STACK.md.tmpl`
- `INTEGRATIONS.md.tmpl`
- `ARCHITECTURE.md.tmpl`
- `STRUCTURE.md.tmpl`
- `CONVENTIONS.md.tmpl`
- `TESTING.md.tmpl`
- `CONCERNS.md.tmpl`

### New: `templates/research/` directory
Research project output templates (GSD has these in `templates/research-project/`):
- `ARCHITECTURE.md.tmpl`
- `FEATURES.md.tmpl`
- `PITFALLS.md.tmpl`
- `STACK.md.tmpl`
- `SUMMARY.md.tmpl`
Note: These currently exist as outputs in `.planning/research/` from the dogfood project but aren't formalized as plugin templates.

### New/expanded: Top-level `templates/` additions
Templates GSD has that Towline currently lacks or handles inline:
- `DEBUG.md.tmpl` — structured debug session output (GSD has this)
- `UAT.md.tmpl` — user acceptance testing session template (GSD has this)
- `discovery.md.tmpl` — discovery session output template (GSD has this)
- `milestone-archive.md.tmpl` — archived milestone format (GSD has this)
- `milestone.md.tmpl` — active milestone template (GSD has this)
- `continue-here.md.tmpl` — continuation handoff (extracted from pause skill inline)

### New: Skill-local `templates/` directories
Extract prompt templates from skills into skill-local template dirs:

**`skills/plan/templates/`**:
- `researcher-prompt.md`
- `synthesizer-prompt.md`
- `planner-prompt.md`
- `checker-prompt.md`
- `revision-prompt.md`

**`skills/review/templates/`**:
- `verifier-prompt.md`
- `debugger-prompt.md`
- `gap-planner-prompt.md`

**`skills/scan/templates/`** → points to shared `templates/codebase/`

**`skills/begin/templates/`** (already exists, extend):
- `researcher-prompt.md`
- `synthesizer-prompt.md`
- `roadmapper-prompt.md`

**`skills/debug/templates/`**:
- `debug-file.md.tmpl`
- `debugger-prompt.md`

**`skills/discuss/templates/`**:
- `CONTEXT.md.tmpl`
- `decision-categories.md`

**`skills/pause/templates/`**:
- `continue-here.md.tmpl`

**`skills/milestone/templates/`**:
- `audit-report.md.tmpl`
- `stats-file.md.tmpl`

## Implementation Phases

### Phase A — HIGH priority (saves ~735 lines from skills)
1. Extract plan/SKILL.md prompt templates → `skills/plan/templates/`
2. Extract scan/SKILL.md format templates → `templates/codebase/`
3. Extract review/SKILL.md prompt templates → `skills/review/templates/`
4. Update each SKILL.md to `Read` the template when needed instead of inlining

### Phase B — MEDIUM priority (saves ~480 lines from skills)
5. Extract begin/SKILL.md remaining prompts → `skills/begin/templates/`
6. Extract discuss/SKILL.md templates → `skills/discuss/templates/`
7. Extract debug/SKILL.md templates → `skills/debug/templates/`
8. Extract pause/SKILL.md continue-here template
9. Extract milestone/SKILL.md audit templates

### Phase C — Agent optimization (saves ~700 lines from agents)
10. Deduplicate codebase-mapper templates with `templates/codebase/` (share with scan)
11. Extract verifier stub-patterns to `references/stub-patterns.md`
12. Extract integration-checker tech patterns to `references/tech-patterns/`

### Phase D — Consolidate scattered references (saves context + improves discoverability)
13. Create `references/` directory
14. Move cross-cutting docs from skill subdirs into `references/`:
    - `skills/build/continuation-format.md` → `references/continuation-format.md`
    - `skills/plan/verification-patterns.md` → `references/verification-patterns.md`
    - `skills/shared/ui-formatting.md` → `references/ui-formatting.md`
    - `skills/begin/questioning-guide.md` → `references/questioning.md`
    - `skills/build/commit-conventions.md` → `references/commit-conventions.md`
    - `skills/plan/deviation-rules.md` → `references/deviation-rules.md`
    - `skills/plan/plan-format.md` → `references/plan-format.md`
15. Update all SKILL.md and agent references to point to new locations
16. Verify no broken references after consolidation

### Phase E — GSD parity: new templates and reference docs
17. Create `templates/research/` with research project output templates
18. Create new top-level templates: `DEBUG.md.tmpl`, `UAT.md.tmpl`, `discovery.md.tmpl`, `milestone-archive.md.tmpl`, `milestone.md.tmpl`
19. Write new reference docs: `checkpoints.md`, `git-integration.md`, `model-profiles.md`, `planning-config.md`
20. Optional: Write `references/tdd.md` (nice-to-have, low priority)

## Impact Estimate

- **Before**: ~12,010 lines across skills + agents
- **After Phase A**: ~11,275 lines (-735, 6% overall but 30-48% reduction in top 3 skills)
- **After Phase B**: ~10,795 lines (-1,215 cumulative)
- **After Phase C**: ~10,095 lines (-1,915 cumulative, 16% overall reduction)
- **After Phase D**: Net neutral on lines (moves, not deletes) but consolidation makes `references/` the single source of truth and eliminates duplication between scan skill + codebase-mapper agent
- **After Phase E**: Adds ~500 lines of new content, but as external files only loaded when needed
- **Key benefit**: Remaining SKILL.md/agent lines are flow-control logic (always needed). Extracted lines are templates/prompts (only loaded for specific code paths). New reference docs provide consistent cross-cutting documentation.

## GSD Comparison Checklist

Items from the GSD structural gap analysis that this todo addresses:

- [ ] `references/` folder with cross-cutting docs (GSD has 13; Towline target: ~12)
- [ ] `templates/codebase/` output templates (GSD has 7; Towline target: 8)
- [ ] `templates/research/` project templates (GSD has 5; Towline target: 5)
- [ ] `DEBUG.md` and `UAT.md` session templates
- [ ] Milestone lifecycle templates (`milestone.md`, `milestone-archive.md`)
- [ ] `discovery.md` template
- [ ] `continue-here.md` template (currently inline in pause skill)
- [ ] Scattered reference docs consolidated into `references/`
- [ ] New reference docs: checkpoints, git-integration, model-profiles, planning-config
- [ ] Optional: TDD reference doc

## Acceptance Criteria

- [ ] No SKILL.md file contains inline templates >20 lines
- [ ] No agent definition contains document format templates (use shared `templates/`)
- [ ] Cross-cutting references live in `references/` not scattered across skills
- [ ] All extracted files are explicitly `Read` by the code path that needs them
- [ ] Existing tests still pass
- [ ] Orphaned files resolved (referenced, relocated, or removed)
- [ ] GSD comparison checklist items complete (except optional TDD)
