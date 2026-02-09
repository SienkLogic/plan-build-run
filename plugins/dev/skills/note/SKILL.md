---
name: note
description: "Zero-friction idea capture. Append, list, or promote notes to todos."
allowed-tools: Read, Write, Glob, Grep
argument-hint: "<text> | list | promote <index> [--global]"
---

# /dev:note — Quick Note Capture

You are running the **note** skill. Your job is zero-friction idea capture. One Write call, one confirmation line. No questions, no prompts.

This skill runs **inline** — no Task, no AskUserQuestion, no Bash.

---

## Scope Detection

Two scopes exist. Auto-detect which to use:

1. **Project scope**: `.planning/NOTES.md` — used when `.planning/` directory exists in cwd
2. **Global scope**: `~/.claude/notes.md` — used as fallback when no `.planning/`, or when `--global` flag is present

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

**Critical**: `list` is only a subcommand when it's the ENTIRE argument. `/dev:note list of groceries` saves a note with text "list of groceries". Same for `promote` — only a subcommand when followed by exactly one number.

---

## Subcommand: append

Append a timestamped note to the target file.

### Steps

1. Determine scope (project or global) per Scope Detection above
2. Read the target file if it exists
3. If the file doesn't exist, create it with this header:

```markdown
# Notes

Quick captures from `/dev:note`. Ideas worth remembering.

---

```

4. Ensure the file content ends with a newline before appending
5. Append: `- [YYYY-MM-DD HH:mm] {note text verbatim}`
6. Write the file
7. Confirm with exactly one line: `Noted ({scope}): {note text}`
   - Where `{scope}` is "project" or "global"

### Constraints

- **Never modify the note text** — capture verbatim, including typos
- **Never ask questions** — just write and confirm
- **Timestamp format**: Use local time, `YYYY-MM-DD HH:mm` (24-hour, no seconds)

---

## Subcommand: list

Show notes from both project and global scopes.

### Steps

1. Read `.planning/NOTES.md` (if exists) — these are "project" notes
2. Read `~/.claude/notes.md` (if exists) — these are "global" notes
3. Parse entries: lines matching `^- \[` are notes
4. Exclude lines containing `[promoted]` from active counts (but still show them, dimmed)
5. Number all active entries sequentially starting at 1 (across both scopes)
6. If total active entries > 20, show only the last 10 with a note about how many were omitted

### Display Format

```
Notes:

Project (.planning/NOTES.md):
  1. [2026-02-08 14:32] refactor the hook system to support async validators
  2. [promoted] [2026-02-08 14:40] add rate limiting to the API endpoints
  3. [2026-02-08 15:10] consider adding a --dry-run flag to build

Global (~/.claude/notes.md):
  4. [2026-02-08 10:00] cross-project idea about shared config

{count} active note(s). Use `/dev:note promote <N>` to convert to a todo.
```

If a scope has no file or no entries, show: `(no notes)`

---

## Subcommand: promote

Convert a note into a todo file.

### Steps

1. Run the **list** logic to build the numbered index (both scopes)
2. Find entry N from the numbered list
3. If N is invalid or refers to an already-promoted note, tell the user and stop
4. **Requires `.planning/` directory** — if it doesn't exist, warn: "Todos require a Towline project. Run `/dev:begin` to initialize one, or use `/dev:todo add` in an existing project."
5. Ensure `.planning/todos/pending/` directory exists
6. Generate todo ID: `{YYYYMMDD}-{NNN}` where NNN is sequential within the day (check existing files)
7. Extract the note text (everything after the timestamp)
8. Create `.planning/todos/pending/{id}.md`:

```yaml
---
id: {id}
area: general
priority: normal
created: {ISO-timestamp}
source: "promoted from /dev:note"
---

# {note text}

## Context
Promoted from quick note captured on {original date}.

## Notes
(empty)
```

9. Mark the original note as promoted: replace `- [` with `- [promoted] [` on that line
10. Confirm: `Promoted note {N} to todo {id}: {note text}`

---

## NOTES.md Format Reference

```markdown
# Notes

Quick captures from `/dev:note`. Ideas worth remembering.

---

- [2026-02-08 14:32] refactor the hook system to support async validators
- [promoted] [2026-02-08 14:40] add rate limiting to the API endpoints
- [2026-02-08 15:10] consider adding a --dry-run flag to build
```

---

## Edge Cases

1. **"list" as note text**: `/dev:note list of things` → saves note "list of things" (subcommand only when `list` is the entire arg)
2. **No `.planning/`**: Falls back to global `~/.claude/notes.md` — works in any directory
3. **Promote without project**: Warns that todos require `.planning/`, suggests `/dev:begin`
4. **Large files**: `list` shows last 10 when >20 active entries
5. **Missing newline**: Always ensure trailing newline before appending
6. **`--global` position**: Stripped from anywhere — `--global my idea` and `my idea --global` both save "my idea" globally
7. **Promote already-promoted**: Tell user "Note {N} is already promoted" and stop
8. **Empty note text after stripping flags**: Treat as `list` subcommand

---

## Anti-Patterns

1. **DO NOT** ask questions on append — just write and confirm
2. **DO NOT** modify note text — capture verbatim
3. **DO NOT** use Task, AskUserQuestion, or Bash
4. **DO NOT** create `.planning/` if it doesn't exist — fall back to global
5. **DO NOT** number promoted notes in the active count (but still display them)
6. **DO NOT** over-format the confirmation — one line is enough
