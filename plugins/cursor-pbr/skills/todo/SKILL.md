---
name: todo
description: "File-based persistent todos. Add, list, complete — survives sessions."
argument-hint: "add <description> | list [theme] | done <NNN> | work <NNN>"
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► TODO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

# /pbr:todo — Persistent File-Based Todos

## Why File-Based

Native Claude Code Tasks are session-scoped — they vanish when the conversation ends. Plan-Build-Run todos are individual `.md` files in `.planning/todos/` that persist across sessions, context resets, and compactions.

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

   If the Write fails, display:
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  ERROR                                                       ║
   ╚══════════════════════════════════════════════════════════════╝

   Failed to write todo file.

   **To fix:** Check that `.planning/todos/pending/` exists and is writable.
   ```

8. Confirm with branded output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► TODO ADDED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Todo {NNN}:** {description}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Work on it now** or see your task list

`/pbr:quick`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/pbr:todo list` — see all pending todos
- `/pbr:status` — see project status

───────────────────────────────────────────────────────────────
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

5. Offer actions with branded routing:
```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Pick a todo** — mark one done or start working

`/pbr:todo work <NNN>` — start working on a todo
`/pbr:todo done <NNN>` — mark a todo as complete

───────────────────────────────────────────────────────────────

**Also available:**
- `/pbr:status` — see project status

───────────────────────────────────────────────────────────────
```

### `done <NNN>`

1. Find `.planning/todos/pending/{NNN}-*.md` (match by number prefix)
2. If not found, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Todo {NNN} not found in pending todos.

**To fix:** Run `/pbr:todo list` to see available numbers.
```
3. Ensure `.planning/todos/done/` directory exists (create if needed)
4. Read the pending file content
5. Update frontmatter in the content: set `status: done` and add `completed: {YYYY-MM-DD}`
6. Write the updated content to `.planning/todos/done/{NNN}-{slug}.md`
7. Delete the original file from `.planning/todos/pending/` (use `rm` via Bash)
8. Update STATE.md
9. Confirm with branded output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► TODO COMPLETED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Todo {NNN}:** {title}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**See remaining tasks**

`/pbr:todo list`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:status` — see project status

───────────────────────────────────────────────────────────────
```

### `work <NNN>`

1. Find `.planning/todos/pending/{NNN}-*.md` (match by number prefix)
2. If not found, display the same error block as `done` — suggest `/pbr:todo list`
3. Read the todo file content (frontmatter + body)
4. Extract the `title` from frontmatter and the full body (Goal, Scope, Acceptance Criteria sections)
5. Display branded output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► WORKING ON TODO {NNN}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Todo {NNN}:** {title}

Launching /pbr:quick with todo context...
```
6. Invoke the Skill tool: `skill: "pbr:quick"` with `args` set to the todo title followed by the body content. Format the args as:

```
{title}

Context from todo {NNN}:
{body content — Goal, Scope, Acceptance Criteria sections}
```

This hands off execution to `/pbr:quick`, which will spawn an executor agent, make atomic commits, and track the work. When quick completes, remind the user:

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Mark this todo as done if the work is complete**

`/pbr:todo done {NNN}`

───────────────────────────────────────────────────────────────
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
