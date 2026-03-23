---
name: fast
description: "Execute a trivial task inline without subagent overhead. No planning, no research — just do it and commit."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "<task description>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:fast — Inline Trivial Task Execution

Execute a trivial task directly in the current context. No subagents, no PLAN.md, no research. For tasks like: fix a typo, update a config value, add a missing import, rename a variable, add a .gitignore entry, bump a version.

Use `/pbr:quick` for anything needing multi-step planning, research, or verification.

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► FAST                                       ║
╚══════════════════════════════════════════════════════════════╝
```

## Step 1 — Parse Task

If `$ARGUMENTS` is empty, ask: "What's the quick fix? (one sentence)"

Store as the task description.

## Step 2 — Scope Check

A task is trivial if it needs:
- 3 or fewer file edits
- No new dependencies or architecture changes
- No research needed

If the task seems non-trivial, say:

```
This looks like it needs planning. Use /pbr:quick instead:
  /pbr:quick "{task description}"
```

And stop.

## Step 3 — Execute Inline

Do the work directly:

1. Read the relevant file(s)
2. Make the change(s) using Edit or Write
3. Verify the change works (run existing tests if applicable)

**No PLAN.md. No Task() spawn. Just do it.**

## Step 4 — Commit

Stage specific files (NEVER `git add .`) and commit:

```bash
git add {specific files}
git commit -m "{type}(fast): {concise description}"
```

Use conventional commit types: fix, feat, docs, chore, refactor as appropriate.

## Step 5 — Log to Quick Tasks

If `.planning/quick/` exists, create a minimal tracking entry:

1. Find next NNN: scan `.planning/quick/` for highest existing number + 1
2. Create `.planning/quick/{NNN}-fast-{slug}/PLAN.md` with a one-line plan
3. Create `.planning/quick/{NNN}-fast-{slug}/SUMMARY.md` with the commit hash and description

This ensures fast tasks appear in state tracking alongside quick tasks.

## Step 6 — Report

```
╔══════════════════════════════════════════════════════════════╗
║  FAST ✓                                                      ║
╚══════════════════════════════════════════════════════════════╝

{commit hash} — {commit message}
Files: {changed files}
```

## Anti-Patterns

1. DO NOT spawn a Task() — fast mode is inline only
2. DO NOT create elaborate plans — this is for trivial changes
3. DO NOT use `git add .` — stage specific files
4. DO NOT use fast mode for multi-file refactors — suggest `/pbr:quick`
5. DO NOT skip the commit — every change gets committed
