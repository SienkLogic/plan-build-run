---
name: note
description: "Zero-friction idea capture. Append, list, or promote notes to todos."
argument-hint: "<text> | list | promote <index> [--global]"
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► NOTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

# /pbr:note — Quick Note Capture

You are running the **note** skill. Your job is zero-friction idea capture. One Write call, one confirmation line. No questions, no prompts.

This skill runs **inline** — no Task, no AskUserQuestion, no Bash.

---

## Storage Format

Notes are stored as **individual markdown files** in a notes directory:

- **Project scope**: `.planning/notes/{YYYY-MM-DD}-{slug}.md` — used when `.planning/` directory exists in cwd
- **Global scope**: `~/.claude/notes/{YYYY-MM-DD}-{slug}.md` — used as fallback when no `.planning/`, or when `--global` flag is present

Each note file has this format:

```markdown
---
date: "YYYY-MM-DD HH:mm"
promoted: false
---

{note text verbatim}
```

**`--global` flag**: Strip `--global` from anywhere in `$ARGUMENTS` before parsing. When present, force global scope regardless of whether `.planning/` exists.

**Important**: Do NOT create `.planning/` if it doesn't exist. If there's no `.planning/` directory, fall back to global scope silently.

---

## Subcommand Parsing

Parse `$ARGUMENTS` after stripping `--global`:

| Condition | Subcommand |
|-----------|------------|
| Arguments are exactly `list` (case-insensitive) | **list** |
| Arguments are exactly `promote <N>` where N is a number | **promote** |
| Arguments are empty (no text at all) | **list** |
| Anything else | **append** (the text IS the note) |

**Critical**: `list` is only a subcommand when it's the ENTIRE argument. `/pbr:note list of groceries` saves a note with text "list of groceries". Same for `promote` — only a subcommand when followed by exactly one number.

---

## Subcommand: append

Create a timestamped note file in the target directory.

### Steps

1. Determine scope (project or global) per Storage Format above
2. Ensure the notes directory exists (`.planning/notes/` or `~/.claude/notes/`)
3. Generate slug: first ~4 meaningful words of the note text, lowercase, hyphen-separated (strip articles/prepositions from the start)
4. Generate filename: `{YYYY-MM-DD}-{slug}.md`
   - If a file with that name already exists, append `-2`, `-3`, etc.
5. Write the file with frontmatter and note text (see Storage Format)
6. Confirm with exactly one line: `Noted ({scope}): {note text}`
   - Where `{scope}` is "project" or "global"

### Constraints

- **Never modify the note text** — capture verbatim, including typos
- **Never ask questions** — just write and confirm
- **Timestamp format**: Use local time, `YYYY-MM-DD HH:mm` (24-hour, no seconds)

---

## Subcommand: list

Show notes from both project and global scopes.

### Steps

1. Glob `.planning/notes/*.md` (if directory exists) — these are "project" notes
2. Glob `~/.claude/notes/*.md` (if directory exists) — these are "global" notes
3. For each file, read frontmatter to get `date` and `promoted` status
4. Exclude files where `promoted: true` from active counts (but still show them, dimmed)
5. Sort by date, number all active entries sequentially starting at 1
6. If total active entries > 20, show only the last 10 with a note about how many were omitted

### Display Format

```
Notes:

Project (.planning/notes/):
  1. [2026-02-08 14:32] refactor the hook system to support async validators
  2. [promoted] [2026-02-08 14:40] add rate limiting to the API endpoints
  3. [2026-02-08 15:10] consider adding a --dry-run flag to build

Global (~/.claude/notes/):
  4. [2026-02-08 10:00] cross-project idea about shared config

{count} active note(s). Use `/pbr:note promote <N>` to convert to a todo.
```

If a scope has no directory or no entries, show: `(no notes)`

---

## Subcommand: promote

Convert a note into a todo file.

### Steps

1. Run the **list** logic to build the numbered index (both scopes)
2. Find entry N from the numbered list
3. If N is invalid or refers to an already-promoted note, tell the user and stop
4. **Requires `.planning/` directory** — if it doesn't exist, warn: "Todos require a Plan-Build-Run project. Run `/pbr:begin` to initialize one, or use `/pbr:todo add` in an existing project."
5. Ensure `.planning/todos/pending/` directory exists
6. Generate todo ID: `{NNN}-{slug}` where NNN is the next sequential number (scan both `.planning/todos/pending/` and `.planning/todos/done/` for the highest existing number, increment by 1, zero-pad to 3 digits) and slug is the first ~4 meaningful words of the note text, lowercase, hyphen-separated
7. Extract the note text from the source file (body after frontmatter)
8. Create `.planning/todos/pending/{id}.md`:

```yaml
---
title: "{note text}"
status: pending
priority: P2
source: "promoted from /pbr:note"
created: {YYYY-MM-DD}
theme: general
---

## Goal

{note text}

## Context

Promoted from quick note captured on {original date}.

## Acceptance Criteria

- [ ] {primary criterion derived from note text}
```

9. Mark the source note file as promoted: update its frontmatter to `promoted: true`
10. Confirm: `Promoted note {N} to todo {id}: {note text}`

---

## Edge Cases

1. **"list" as note text**: `/pbr:note list of things` → saves note "list of things" (subcommand only when `list` is the entire arg)
2. **No `.planning/`**: Falls back to global `~/.claude/notes/` — works in any directory
3. **Promote without project**: Warns that todos require `.planning/`, suggests `/pbr:begin`
4. **Large files**: `list` shows last 10 when >20 active entries
5. **Duplicate slugs**: Append `-2`, `-3` etc. to filename if slug already used on same date
6. **`--global` position**: Stripped from anywhere — `--global my idea` and `my idea --global` both save "my idea" globally
7. **Promote already-promoted**: Tell user "Note {N} is already promoted" and stop
8. **Empty note text after stripping flags**: Treat as `list` subcommand

---

## Error Handling

### Write failure
If the Write tool fails (permissions, disk full, etc.), display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Failed to write note to {target_file}.

**To fix:** Check file permissions or disk space.
```

### Promote target not found
If the specified note index is invalid, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Note {N} not found. Valid range: 1-{max}.

**To fix:** Run `/pbr:note list` to see available notes.
```

---

## Anti-Patterns

1. **DO NOT** ask questions on append — just write and confirm
2. **DO NOT** modify note text — capture verbatim
3. **DO NOT** use Task, AskUserQuestion, or Bash
4. **DO NOT** create `.planning/` if it doesn't exist — fall back to global
5. **DO NOT** number promoted notes in the active count (but still display them)
6. **DO NOT** over-format the confirmation — one line is enough
7. **DO NOT** use a flat NOTES.md file — always use individual files in notes directory
