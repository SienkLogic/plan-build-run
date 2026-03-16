---
description: "Insert urgent work as decimal phase (e.g., 72.1) between existing phases"
argument-hint: "<after> <description>"
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Insert a decimal phase for urgent work discovered mid-milestone that must be completed between existing integer phases.

Uses decimal numbering (72.1, 72.2, etc.) to preserve the logical sequence of planned phases while accommodating urgent insertions.

Purpose: Handle urgent work discovered during execution without renumbering entire roadmap.
</objective>

<context>
Arguments: $ARGUMENTS (format: <after-phase-number> <description>)

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
## 1. Parse Arguments

Extract after-phase-number and description from $ARGUMENTS. Error if either is missing.

## 2. Calculate Decimal Phase Number

Find existing decimal phases after the target number to determine next available decimal (e.g., if 3.1 exists, use 3.2).

## 3. Generate Slug

```bash
SLUG=$(node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs generate-slug "{description}")
```

## 4. Create Phase

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs roadmap insert-phase {after} --goal "{description}"
```

Create `.planning/phases/{NN.D}-{slug}/` directory.

## 5. Update State

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs state record-activity "Inserted phase {NN.D}: {description}"
```

## 6. Commit

```bash
git add .planning/
git commit -m "docs: insert phase {NN.D} — {slug}"
```

## 7. Report

Display: "Phase {NN.D}: {description} inserted after phase {NN}."
Suggest: `/pbr:plan-phase {NN.D}` as next step.
</process>
