# Phase Research: Reference Architecture & GSD Parity

> Research conducted: 2026-02-09
> Research date: 2026-02-09T00:00:00Z
> Mode: phase-research
> Phase: 14-reference-architecture-and-gsd-parity
> Confidence: HIGH
> Sources consulted: 23

## User Constraints

No CONTEXT.md found for this phase. This is a structural refactoring phase to consolidate scattered reference documentation and achieve parity with GSD v1.11.1 reference architecture.

## Phase Goal

Consolidate 7 scattered cross-cutting reference docs into a unified `references/` directory, update all cross-references, create missing templates for GSD structural parity, and ensure no orphaned reference files remain in skill subdirectories.

## Current State Analysis

### Scattered Reference Docs in Towline [S0]

Currently, cross-cutting reference documentation is scattered across skill subdirectories:

| Document | Current Location | Lines | Referenced By |
|----------|-----------------|-------|---------------|
| `continuation-format.md` | `skills/build/` | 213 | `skills/build/SKILL.md:446` |
| `verification-patterns.md` | `skills/plan/` | 199 | `skills/build/SKILL.md:538` |
| `ui-formatting.md` | `skills/shared/` | 82 | `skills/status/SKILL.md:188` |
| `questioning-guide.md` | `skills/begin/` | 215 | `skills/begin/SKILL.md:59` |
| `commit-conventions.md` | `skills/build/` | 120 | Not directly referenced (used by executors) |
| `deviation-rules.md` | `skills/plan/` | 113 | Not directly referenced (used by executors) |
| `plan-format.md` | `skills/plan/` | 255 | Referenced in `skills/quick/SKILL.md:86` |

**Total**: ~1,197 lines of cross-cutting reference content currently scattered [S0]

### Existing Templates [S0]

Top-level `templates/` directory currently contains:

```
templates/
├── codebase/                          # Created in Phase 13
│   ├── ARCHITECTURE.md.tmpl           # 3,533 bytes
│   ├── CONCERNS.md.tmpl               # 3,954 bytes
│   ├── CONVENTIONS.md.tmpl            # 3,117 bytes
│   ├── INTEGRATIONS.md.tmpl           # 2,576 bytes
│   ├── STACK.md.tmpl                  # 2,658 bytes
│   ├── STRUCTURE.md.tmpl              # 3,349 bytes
│   └── TESTING.md.tmpl                # 2,694 bytes
├── CONTEXT.md.tmpl                    # 1,634 bytes
├── INTEGRATION-REPORT.md.tmpl         # 4,980 bytes
├── SUMMARY.md.tmpl                    # 1,989 bytes
├── USER-SETUP.md.tmpl                 # 1,351 bytes
├── VERIFICATION.md.tmpl               # 2,467 bytes
└── VERIFICATION-DETAIL.md.tmpl        # 3,818 bytes
```

**Status**: 13 templates exist. Phase 13 successfully created the `codebase/` subdirectory with 7 templates. [S0]

### GSD Reference Architecture [S1]

GSD v1.11.1 has a well-structured reference architecture:

**GSD references/ directory** [S1]:
```
references/
├── checkpoints.md           # 40,250 bytes - checkpoint type specifications
├── continuation-format.md   # 4,581 bytes - next-step formatting
├── git-integration.md       # 6,799 bytes - commit conventions and git workflow
├── model-profiles.md        # 2,617 bytes - agent model selection rules
├── planning-config.md       # 7,029 bytes - config.json schema and behavior
├── questioning.md           # 5,176 bytes - questioning techniques
├── tdd.md                   # 7,945 bytes - TDD practices
├── ui-brand.md              # 4,581 bytes - output formatting
└── verification-patterns.md # 17,172 bytes - goal-backward verification
```

**Total**: 9 reference documents, 96,150 bytes [S1]

