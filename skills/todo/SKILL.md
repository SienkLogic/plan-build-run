---
name: todo
description: "Persistent file-based todos that survive across sessions. Add, list, and complete todo items."
allowed-tools: Read, Write, Bash, Glob, Grep
argument-hint: "add <description> | list [area] | done <id>"
---

# /dev:todo — Persistent File-Based Todos

## Why File-Based

Native Claude Code Tasks are session-scoped — they vanish when the conversation ends. Towline todos are individual `.md` files in `.planning/todos/` that persist across sessions, context resets, and compactions.

## Subcommands

Parse `$ARGUMENTS` to determine the subcommand:

### `add <description>`

1. Ensure `.planning/todos/pending/` directory exists
2. Generate ID: `{YYYYMMDD}-{NNN}` where NNN is sequential within the day
3. Infer area from description (e.g., "auth" → authentication, "test" → testing, "UI" → frontend)
4. Check for duplicates — read existing pending todos, if a similar one exists, ask user via AskUserQuestion
5. Create `.planning/todos/pending/{id}.md`:

```yaml
---
id: {id}
area: {inferred-area}
priority: normal
created: {ISO-timestamp}
source: conversation
---

# {description}

## Context
{any relevant context from the current conversation}

## Notes
(empty — agent or user can add notes later)
```

6. Update STATE.md Pending Todos section
7. Confirm: "Added todo {id}: {description}"

### `list [area]`

1. Read all files in `.planning/todos/pending/`
2. Parse frontmatter from each
3. If area filter provided, filter by area
4. Display as table:

```
Pending Todos:
| ID | Area | Priority | Age | Description |
|----|------|----------|-----|-------------|
| 20250207-001 | auth | normal | 2d | Add rate limiting to login |
| 20250207-002 | frontend | normal | 2d | Fix mobile nav overflow |
```

5. Offer actions: "Work on one? Pick an ID, or use `/dev:todo done <id>` to mark complete."

### `done <id>`

1. Find `.planning/todos/pending/{id}.md`
2. If not found, list available IDs
3. Move file to `.planning/todos/done/{id}.md`
4. Add completion timestamp to frontmatter
5. Update STATE.md
6. Confirm: "Completed todo {id}: {description}"

### No arguments

Show a brief summary: count of pending todos, grouped by area, plus usage hint.

## State Integration

After any todo operation, update the "Pending Todos" section of STATE.md with the current count and list.

## Git Integration

If `planning.commit_docs: true` in config, commit todo changes:
- `docs(planning): add todo {id}`
- `docs(planning): complete todo {id}`
