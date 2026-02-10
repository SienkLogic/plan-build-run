---
title: "Add contexts for behavioral mode switching"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: ux
---

## Goal

Create context files that define different behavioral modes (dev, research, review) so Claude's approach changes based on the current phase of work.

## What Was Done

1. Created `contexts/` directory with three behavioral profiles:
   - **dev.md**: Active development — write code first, low verbosity, medium risk tolerance, prefer Write/Edit/Bash
   - **research.md**: Exploration mode — read widely, no code writing, high verbosity, evidence-based recommendations
   - **review.md**: Code review — read thoroughly, prioritize by severity (CRITICAL/HIGH/MEDIUM/LOW), report don't fix
2. Each context defines: primary/secondary tools, risk tolerance, verbosity, decision style, guidelines, and anti-patterns
3. Updated `skills/help/SKILL.md` with Behavioral Contexts section documenting all three contexts and their skill mappings
4. Updated `validate-plugin-structure.js` to detect and validate context files (heading check + info output)
5. Validator now reports: 20 skills, 10 agents, 3 contexts — all clean

## Design Decisions

- Context files are standalone behavioral guidelines, not embedded in skill frontmatter
- Skills don't explicitly reference contexts — the help documentation maps skills to contexts
- Minimal modification to existing skills (no frontmatter changes) to avoid churn
- Context files use simple markdown with heading + sections — no YAML frontmatter needed
- Validator treats missing contexts/ as a warning (optional component), not an error

## Acceptance Criteria

- [x] Three context files exist with clear behavioral guidelines
- [x] Context switching is documented in help
- [x] Skills reference appropriate contexts (via help documentation mapping)
