---
name: thread
description: "Persistent context threads for cross-session work that spans phases. Lighter than pause/resume."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: "[name | list | resume <name>]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:thread — Persistent Context Threads

Lightweight cross-session knowledge stores for work spanning multiple sessions that doesn't belong to any specific phase. Lighter than `/pbr:pause` (no phase state), richer than `/pbr:note` (structured sections).

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► THREAD                                     ║
╚══════════════════════════════════════════════════════════════╝
```

## Subcommands

### `/pbr:thread <name>` — Create thread

1. `mkdir -p .planning/threads`
2. Generate slug from name
3. Write `.planning/threads/{slug}.md`:

```markdown
---
created: {ISO date}
updated: {ISO date}
status: active
---

# {Thread Name}

## Goal
{What this thread is tracking — ask user}

## Context
{Current state of the work — filled during creation}

## References
{Related files, phases, decisions — gathered from conversation}

## Next Steps
{What to do next — filled during creation}
```

4. Display: `Thread created: {name}`

### `/pbr:thread list` — List threads

Scan `.planning/threads/*.md`, display name + status + last updated.

### `/pbr:thread resume <name>` — Resume thread

1. Find `.planning/threads/{slug}.md`
2. Read and display Goal, Context, References, Next Steps
3. Thread context is now in the conversation — work can continue
4. Update the `updated` field in frontmatter

### `/pbr:thread close <name>` — Close thread

Update status to `closed`. Optionally promote to phase or backlog.

## Anti-Patterns

1. DO NOT use threads for phase-specific work — use pause/resume instead
2. DO NOT create threads for one-off notes — use /pbr:note instead
3. DO NOT auto-close threads — always ask user
