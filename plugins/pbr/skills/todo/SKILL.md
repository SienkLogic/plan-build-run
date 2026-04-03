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

1. Run the CLI to create the todo:
   ```bash
   pbr-tools todo add "{description}"
   ```
   This handles NNN generation, slug creation (via slug-generate internally), duplicate detection, and file creation.
   If the CLI fails, display a branded ERROR box and stop.
2. Parse the CLI JSON output to extract the created file path, NNN, and slug for the confirmation display.

3. **CRITICAL -- DO NOT SKIP:** Update STATE.md Pending Todos section

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
- `/pbr:check-todos` — see all pending todos
- `/pbr:progress` — see project status


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
- `/pbr:progress` — see project status


```

### `done <NNN>`

1. Run the CLI to complete the todo:
   ```bash
   pbr-tools todo done {NNN}
   ```
   This handles finding the file, updating frontmatter, safe write-to-done-then-delete-pending, and verification.
   If the CLI fails (e.g., NNN not found), display a branded ERROR box and stop.
2. Parse the CLI JSON output to extract the title for the confirmation display.
3. Update STATE.md
4. Confirm with branded output:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► TODO COMPLETED ✓                           ║
╚══════════════════════════════════════════════════════════════╝

**Todo {NNN}:** {title}



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**See remaining tasks**

`/pbr:check-todos`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:progress` — see project status


```

### `work <NNN>`

1. Find `.planning/todos/pending/{NNN}-*.md` (match by number prefix)
2. If not found, display the same error block as `done` — suggest `/pbr:check-todos`
3. Read the todo file content (frontmatter + body)
4. Extract the `title` from frontmatter and the full body (Goal, Scope, Acceptance Criteria sections)

5. **Assess complexity** to choose the right skill. Evaluate the todo content against these criteria:

| Signal | Route to |
|--------|----------|
| Single file change, small fix, simple addition | `/pbr:quick` |
| Multiple acceptance criteria, multi-file scope, architectural decisions, needs research | `/pbr:plan-phase` (requires an active phase) |
| Investigation needed, unclear root cause | `/pbr:debug` |
| Open-ended exploration, no clear deliverable | `/pbr:explore` |

If unsure, ask the user via AskUserQuestion:
```
Todo {NNN} could be handled as a quick task or may need full planning.

Which approach?
- Quick task (/pbr:quick) — single executor, atomic commit
- Full planning (/pbr:plan-phase) — research, plan, build cycle
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

For `/pbr:plan-phase`, if no phase exists for this work yet, suggest the user run `/pbr:plan-phase add` first to create one, then re-run `/pbr:todo work {NNN}`.

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

Reference: `skills/shared/error-reporting.md` for branded error output patterns.

## Git Integration

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

If `planning.commit_docs: true` in config, commit todo changes:
- `docs(planning): add todo {NNN}`
- `docs(planning): complete todo {NNN}`
