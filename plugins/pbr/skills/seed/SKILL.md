---
name: seed
description: "Plant forward-looking ideas with trigger conditions that auto-surface at the right milestone."
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion
argument-hint: "<idea description>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:seed — Plant Ideas for Future Milestones

Capture a forward-looking idea with trigger conditions. Seeds auto-surface during `/pbr:new-milestone` when trigger conditions match the new milestone's scope.

Seeds beat deferred items because they preserve WHY, define WHEN, and auto-present.

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SEED                                       ║
╚══════════════════════════════════════════════════════════════╝
```

## Step 1 — Parse Idea

If `$ARGUMENTS` is empty, ask: "What's the idea? (one sentence)"

## Step 2 — Gather Context

Ask focused questions:

1. **Trigger**: "When should this surface? (e.g., 'when we add user accounts', 'next major version')"
2. **Why**: "Why does this matter? What problem does it solve?"
3. **Scope**: Small (quick task) / Medium (phase or two) / Large (full milestone)

## Step 3 — Collect Breadcrumbs

Search codebase for related files. Check STATE.md decisions, ROADMAP.md phases, todos.

## Step 4 — Write Seed

```bash
mkdir -p .planning/seeds
```

Find next seed number. Write `.planning/seeds/SEED-{NNN}-{slug}.md`:

```markdown
---
id: SEED-{NNN}
status: dormant
planted: {ISO date}
planted_during: {current milestone/phase}
trigger_when: "{trigger}"
scope: "{small|medium|large}"
---

# SEED-{NNN}: {idea}

## Why This Matters
{why}

## When to Surface
**Trigger:** {trigger}

## Breadcrumbs
{related files and references}
```

## Step 5 — Report

```
Seed planted: SEED-{NNN} — {idea}
Trigger: {trigger}
```

## Integration with /pbr:new-milestone

The new-milestone skill should scan `.planning/seeds/` and present matches:
1. Read each seed's `trigger_when` field
2. Compare against the new milestone's name/scope/goals
3. Present matching seeds to the user for inclusion

## Anti-Patterns

1. DO NOT plant seeds for immediate work — use todos or backlog instead
2. DO NOT auto-activate seeds — always present to user during milestone creation