**GSD templates/ directory** [S1]:
```
templates/
├── codebase/                      # Codebase analysis outputs
│   ├── architecture.md
│   ├── concerns.md
│   ├── conventions.md
│   ├── integrations.md
│   ├── stack.md
│   ├── structure.md
│   └── testing.md
├── research-project/              # Research project outputs
│   ├── ARCHITECTURE.md
│   ├── FEATURES.md
│   ├── PITFALLS.md
│   ├── STACK.md
│   └── SUMMARY.md
├── config.json                    # Project config template
├── context.md                     # Phase context template
├── continue-here.md               # Pause/resume template
├── DEBUG.md                       # Debug session template
├── debug-subagent-prompt.md       # (Internal)
├── discovery.md                   # Discovery template
├── milestone.md                   # Milestone entry template
├── milestone-archive.md           # Milestone archive template
├── phase-prompt.md                # (Internal)
├── planner-subagent-prompt.md     # (Internal)
├── project.md                     # PROJECT.md template
├── requirements.md                # REQUIREMENTS.md template
├── research.md                    # RESEARCH.md template
├── roadmap.md                     # ROADMAP.md template
├── state.md                       # STATE.md template
├── summary.md                     # SUMMARY.md template
├── UAT.md                         # UAT session template
├── user-setup.md                  # USER-SETUP.md template
└── verification-report.md         # VERIFICATION.md template
```

**Total**: 24 templates (7 codebase, 5 research-project, 12 top-level) [S1]

### Naming Differences: Towline vs GSD [S0-S1]

| Towline Current | GSD Equivalent | Notes |
|-----------------|----------------|-------|
| `continuation-format.md` | `continuation-format.md` | ✓ Same (but different content — Towline = checkpoint continuation, GSD = next-step formatting) |
| `verification-patterns.md` | `verification-patterns.md` | ✓ Same |
| `ui-formatting.md` | `ui-brand.md` | Different name, similar purpose |
| `questioning-guide.md` | `questioning.md` | Different name, same purpose |
| `commit-conventions.md` | `git-integration.md` | GSD doc is broader (includes branching, commit points) |
| `deviation-rules.md` | *(no equivalent)* | Towline-specific concept |
| `plan-format.md` | *(no equivalent)* | Towline-specific (XML task format) |

**Key insight**: Towline's scattered docs cover 4/9 GSD reference topics. Missing: checkpoints, model-profiles, planning-config, tdd. Towline has 2 unique docs: deviation-rules, plan-format. [S0-S1]

### Cross-References Analysis [S0]

Current references to scattered docs:

1. **skills/build/SKILL.md:446** → `skills/build/continuation-format.md`
2. **skills/build/SKILL.md:538** → `skills/plan/verification-patterns.md`
3. **skills/status/SKILL.md:188** → `skills/shared/ui-formatting.md`
4. **skills/begin/SKILL.md:59** → `skills/begin/questioning-guide.md`
5. **skills/quick/SKILL.md:86** → `skills/quick/templates/plan-format.md.tmpl` (incorrect path)

**Finding**: Only 5 explicit cross-references exist. Most reference docs are embedded context rather than explicitly referenced. [S0]

### Phase 13 Accomplishments [S0]

Phase 13 (Extract & Deduplicate) completed:
- Created `templates/codebase/` with 7 templates
- Extracted inline prompt templates from SKILL.md files to `skills/{name}/templates/`
- Reduced context overhead by ~1,900 lines

**Not done in Phase 13**: Top-level reference consolidation, GSD parity templates [S0]

## Implementation Approach

### Recommended Approach

Create a `plugins/dev/references/` directory mirroring GSD structure, consolidate scattered docs, create missing templates for parity, update all cross-references. [S0-S1]

**Steps**:

1. **Create `plugins/dev/references/` directory** [S0]

2. **Move and consolidate cross-cutting reference docs** [S0]:
   - `skills/build/continuation-format.md` → `references/continuation-format.md`
   - `skills/plan/verification-patterns.md` → `references/verification-patterns.md`
   - `skills/shared/ui-formatting.md` → `references/ui-formatting.md`
   - `skills/begin/questioning-guide.md` → `references/questioning.md` (rename)
   - `skills/build/commit-conventions.md` → `references/commit-conventions.md`
   - `skills/plan/deviation-rules.md` → `references/deviation-rules.md`
   - `skills/plan/plan-format.md` → `references/plan-format.md`

