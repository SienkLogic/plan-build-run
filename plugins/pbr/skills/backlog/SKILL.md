---
name: backlog
description: "Manage backlog items — ideas not ready for active planning. Add, review, promote, or remove."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: "add <description> | review | promote <N>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:backlog — Backlog Parking Lot

Manage ideas that aren't ready for active planning. Backlog items use 999.x numbering to stay outside the active phase sequence. They can be promoted to active phases when ready.

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► BACKLOG                                    ║
╚══════════════════════════════════════════════════════════════╝
```

## Subcommands

### `/pbr:backlog add <description>`

1. Create `.planning/phases/` directory if needed
2. Find next 999.x number: scan for existing `999.*` dirs, increment
3. Generate slug from description
4. Create `.planning/phases/999.{x}-{slug}/`
5. Write a minimal PLAN.md with just the description as objective (no tasks — this is a placeholder)
6. Display: `Backlog item 999.{x}: {description}`

### `/pbr:backlog review`

1. Scan `.planning/phases/999.*` directories
2. If none found: display "No backlog items." and exit
3. For each item, read its PLAN.md objective
4. Display all items in a numbered list
5. Use AskUserQuestion for each item:
   - **Promote** — Move to active milestone (renumber into current sequence)
   - **Keep** — Leave in backlog
   - **Remove** — Delete the directory

### `/pbr:backlog promote <N>`

1. Find the 999.{N} directory
2. Determine next active phase number (highest non-999 phase + 1)
3. Rename directory from `999.{N}-{slug}` to `{next}-{slug}`
4. Update ROADMAP.md to include the new phase
5. Display: `Promoted backlog item to Phase {next}: {slug}`

## Anti-Patterns

1. DO NOT create backlog items for work that should be a todo — backlog is for phase-level ideas
2. DO NOT auto-promote items — always require user decision
3. DO NOT renumber existing active phases when promoting
