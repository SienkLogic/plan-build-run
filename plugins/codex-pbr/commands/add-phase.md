---
description: "Add phase to end of current milestone in roadmap"
argument-hint: "<description>"
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

Handles:
- Phase number calculation (next sequential integer)
- Directory creation with slug generation
- Roadmap structure updates
- STATE.md roadmap evolution tracking
</objective>

<context>
Description: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
## 1. Parse Arguments

Extract phase description from $ARGUMENTS. If empty, ask user for a description.

## 2. Validate State

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs roadmap analyze
```

Check that ROADMAP.md exists and has at least one milestone.

## 3. Calculate Next Phase Number

Read ROADMAP.md, find the highest integer phase number in the current milestone, add 1.

## 4. Generate Slug

```bash
SLUG=$(node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs generate-slug "$ARGUMENTS")
```

## 5. Create Phase Directory and Update Roadmap

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs roadmap append-phase --goal "$ARGUMENTS"
```

Create `.planning/phases/{NN}-{slug}/` directory.

## 6. Update State

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs state record-activity "Added phase {NN}: {description}"
```

## 7. Commit

```bash
git add .planning/ROADMAP.md .planning/STATE.md .planning/phases/
git commit -m "docs: add phase {NN} — {slug}"
```

## 8. Report

Display: "Phase {NN}: {description} added to roadmap."
Suggest: `/pbr:discuss-phase {NN}` or `/pbr:plan-phase {NN}` as next steps.
</process>