3. **Create new reference docs for GSD parity** [S1]:
   - `references/checkpoints.md` — Based on GSD checkpoints.md, adapted for Towline checkpoint types
   - `references/git-integration.md` — Expand commit-conventions.md to cover branching, commit points
   - `references/model-profiles.md` — Document Towline's agent model selection (currently hardcoded)
   - `references/planning-config.md` — Document config.json schema and behavior

4. **Update cross-references in SKILL.md files** [S0]:
   - `skills/build/SKILL.md:446` → `references/continuation-format.md`
   - `skills/build/SKILL.md:538` → `references/verification-patterns.md`
   - `skills/status/SKILL.md:188` → `references/ui-formatting.md`
   - `skills/begin/SKILL.md:59` → `references/questioning.md`

5. **Create `templates/research/` subdirectory** [S1]:
   Based on GSD's `templates/research-project/`:
   - `templates/research/ARCHITECTURE.md.tmpl`
   - `templates/research/FEATURES.md.tmpl`
   - `templates/research/PITFALLS.md.tmpl`
   - `templates/research/STACK.md.tmpl`
   - `templates/research/SUMMARY.md.tmpl`

6. **Create missing top-level templates** [S1]:
   - `templates/DEBUG.md.tmpl` — Debug session template (based on GSD DEBUG.md)
   - `templates/UAT.md.tmpl` — UAT session template (based on GSD UAT.md)
   - `templates/discovery.md.tmpl` — Discovery template (based on GSD discovery.md)
   - `templates/milestone-archive.md.tmpl` — Milestone archive (based on GSD milestone-archive.md)
   - `templates/milestone.md.tmpl` — Milestone entry (based on GSD milestone.md)
   - `templates/continue-here.md.tmpl` — Pause/resume (based on GSD continue-here.md)

   **Status check**: Some of these may have been created in phase 13. Verify existence before creating. [S0]

7. **Verify no orphaned files** [S0]:
   - Confirm all reference docs moved from `skills/*/` subdirectories
   - Confirm all SKILL.md references updated
   - Run tests to ensure no broken references

