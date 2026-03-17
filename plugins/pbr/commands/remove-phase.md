---
description: "Remove a future phase from roadmap and renumber subsequent phases"
argument-hint: "<phase-number>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

Purpose: Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.
Output: Phase deleted, all subsequent phases renumbered, git commit as historical record.
</objective>

<context>
Phase: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
## 1. Validate Phase Number

Parse $ARGUMENTS as phase number. Error if empty.

## 2. Check Phase Status

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js phase-info $ARGUMENTS
```

Verify the phase exists and has NOT been started (no PLAN.md or SUMMARY.md files). Refuse to remove completed or in-progress phases.

## 3. Confirm Removal

Display phase details and ask for confirmation:
"Remove Phase {N}: {name}? This will renumber all subsequent phases."

## 4. Remove Phase

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js phase remove $ARGUMENTS
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap remove-phase $ARGUMENTS
```

## 5. Update State

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state record-activity "Removed phase {N}: {name}"
```

## 6. Commit

```bash
git add .planning/
git commit -m "docs: remove phase {N} — {name}"
```

## 7. Report

Display updated phase list and suggest `/pbr:progress` to review.
</process>
