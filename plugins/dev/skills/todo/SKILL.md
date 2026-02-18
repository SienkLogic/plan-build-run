---
name: todo
description: "File-based persistent todos. Add, list, complete — survives sessions."
allowed-tools: Read, Write, Bash, Glob, Grep
argument-hint: "add <description> | list [theme] | done <NNN>"
---

# /dev:todo — Persistent File-Based Todos

## Why File-Based

Native Claude Code Tasks are session-scoped — they vanish when the conversation ends. Towline todos are individual `.md` files in `.planning/todos/` that persist across sessions, context resets, and compactions.

## Subcommands

Parse `$ARGUMENTS` to determine the subcommand:

### `add <description>`

1. Ensure `.planning/todos/pending/` directory exists
2. Generate NNN: scan **both** `.planning/todos/pending/` and `.planning/todos/done/` for the highest existing number, then increment by 1 (zero-padded to 3 digits)
3. Generate slug: take the first ~4 meaningful words from the description, lowercase, hyphen-separated (e.g., "Add rate limiting to login" → `add-rate-limiting-login`)
4. Infer theme from description (e.g., "auth" → security, "test" → testing, "UI" → frontend, "refactor" → quality)
5. Check for duplicates — read existing pending todos, if a similar one exists, ask user via AskUserQuestion
6. Create `.planning/todos/pending/{NNN}-{slug}.md`:

```yaml
---
title: "{description}"
status: pending
priority: P2
source: conversation
created: {YYYY-MM-DD}
theme: {inferred-theme}
---

## Goal

{description expanded into a clear goal statement}

## Scope

{any relevant context from the current conversation, or bullet points of what's in/out of scope}

## Acceptance Criteria

- [ ] {primary acceptance criterion derived from description}
```

7. Update STATE.md Pending Todos section
8. Confirm with branded output:
```
✓ Added todo {NNN}: {description}

→ `/dev:todo list` — see all pending todos
→ `/dev:quick {NNN}` — work on it now
```

### `list [theme]`

1. Read all files in `.planning/todos/pending/`
2. Parse frontmatter from each
3. If theme filter provided, filter by theme
4. Display as table:

```
Pending Todos:
| # | Title | Priority | Theme | Created |
|---|-------|----------|-------|---------|
| 074 | Status-line customization options | P2 | capability | 2026-02-10 |
| 075 | Add WebSearch/WebFetch/Context7 to researcher | P2 | capability | 2026-02-10 |
```

5. Offer actions:
```
→ `/dev:todo done <NNN>` — mark a todo complete
→ `/dev:quick` — work on one now
→ `/dev:status` — see project status
```

### `done <NNN>`

1. Find `.planning/todos/pending/{NNN}-*.md` (match by number prefix)
2. If not found, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Todo {NNN} not found in pending todos.

**To fix:** Run `/dev:todo list` to see available numbers.
```
3. Move file to `.planning/todos/done/{NNN}-{slug}.md`
4. Update frontmatter: set `status: done` and add `completed: {YYYY-MM-DD}`
5. Update STATE.md
6. Confirm with branded output:
```
✓ Completed todo {NNN}: {title}

→ `/dev:todo list` — see remaining todos
→ `/dev:continue` — execute next logical step
```

### No arguments

Show a brief summary: count of pending todos, grouped by theme, plus usage hint.

## State Integration

After any todo operation, update the "Pending Todos" section of STATE.md with the current count and list.

## Git Integration

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

If `planning.commit_docs: true` in config, commit todo changes:
- `docs(planning): add todo {NNN}`
- `docs(planning): complete todo {NNN}`