8. **Update agents/*.md files** [S0]:
   - Search for references to old paths
   - Update to new `references/` paths

### Key Decisions

**Decision 1: Rename `ui-formatting.md` to `ui-formatting.md` (not `ui-brand.md`)** [S0]
- **Rationale**: Towline's doc is about formatting, not branding. Keep the clearer name.
- **Confidence**: HIGH

**Decision 2: Rename `questioning-guide.md` to `questioning.md`** [S0]
- **Rationale**: Align with GSD naming. "guide" is redundant — all reference docs are guides.
- **Confidence**: HIGH

**Decision 3: Keep Towline-specific reference docs** [S0]
- `deviation-rules.md` — No GSD equivalent, Towline-specific concept
- `plan-format.md` — No GSD equivalent, Towline uses XML task format
- **Rationale**: These are core Towline concepts. Don't force GSD parity where concepts differ.
- **Confidence**: HIGH

**Decision 4: Expand `commit-conventions.md` into `git-integration.md`** [S0-S1]
- **Rationale**: GSD's git-integration.md is more comprehensive. Towline should document branching strategy, commit points, not just commit format.
- **Approach**: Start with current commit-conventions.md content, add sections for commit points (when to commit), branching strategy (from config.json), git check (initialize repo if needed).
- **Confidence**: MEDIUM (requires reading Towline's git behavior from hooks and build skill)

**Decision 5: Create minimal `model-profiles.md` reference** [S0]
- **Rationale**: Towline agents currently use hardcoded models. Document the current state, even if not configurable yet.
- **Content**: Map agent names to models (e.g., towline-executor: opus, towline-verifier: sonnet).
- **Confidence**: MEDIUM (may need to grep codebase for actual model assignments)

**Decision 6: Create `planning-config.md` from config.json schema** [S0]
- **Rationale**: Towline has a config.json with documented options. Reference doc should explain each field.
- **Approach**: Read `plugins/dev/skills/config/SKILL.md` and extract config schema documentation.
- **Confidence**: HIGH

**Decision 7: Adaptation vs. Copy for GSD-sourced docs** [S1]
- **For checkpoints.md**: Adapt GSD content. Towline has different checkpoint types (checkpoint:human-verify vs auto with verify).
- **For templates**: Copy structure, adapt variable names and format to Towline conventions.
- **Rationale**: GSD docs are well-structured. Don't reinvent. Adapt to Towline specifics.
- **Confidence**: HIGH

### Configuration Details

No configuration changes needed. This is a documentation refactoring phase.

### File Manifest

**New files to create**:

References (7 moved + 4 new = 11 total):
- `plugins/dev/references/continuation-format.md` (moved)
- `plugins/dev/references/verification-patterns.md` (moved)
- `plugins/dev/references/ui-formatting.md` (moved)
- `plugins/dev/references/questioning.md` (moved+renamed)
- `plugins/dev/references/commit-conventions.md` (moved)
- `plugins/dev/references/deviation-rules.md` (moved)
- `plugins/dev/references/plan-format.md` (moved)
- `plugins/dev/references/checkpoints.md` (new)
- `plugins/dev/references/git-integration.md` (new, expands commit-conventions)
- `plugins/dev/references/model-profiles.md` (new)
- `plugins/dev/references/planning-config.md` (new)

Templates (5 research + 6 top-level = 11 total):
- `plugins/dev/templates/research/ARCHITECTURE.md.tmpl` (new)
- `plugins/dev/templates/research/FEATURES.md.tmpl` (new)
- `plugins/dev/templates/research/PITFALLS.md.tmpl` (new)
- `plugins/dev/templates/research/STACK.md.tmpl` (new)
- `plugins/dev/templates/research/SUMMARY.md.tmpl` (new)
- `plugins/dev/templates/DEBUG.md.tmpl` (new)
- `plugins/dev/templates/UAT.md.tmpl` (new)
- `plugins/dev/templates/discovery.md.tmpl` (new)
- `plugins/dev/templates/milestone-archive.md.tmpl` (new)
- `plugins/dev/templates/milestone.md.tmpl` (new)
- `plugins/dev/templates/continue-here.md.tmpl` (new)

**Files to delete**:
- `plugins/dev/skills/build/continuation-format.md`
- `plugins/dev/skills/build/commit-conventions.md`
- `plugins/dev/skills/plan/verification-patterns.md`
- `plugins/dev/skills/plan/deviation-rules.md`
- `plugins/dev/skills/plan/plan-format.md`
- `plugins/dev/skills/shared/ui-formatting.md`
- `plugins/dev/skills/begin/questioning-guide.md`

**Files to update** (cross-reference fixes):
- `plugins/dev/skills/build/SKILL.md` (2 references)
- `plugins/dev/skills/status/SKILL.md` (1 reference)
- `plugins/dev/skills/begin/SKILL.md` (1 reference)
- `plugins/dev/skills/quick/SKILL.md` (1 reference)
- Any agent definitions that reference these docs (search needed)

### Testing Strategy

1. **Reference integrity check**:
   ```bash
   # Search for broken references
   grep -r "skills/build/continuation-format" plugins/dev/
   grep -r "skills/plan/verification-patterns" plugins/dev/
   grep -r "skills/shared/ui-formatting" plugins/dev/
   grep -r "skills/begin/questioning" plugins/dev/
   ```

2. **File existence verification**:
   ```bash
   # Confirm all new reference docs exist
   ls -la plugins/dev/references/

   # Confirm all new templates exist
   ls -la plugins/dev/templates/research/
   ls -la plugins/dev/templates/*.tmpl
   ```

3. **No orphaned files**:
   ```bash
   # Confirm old locations are empty/deleted
   ls plugins/dev/skills/build/*.md | grep -E "continuation|commit"
   ls plugins/dev/skills/plan/*.md | grep -E "verification|deviation|plan-format"
   ls plugins/dev/skills/shared/*.md | grep ui-formatting
   ls plugins/dev/skills/begin/*.md | grep questioning
   ```

4. **Existing tests pass**:
   ```bash
   npm test
   ```

## Pitfalls for This Phase

### Pitfall 1: Broken Cross-References After Move [S0]

**Risk**: Skills/agents reference old paths, break after files move.

**Mitigation**:
- Search entire `plugins/dev/` directory for old paths before deleting
- Update all references atomically in the same plan
- Run grep verification after move

### Pitfall 2: Inconsistent Naming Between Towline and GSD [S1]

**Risk**: Confusion when comparing Towline and GSD reference docs.

**Mitigation**:
- Document naming differences in a table at top of each adapted reference doc
- Keep Towline-specific names where concepts differ (deviation-rules, plan-format)
- Align names where concepts are identical (questioning.md, verification-patterns.md)

### Pitfall 3: Copying GSD Content Without Adaptation [S1]

**Risk**: Templates reference GSD-specific concepts (e.g., `/gsd:plan-phase`) that don't exist in Towline.

**Mitigation**:
- Replace all GSD command references with Towline equivalents (`/dev:plan`)
- Replace GSD agent names with Towline agent names
- Replace GSD directory structures with Towline equivalents (e.g., `.planning/phases/{NN}-{slug}/PLAN.md` not `{phase}-PLAN.md`)

### Pitfall 4: Duplicate Content Between References and Skills [S0]

**Risk**: After moving references, SKILL.md files still duplicate the content inline.

**Mitigation**:
- Search each SKILL.md for content that matches moved reference docs
- Replace with "See references/{doc}.md" references
- Keep SKILL.md lean — reference, don't duplicate

### Pitfall 5: Creating Templates That Already Exist [S0]

**Risk**: Phase 13 may have already created some top-level templates (e.g., continue-here.md.tmpl).

**Mitigation**:
- Check `plugins/dev/templates/` before creating each new template
- Only create if missing
- If exists but incomplete, update rather than overwrite

### Pitfall 6: Model Profiles Mismatch [S0]

**Risk**: Documenting model profiles that don't match actual agent spawning behavior.

**Mitigation**:
- Grep `plugins/dev/skills/*/SKILL.md` for `Task(` calls
- Check for `model:` parameter or defaults
- Document actual behavior, not aspirational

### Pitfall 7: Git Integration Doc Too GSD-Specific [S1]

**Risk**: GSD's git-integration.md assumes GSD workflow (phase commits, milestone commits).

**Mitigation**:
- Read Towline's actual git behavior from `plugins/dev/hooks/` scripts
- Document Towline's commit points (task completion, plan completion, phase completion)
- Adapt GSD structure but replace with Towline reality

## Open Questions

### Question 1: Does Towline Have a TDD Reference Doc?

**Current state**: GSD has `references/tdd.md`. Towline has TDD task support in plan-format.md but no standalone TDD reference.

**Research needed**: Search for TDD patterns in Towline executor behavior.

**Recommendation**: If TDD workflow exists, extract to `references/tdd.md`. If not, defer to future phase.

### Question 2: What Model Selection Logic Exists?

**Current state**: Unknown if Towline agents use configurable models or hardcoded.

**Research needed**: Grep for `Task(` calls and check model parameter.

**Recommendation**: Document actual behavior in `references/model-profiles.md`. If hardcoded, document current assignments.

### Question 3: Are Checkpoints Implemented?

**Current state**: Towline plan-format.md defines checkpoint task types. Unknown if build skill implements them.

**Research needed**: Search `plugins/dev/skills/build/SKILL.md` for checkpoint handling.

**Recommendation**: Document actual checkpoint behavior in `references/checkpoints.md`.

### Question 4: Which Templates Already Exist?

**Current state**: Phase 13 created some templates. Manifest unknown.

**Research needed**: `ls -la plugins/dev/templates/` to check existence.

**Recommendation**: Only create missing templates.

## Dependencies

This phase depends on:
- Phase 13 completion (template extraction foundation)
- Access to GSD v1.11.1 reference docs for parity checking
- Ability to read current Towline codebase for actual behavior documentation

No code dependencies — this is documentation refactoring.

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S0 | Local Codebase | Towline `plugins/dev/` directory structure and content | HIGH |
| S1 | GSD Installation | `C:\Users\dave\.claude\get-shit-done\` v1.11.1 | HIGH |

## Revision History

- 2026-02-09: Initial research completed
