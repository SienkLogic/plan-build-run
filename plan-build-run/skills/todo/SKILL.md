---
name: todo
description: "File-based persistent todos. Add, list, complete — survives sessions."
allowed-tools: Read, Write, Bash, Glob, Grep, Skill, AskUserQuestion
argument-hint: "add <description> | list [theme] | done <NNN> | work <NNN>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► TODO                                       ║
╚══════════════════════════════════════════════════════════════╝
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
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► TODO ADDED ✓                               ║
╚══════════════════════════════════════════════════════════════╝

**Todo {NNN}:** {description}



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Work on it now** or see your task list

`/pbr:quick`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:todo list` — see all pending todos
- `/pbr:status` — see project status


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


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Pick a todo** — mark one done or start working

`/pbr:todo work <NNN>` — start working on a todo
`/pbr:todo done <NNN>` — mark a todo as complete



**Also available:**
- `/pbr:status` — see project status


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

**CRITICAL: Write to done/ FIRST, verify it exists, THEN delete from pending/. Do NOT delete pending before confirming done/ write succeeded.**

6. Write the updated content to `.planning/todos/done/{NNN}-{slug}.md`
7. Verify the done/ file was written successfully: check that `.planning/todos/done/{NNN}-{slug}.md` exists and has content (use `ls` or Glob)
   - If the done/ write failed, abort and display:
     ```
     ╔══════════════════════════════════════════════════════════════╗
     ║  ERROR                                                       ║
     ╚══════════════════════════════════════════════════════════════╝

     Failed to write to done/. Pending file preserved.

     **To fix:** Check that `.planning/todos/done/` exists and is writable.
     ```
     Do NOT proceed to delete the pending file.
8. Only THEN delete the original file from `.planning/todos/pending/` (use `rm` via Bash)
8. Update STATE.md
9. Confirm with branded output:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► TODO COMPLETED ✓                           ║
╚══════════════════════════════════════════════════════════════╝

**Todo {NNN}:** {title}



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**See remaining tasks**

`/pbr:todo list`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:status` — see project status


```

### `work <NNN>`

1. Find `.planning/todos/pending/{NNN}-*.md` (match by number prefix)
2. If not found, display the same error block as `done` — suggest `/pbr:todo list`
3. Read the todo file content (frontmatter + body)
4. Extract the `title` from frontmatter and the full body (Goal, Scope, Acceptance Criteria sections)

5. **Assess complexity** to choose the right skill. Evaluate the todo content against these criteria:

| Signal | Route to |
|--------|----------|
| Single file change, small fix, simple addition | `/pbr:quick` |
| Multiple acceptance criteria, multi-file scope, architectural decisions, needs research | `/pbr:plan` (requires an active phase) |
| Investigation needed, unclear root cause | `/pbr:debug` |
| Open-ended exploration, no clear deliverable | `/pbr:explore` |

If unsure, ask the user via AskUserQuestion:
```
Todo {NNN} could be handled as a quick task or may need full planning.

Which approach?
- Quick task (/pbr:quick) — single executor, atomic commit
- Full planning (/pbr:plan) — research, plan, build cycle
- Debug (/pbr:debug) — systematic investigation
- Explore (/pbr:explore) — open-ended investigation
```

6. Display branded output:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► WORKING ON TODO {NNN}                      ║
╚══════════════════════════════════════════════════════════════╝

**Todo {NNN}:** {title}
**Routing to:** /pbr:{chosen-skill}
```

7. Invoke the chosen skill via the Skill tool, passing the todo title and body as args:

```
{title}

Context from todo {NNN}:
{body content — Goal, Scope, Acceptance Criteria sections}
```

For `/pbr:plan`, if no phase exists for this work yet, suggest the user run `/pbr:plan add` first to create one, then re-run `/pbr:todo work {NNN}`.

8. When the skill completes, remind the user:

```


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Mark this todo as done if the work is complete**

`/pbr:todo done {NNN}`


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
