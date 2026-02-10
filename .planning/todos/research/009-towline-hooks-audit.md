# Towline Hooks Audit — Comprehensive Analysis

> Research conducted: 2026-02-10
> Research scope: Deep audit of Towline's EXISTING hook system
> Confidence: HIGH — all findings based on source code inspection

---

## Executive Summary

Towline implements 8 hooks across 8 lifecycle events, supported by 2 shared infrastructure modules (`hook-logger.js`, `towline-tools.js`) and 1 event logger (`event-logger.js`). The system is **functionally complete** for its current design goals: state tracking, validation, auto-continuation, and observability.

**Key findings:**
- **8 hook events used** out of 14 available in Claude Code
- **6 events NOT used**: UserPromptSubmit, PermissionRequest, PostToolUseFailure, Notification, TeammateIdle, TaskCompleted
- **All hooks use exit codes only** — none leverage the full JSON decision control available in Claude Code
- **No blocking PreToolUse hooks** — validate-commit warns but doesn't block on sensitive files
- **Workflow enforcement gaps** — gates (confirm_execute, confirm_plan) rely on skill prompt language, not hooks
- **No prompt-based or agent-based hooks** — all hooks are command scripts
- **No async hooks** — all hooks block the agentic loop (appropriate for current use cases)
- **Test coverage is good** — 3 of 8 hooks have comprehensive test files

**Bottom line**: The current hook system is solid for its narrow scope (logging, validation, auto-chaining). Major opportunities exist in **workflow enforcement** (blocking violations), **context management** (PreCompact injection), and **observability** (new event types, richer logging).

---

## 1. Hook Inventory

| Hook | Event | Matcher | Purpose | Exit Codes | JSON Output | Capability Summary |
|------|-------|---------|---------|------------|-------------|-------------------|
| **progress-tracker.js** | SessionStart | none | Inject STATE.md summary into new sessions | 0 only | additionalContext | ✅ Injects state<br>❌ Doesn't check staleness<br>❌ Doesn't validate config |
| **check-plan-format.js** | PostToolUse | Write\|Edit | Validate PLAN.md/SUMMARY.md structure | 0 only | message (warning) | ✅ Validates structure<br>❌ Doesn't block saves<br>❌ Async only |
| **check-roadmap-sync.js** | PostToolUse | Write\|Edit | Check ROADMAP.md ↔ STATE.md consistency | 0 only | message (warning) | ✅ Detects drift<br>❌ Doesn't block saves<br>❌ Async only |
| **validate-commit.js** | PreToolUse | Bash | Enforce commit message format | 0, 2 | decision (block) | ✅ Blocks invalid commits<br>✅ Warns on sensitive files<br>❌ Doesn't block sensitive files |
| **context-budget-check.js** | PreCompact | none | Save state before context compaction | 0 only | none | ✅ Preserves timestamp<br>❌ Doesn't inject preservation hints<br>❌ Doesn't save critical files |
| **auto-continue.js** | Stop | none | Chain commands via `.auto-next` signal | 0 only | command (continue) | ✅ Enables chaining<br>❌ No staleness check<br>❌ No loop detection beyond file deletion |
| **log-subagent.js** | SubagentStart, SubagentStop | none | Log agent lifecycle | 0 only | none | ✅ Logs to hooks.jsonl<br>✅ Logs to events.jsonl<br>❌ No duration tracking on start |
| **session-cleanup.js** | SessionEnd | none | Clean stale signal files | 0 only | none | ✅ Removes .auto-next<br>✅ Removes .active-operation<br>❌ No backup/archive |

**Legend:**
- ✅ = Implemented and working
- ❌ = Potential enhancement or missing feature

---

## 2. Per-Hook Deep Dive

### 2.1 progress-tracker.js (SessionStart)

**Event**: SessionStart (no matcher — fires on all startups)
**Purpose**: Load STATE.md summary into new session context

#### stdin Usage
Reads the full SessionStart JSON:
```json
{
  "session_id": "...",
  "source": "startup|resume|clear|compact",
  "model": "...",
  "permission_mode": "...",
  "hook_event_name": "SessionStart",
  "cwd": "...",
  "transcript_path": "..."
}
```

**Actually uses**: Only checks for `.planning/` directory existence. **Does NOT use** `source`, `model`, or `permission_mode` fields.

#### Logic Flow
1. Check if `.planning/` exists — if not, exit 0 silently (not a Towline project)
2. Read STATE.md, extract sections: Current Position, Blockers/Concerns, Session Continuity
3. Check for `.continue-here.md` files in phases/
4. Check config.json, extract depth/mode
5. Check NOTES.md (project + global) and count entries
6. **Staleness check (S>M-2)**: Compare STATE.md current phase against ROADMAP.md Progress table — warn if phase already shows "verified"
7. **Stale signal check (S>M-9)**: Check `.auto-next` modification time — warn if >10 minutes old
8. Build additionalContext string with all findings
9. Output JSON: `{"additionalContext": "..."}` + log to hooks.jsonl

#### Output
- **stdout (exit 0)**: JSON with `additionalContext` field — shown in session context
- **stderr**: None
- **logHook()**: 'injected' or 'skipped' with `{hasState: true/false}`

#### Edge Cases
1. **No STATE.md**: Shows "No STATE.md found. Run /dev:begin or /dev:status"
2. **Parse errors**: Silently ignores (try/catch with empty catch)
3. **Stale ROADMAP**: Warns but doesn't block session start
4. **Stale .auto-next**: Warns but doesn't delete the file (leaves it for session-cleanup.js)

#### What's Missing
- **No matcher for `source`**: Could customize injection based on startup vs. resume vs. compact
- **No active-operation check**: Could warn if `.active-operation` file exists (stale lock)
- **No config validation**: Could check if config.json is valid JSON before using it
- **No CLAUDE.md check**: Could inject excerpts from CLAUDE.md if present
- **No memory-bank check**: Towline doesn't use Claude Code's memory bank, but could

#### Performance
- Fast (reads 3-5 small files, no external commands)
- Appropriate for SessionStart (runs once per session)

---

### 2.2 check-plan-format.js (PostToolUse Write|Edit)

**Event**: PostToolUse
**Matcher**: `Write|Edit` (only fires when files are written or edited)
**Purpose**: Validate PLAN.md and SUMMARY.md structure

#### stdin Usage
Reads PostToolUse JSON:
```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file",
    "content": "..."
  },
  "tool_response": { ... },
  "tool_use_id": "..."
}
```

**Actually uses**: Only `tool_input.file_path`. **Does NOT use** `tool_response` or `tool_use_id`.

#### Logic Flow
1. Extract file_path from stdin JSON
2. Check if filename ends with `PLAN.md` or contains `SUMMARY` + ends with `.md`
3. If neither: exit 0 (not a plan/summary file)
4. If file doesn't exist: exit 0 (Write hook fires before file is saved — this is a race condition bug?)
5. Read file from disk
6. Run `validatePlan()` or `validateSummary()` based on filename
7. If issues found: log to hooks.jsonl + output JSON with warning message
8. Exit 0 (never blocks)

#### Validation Rules (validatePlan)
- ✅ Has YAML frontmatter (`---...---`)
- ✅ Frontmatter has `phase`, `plan`, `wave` fields
- ✅ Frontmatter has `must_haves` field
- ✅ Has 1-3 `<task>` elements (not 0, not 4+)
- ✅ Each task has `<name>`, `<files>`, `<action>`, `<verify>`, `<done>` elements
- ✅ Checkpoint tasks skip validation (detected via `checkpoint` in task tag)

#### Validation Rules (validateSummary)
- ✅ Has YAML frontmatter
- ✅ Frontmatter has `phase`, `plan`, `status`, `provides`, `requires`, `key_files` fields
- ✅ Warns (not errors) if missing `deferred` field
- ✅ Validates `key_files` paths exist on disk

#### Output
- **stdout (exit 0)**: JSON with `message` field (warning text) if issues found
- **stderr**: None
- **logHook()**: 'warn' or 'pass' with `{file: basename, issues: [...]}`

#### Edge Cases
1. **No frontmatter**: Reports "Missing YAML frontmatter"
2. **Unclosed frontmatter**: Reports "Unclosed YAML frontmatter"
3. **key_files path not found**: Reports per-file warning
4. **Checkpoint tasks**: Skips standard validation (correct behavior)
5. **Too many tasks**: Reports "Too many tasks: N (max 3 per plan)"
6. **Parse errors**: Silent exit 0 (try/catch with empty catch)

#### What's Missing
- **No blocking**: This hook NEVER blocks saves — it only warns after the fact
- **No JSON decision control**: Could use `hookSpecificOutput.additionalContext` to feed warnings to Claude
- **No matcher refinement**: Fires on ALL Write|Edit — could filter to `.planning/phases/` paths only
- **Race condition**: Hook fires after tool completes, but reads file from disk — if file write is delayed, hook sees old content or nothing
- **No PLAN.md version check**: Could validate frontmatter version field if present

#### Performance
- Fast (parses markdown, no external commands)
- Appropriate for PostToolUse (runs after every Write/Edit)

---

### 2.3 check-roadmap-sync.js (PostToolUse Write|Edit)

**Event**: PostToolUse
**Matcher**: `Write|Edit`
**Purpose**: Detect STATE.md ↔ ROADMAP.md drift

#### stdin Usage
Reads PostToolUse JSON, uses `tool_input.file_path` only.

#### Logic Flow
1. Check if file_path ends with `STATE.md` — if not, exit 0
2. Check if both STATE.md and ROADMAP.md exist — if not, exit 0
3. Read STATE.md, extract current phase number + status (parseState)
4. If status is NOT a lifecycle status (planned, built, partial, verified): exit 0
5. Read ROADMAP.md, find the row for current phase (getRoadmapPhaseStatus)
6. Compare STATE status vs ROADMAP status
7. If different: log + warn
8. Exit 0 (never blocks)

#### Parsing Logic (parseState)
- Extracts phase number from: `**Phase**: 03` or `Phase: 3` or `Current phase: 03-slug-name`
- Extracts status from: `**Status**: planned` or `Phase status: built`
- Returns `{phase: "3", status: "planned"}` (normalized)

#### Parsing Logic (getRoadmapPhaseStatus)
- Finds Phase Overview table in ROADMAP.md
- Locates Status column (case-insensitive)
- Returns status for matching phase number

#### Output
- **stdout (exit 0)**: JSON with `message` field if drift detected
- **stderr**: None
- **logHook()**: 'warn' or 'pass' or 'skip' with `{phase, stateStatus, roadmapStatus}` or `{reason}`

#### Edge Cases
1. **No ROADMAP.md**: Silent exit 0
2. **Phase not in ROADMAP**: Logs 'skip' with reason
3. **Non-lifecycle status**: Logs 'skip' (e.g., `in_progress`, `needs_review`, etc.)
4. **Parse errors**: Silent exit 0
5. **Case sensitivity**: Status comparison is case-insensitive (`.toLowerCase()`)

#### What's Missing
- **No blocking**: Warns after the fact, doesn't prevent STATE.md updates
- **No auto-fix**: Could write ROADMAP.md to sync status (requires PreToolUse hook on Write)
- **No ROADMAP.md write detection**: Only checks STATE.md writes — if ROADMAP.md is updated, no validation happens
- **No Progress table check**: Only checks Phase Overview table, not Progress table

#### Performance
- Fast (parses markdown, no external commands)
- Appropriate for PostToolUse

---

### 2.4 validate-commit.js (PreToolUse Bash)

**Event**: PreToolUse
**Matcher**: `Bash` (only fires on Bash tool calls)
**Purpose**: Enforce commit message format + warn on sensitive files

#### stdin Usage
Reads PreToolUse JSON:
```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "git commit -m \"...\""
  },
  "tool_use_id": "..."
}
```

**Actually uses**: Only `tool_input.command`.

#### Logic Flow
1. Check if command is a git commit: `/^git\s+commit\b/` test
2. Skip if `--amend --no-edit` (no message change)
3. Extract commit message from command:
   - Try `-m "message"` or `-m 'message'`
   - Try heredoc: `<<'EOF'\n...\nEOF`
4. If can't parse message: exit 0 (allow)
5. Check if message matches MERGE_PATTERN (`/^Merge\s/`): exit 0 (allow)
6. Validate against COMMIT_PATTERN: `/^(feat|fix|refactor|test|docs|chore|wip)(\([a-zA-Z0-9._-]+\))?:\s+.+/`
7. If invalid: log 'block' + output JSON decision + **exit 2 (BLOCKS)**
8. If valid: call `checkSensitiveFiles()` (warns but doesn't block)
9. Exit 0 (allow)

#### Sensitive File Detection
Runs `git diff --cached --name-only` to get staged files, checks against patterns:
- **Sensitive patterns**: `.env` (exact), `.env.*` (not .example), `.key`, `.pem`, `.pfx`, `.p12`, `/credential/i`, `/secret/i`
- **Safe patterns**: `.example`, `.template`, `.sample`, `tests/`
- If matched: outputs JSON warning + logs 'warn-sensitive' — **does NOT block (exit 0)**

#### Output
- **stdout (exit 0)**: JSON with `message` (warning) for sensitive files
- **stdout (exit 2)**: JSON with `decision: "block"`, `reason: "..."` for invalid format
- **stderr**: Not used
- **logHook()**: 'allow', 'block', or 'warn-sensitive' with `{message, reason, files}`

#### Edge Cases
1. **Merge commits**: Always allowed
2. **--amend --no-edit**: Skipped (no message check)
3. **Unparseable message**: Allowed (might be heredoc format we don't parse)
4. **git not available**: checkSensitiveFiles() fails silently (try/catch)
5. **Not in git repo**: checkSensitiveFiles() fails silently
6. **Empty command**: Exits 0

#### What's Missing
- **Doesn't block sensitive files**: Only warns — should use exit 2 for `.env`, credentials
- **No --no-verify detection**: Commits with `--no-verify` bypass pre-commit hooks — this hook doesn't warn about that
- **No AI co-author detection**: MEMORY.md says "never add AI co-author" but this hook doesn't check for it
- **No scope validation**: Accepts any scope format — could validate `{NN}-{MM}` or `quick-{NNN}` patterns
- **Heredoc parsing fragile**: Only extracts first line — multi-line commits with heredoc are half-validated

#### Performance
- Fast (regex matching + git command if valid commit)
- Appropriate for PreToolUse (runs before Bash executes)
- `git diff --cached` is fast for typical repo sizes

---

### 2.5 context-budget-check.js (PreCompact)

**Event**: PreCompact
**Matcher**: none
**Purpose**: Save state before lossy context compaction

#### stdin Usage
Reads PreCompact JSON (but doesn't actually use it):
```json
{
  "trigger": "manual|auto",
  "custom_instructions": "...",
  "session_id": "...",
  ...
}
```

**Actually uses**: None. Hook ignores stdin entirely.

#### Logic Flow
1. Check if `.planning/STATE.md` exists — if not, exit 0
2. Read STATE.md content
3. Read `.planning/.active-operation` if exists (for S>M-3 check)
4. Build continuity message: timestamp + compaction note + active operation
5. Update or append Session Continuity section in STATE.md
6. Write STATE.md back to disk
7. Log 'saved' or 'error'
8. Exit 0 (never blocks)

#### Session Continuity Section Format
```
## Session Continuity
Last session: 2026-02-10T15:30:00.000Z
Compaction occurred: context was auto-compacted at this point
Active operation at compaction: /dev:build 3
Note: Some conversation context may have been lost. Check STATE.md and SUMMARY.md files for ground truth.
```

#### Output
- **stdout**: None
- **stderr**: None
- **logHook()**: 'saved' with `{stateFile: 'STATE.md'}` or 'error' with `{error: message}`

#### Edge Cases
1. **No STATE.md**: Silent exit 0
2. **No .active-operation**: Omits that line from continuity message
3. **Parse errors**: Logs 'error', exits 0
4. **Write errors**: Logs 'error', exits 0

#### What's Missing
- **No stdin usage**: Could use `trigger` field to customize behavior (manual vs auto)
- **No custom_instructions injection**: PreCompact receives user's `/compact` instructions — could preserve those
- **No critical file backup**: Doesn't save PLAN.md, ROADMAP.md, or other critical files — only updates STATE.md
- **No JSON output**: Could use `additionalContext` to inject preservation hints for Claude after compaction
- **No phase context**: Could extract current phase from STATE.md and inject a reminder
- **No ROADMAP summary**: Could inject a brief ROADMAP summary to preserve phase structure
- **No config preservation**: Could inject key config values (mode, depth, gates)

#### Performance
- Very fast (reads/writes 1 file, no external commands)
- Appropriate for PreCompact (runs once per compaction)

---

### 2.6 auto-continue.js (Stop)

**Event**: Stop
**Matcher**: none
**Purpose**: Auto-chain commands via `.auto-next` signal file

#### stdin Usage
Reads Stop JSON (but doesn't actually use it — no validation):
```json
{
  "stop_hook_active": true/false,
  "session_id": "...",
  ...
}
```

**Actually uses**: None. Hook ignores stdin fields (including `stop_hook_active`).

#### Logic Flow
1. Check if `.planning/config.json` exists — if not, exit 0
2. Read config.json, check `features.auto_continue` — if false, exit 0
3. Check if `.planning/.auto-next` exists — if not, log 'no-signal' and exit 0
4. Read `.auto-next` content (the next command)
5. **DELETE .auto-next** (one-shot signal — retry unlink 3 times for Windows)
6. If command is empty: log 'empty-signal', exit 0
7. Output JSON: `{message: "...", command: "..."}` — tells Claude Code to run the command
8. Log 'continue' with `{next: command}`
9. Exit 0

#### Output
- **stdout (exit 0)**: JSON with `message` + `command` fields
- **stderr**: None
- **logHook()**: 'continue' or 'no-signal' or 'empty-signal' or 'unlink-failed'

#### Edge Cases
1. **No config.json**: Silent exit 0
2. **auto_continue disabled**: Silent exit 0
3. **No .auto-next**: Logs 'no-signal'
4. **Empty .auto-next**: Logs 'empty-signal' (command was blank)
5. **Unlink fails (Windows)**: Retries 3 times, logs 'unlink-failed' if all fail (but continues anyway)
6. **Parse errors**: Silent exit 0 (try/catch)

#### What's Missing
- **No staleness check**: `.auto-next` could be hours old — progress-tracker warns, but auto-continue doesn't check
- **No loop detection**: If a command writes `.auto-next` again, infinite loop is possible (mitigated by one-shot deletion)
- **No stdin validation**: `stop_hook_active` field is available but unused — could check if Stop hook is already active (loop detection)
- **No command validation**: Doesn't check if command is valid (e.g., `/dev:invalid`)
- **No context check**: Doesn't check if the command makes sense for current state (e.g., `/dev:build 99` when only 3 phases exist)

#### Performance
- Very fast (reads 1 file, deletes 1 file)
- Appropriate for Stop

---

### 2.7 log-subagent.js (SubagentStart, SubagentStop)

**Event**: SubagentStart, SubagentStop
**Matcher**: none
**Purpose**: Log agent lifecycle to hooks.jsonl + events.jsonl

#### stdin Usage
Reads SubagentStart/SubagentStop JSON:
```json
{
  "agent_id": "...",
  "agent_type": "dev:towline-executor",
  "subagent_type": "dev:towline-executor",  // fallback field
  "description": "...",
  "duration_ms": 12345  // only on Stop
}
```

**Actually uses**: All fields (agent_id, agent_type/subagent_type, description, duration_ms).

#### Logic Flow
1. Read argv[2] to determine action: 'start' or 'stop'
2. Read stdin, parse JSON (readStdin helper)
3. If 'start': log to hooks.jsonl ('spawned') + events.jsonl ('spawn')
4. If 'stop': log to hooks.jsonl ('completed') + events.jsonl ('complete')
5. Exit 0

#### Dual Logging
- **hooks.jsonl** (via logHook): `{ts, hook: 'log-subagent', event: 'SubagentStart', decision: 'spawned', agent_id, agent_type, description}`
- **events.jsonl** (via logEvent): `{ts, cat: 'agent', event: 'spawn', agent_id, agent_type, description}`

#### Output
- **stdout**: None
- **stderr**: None
- **logHook()**: 'spawned' or 'completed' with agent metadata
- **logEvent()**: 'spawn' or 'complete' in events.jsonl

#### Edge Cases
1. **Empty stdin**: readStdin returns `{}` — all fields become `null`
2. **Non-JSON stdin**: readStdin returns `{}` (try/catch)
3. **Missing agent_type**: Falls back to `subagent_type` field
4. **Missing description**: `null` is logged

#### What's Missing
- **No duration on start**: Could record start timestamp for later duration calculation
- **No parent tracking**: Could log which agent/session spawned this subagent
- **No error state**: SubagentStop doesn't indicate success/failure (could read stdin for error field)
- **No nesting depth**: Could track subagent nesting level (agent spawned by agent spawned by main)

#### Performance
- Very fast (2 log writes, no external commands)
- Appropriate for SubagentStart/Stop

---

### 2.8 session-cleanup.js (SessionEnd)

**Event**: SessionEnd
**Matcher**: none
**Purpose**: Clean stale signal files on session end

#### stdin Usage
Reads SessionEnd JSON:
```json
{
  "reason": "clear|logout|prompt_input_exit|bypass_permissions_disabled|other",
  "session_id": "...",
  ...
}
```

**Actually uses**: Only `reason` field (logs it, but doesn't condition behavior on it).

#### Logic Flow
1. Check if `.planning/` exists — if not, exit 0
2. Try to remove `.planning/.auto-next`
3. Try to remove `.planning/.active-operation`
4. Log 'cleaned' or 'nothing' with list of removed files
5. Exit 0

#### Output
- **stdout**: None
- **stderr**: None
- **logHook()**: 'cleaned' with `{reason, removed: [filenames]}` or 'nothing'

#### Edge Cases
1. **No .planning/**: Silent exit 0
2. **Files don't exist**: tryRemove returns false, not logged in removed list
3. **Remove fails**: tryRemove catches error, returns false (best-effort)
4. **Empty .planning/**: Logs 'nothing'

#### What's Missing
- **No backup/archive**: Could move files to `.planning/logs/cleanup-{timestamp}/` instead of deleting
- **No matcher for reason**: Could customize cleanup based on why session ended (e.g., don't clean on logout, do clean on clear)
- **No other file cleanup**: Could clean temp files, stale `.continue-here.md`, old hook logs
- **No validation**: Doesn't check if files SHOULD be cleaned (e.g., .auto-next might be valid for next session)

#### Performance
- Very fast (2 file deletions)
- Appropriate for SessionEnd

---

## 3. hooks.json Configuration Analysis

**Location**: `plugins/dev/hooks/hooks.json`
**Structure**: One top-level `hooks` object with event names as keys

### Configuration Quality
✅ **Well-structured**: Uses `${CLAUDE_PLUGIN_ROOT}` for cross-platform script paths
✅ **No redundancy**: Each event has exactly 1 matcher group
✅ **Matcher usage**:
  - PostToolUse: `Write|Edit` — appropriate (only validate file operations)
  - PreToolUse: `Bash` — appropriate (only validate git commits)
  - Others: no matcher — appropriate (always fire)

### Configuration Issues
❌ **No descriptions**: hooks.json has a top-level `description` field (line 2), but individual hooks don't have descriptions (this is fine — descriptions are optional)
❌ **No timeout overrides**: All hooks use default timeouts (10 minutes for command hooks) — might be too long for some
❌ **No async flags**: No hooks use `async: true` — all block the agentic loop (appropriate for current use cases, but limits potential)

### Path Expansion Verification
✅ `${CLAUDE_PLUGIN_ROOT}` works on Windows (confirmed in MEMORY.md)
✅ No hardcoded separators (`/` vs `\`)
✅ All script paths are relative to plugin root

---

## 4. Shared Infrastructure

### 4.1 hook-logger.js

**Purpose**: Centralized logging for all hooks

#### API
```javascript
const { logHook } = require('./hook-logger');
logHook(hookName, eventType, decision, details = {});
```

#### Features
- ✅ JSONL format (one JSON object per line)
- ✅ Auto-rotation at 200 entries (keeps last 200)
- ✅ ISO timestamps
- ✅ Auto-creates `logs/` directory
- ✅ One-time migration from old `.hook-log` to new `logs/hooks.jsonl`
- ✅ Best-effort (never fails the hook on log errors)
- ✅ Schema: `{ts, hook, event, decision, ...details}`

#### Limitations
- ❌ No log level (all logs are treated equally)
- ❌ No log filtering (can't query by hook or event without reading full file)
- ❌ No log compression (old entries are dropped, not archived)
- ❌ 200-entry limit might be too small for high-frequency events (SubagentStart/Stop)

#### Quality
✅ Comprehensive test coverage (hook-logger.test.js)
✅ Handles missing .planning/ gracefully
✅ Cross-platform (uses path.join, no hardcoded separators)

---

### 4.2 towline-tools.js

**Purpose**: Structured JSON state operations for skills and hooks

#### Commands
- `state load` — Full project state as JSON (config + state + roadmap + progress)
- `state check-progress` — Recalculate progress from filesystem
- `plan-index <phase>` — Plan inventory for a phase, grouped by wave
- `event <category> <event> [JSON]` — Log to events.jsonl (via event-logger)

#### Used By
- Hooks: No hooks currently use towline-tools (could be used in PreCompact, SessionStart)
- Skills: build, plan, status, review, milestone (via Bash tool)

#### Features
- ✅ Returns JSON (no LLM parsing needed)
- ✅ Graceful fallback if script missing
- ✅ Cross-platform (path.join everywhere)
- ✅ Parses YAML frontmatter (simple parser, not full YAML spec)
- ✅ Calculates progress from filesystem
- ✅ Determines phase status (planned, building, built, verified, etc.)

#### Limitations
- ❌ No caching (re-parses files every call)
- ❌ YAML parser is custom (not a standard library — could miss edge cases)
- ❌ No error codes (all errors return `{error: "..."}` JSON — caller must check)

#### Quality
✅ Comprehensive test coverage (towline-tools.test.js + integration.test.js)
✅ Exported functions for testing (parseStateMd, parseRoadmapMd, etc.)

---

### 4.3 event-logger.js

**Purpose**: Workflow event logging separate from hook execution logs

#### API
```javascript
const { logEvent } = require('./event-logger');
logEvent(category, event, details = {});
```

#### Categories
- `agent` — agent spawn, complete
- `workflow` — phase-start, plan-complete, etc. (not yet used by hooks)

#### Features
- ✅ JSONL format
- ✅ Auto-rotation at 1000 entries (5x more than hooks.jsonl)
- ✅ ISO timestamps
- ✅ Schema: `{ts, cat, event, ...details}`
- ✅ Used by log-subagent.js (dual logging)

#### Limitations
- ❌ Only used by log-subagent.js — no other hooks log events
- ❌ No workflow events logged (phase transitions, plan completions, gate passes)
- ❌ Same limitations as hook-logger (no log level, no filtering, no compression)

#### Quality
✅ Comprehensive test coverage (event-logger.test.js)
✅ Mirrors hook-logger architecture (consistent design)

---

## 5. Gap Analysis

### 5.1 Unused Hook Events (6 of 14)

| Event | What It Does | Why Towline Doesn't Use It | Opportunity |
|-------|--------------|---------------------------|-------------|
| **UserPromptSubmit** | Fires before Claude processes user prompt | Towline doesn't filter/validate user input | Could add workflow reminders ("You're in phase 3, did you mean to work on phase 4?") |
| **PermissionRequest** | Fires when permission dialog shown | Towline doesn't auto-approve permissions | Could auto-approve safe operations (Read, Glob in .planning/) |
| **PostToolUseFailure** | Fires when tool execution fails | Towline doesn't react to failures | Could log failures, suggest /dev:debug, or auto-pause |
| **Notification** | Fires on notifications (permission, idle, auth) | Towline doesn't react to notifications | Could log idle events, send external alerts |
| **TeammateIdle** | Fires when agent team teammate goes idle | Towline doesn't use agent teams yet | Future: enforce quality gates before teammate stops |
| **TaskCompleted** | Fires when task marked complete | Towline doesn't use TaskUpdate tool | Future: if Towline adds task tracking UI |

**Priority ranking**:
1. **PostToolUseFailure** (HIGH) — Would catch executor failures, suggest recovery
2. **UserPromptSubmit** (MEDIUM) — Could prevent workflow confusion
3. **PermissionRequest** (LOW) — Most operations are in autonomous mode already
4. **Notification** (LOW) — Nice-to-have for observability
5. **TeammateIdle** (FUTURE) — When agent teams are adopted
6. **TaskCompleted** (FUTURE) — When task tracking is added

---

### 5.2 JSON Decision Control Gaps

**Current state**: Only validate-commit.js uses exit code 2 to block. No hooks use the full JSON decision control schema.

**Available but unused**:
- **PreToolUse**: `permissionDecision` (allow/deny/ask), `updatedInput`, `additionalContext`
- **PostToolUse**: `decision` (block), `additionalContext`, `updatedMCPToolOutput`
- **Stop**: `decision` (block), `reason`
- **SessionStart**: `additionalContext`
- **PreCompact**: (no decision control, but could use stdin fields)

**Opportunities**:
1. **validate-commit.js** could use `permissionDecision: "deny"` instead of exit 2 (more explicit)
2. **check-plan-format.js** could use `additionalContext` to feed warnings to Claude instead of just logging
3. **check-roadmap-sync.js** could use `additionalContext` to remind Claude to sync ROADMAP
4. **context-budget-check.js** could use `additionalContext` to inject preservation hints after PreCompact
5. **auto-continue.js** already uses `command` field (correct usage)

**Priority**: MEDIUM — current exit code approach works, but JSON decision control is more explicit and testable

---

### 5.3 Workflow Enforcement Gaps

**Current state**: Gates (confirm_execute, confirm_plan, etc.) rely on skill prompt language. If a skill skips the gate check, nothing enforces it.

**Example**: `/dev:quick` recently had a bug where it skipped the workflow (direct code writing instead of spawning executor). No hook prevented this.

**Missing enforcement**:
1. **PreToolUse Bash hook for /dev:quick**: Block direct Write/Edit from quick skill unless .planning/quick/{NNN}-{slug}/PLAN.md exists
2. **PreToolUse Write hook for .planning/phases/**: Block direct edits to PLAN.md files (must go through /dev:plan)
3. **PreToolUse Bash hook for git commit**: Validate phase-plan scope format `{NN}-{MM}`, not just type
4. **PostToolUse Write hook for STATE.md**: Validate STATE.md structure (has Current Position, Progress, etc.)
5. **SessionStart hook**: Block session if STATE.md is in invalid state (e.g., phase 99 when only 3 phases exist)

**Priority**: HIGH — Workflow enforcement is a key value prop of Towline. Relying on prompt language alone is fragile.

---

### 5.4 Observability Gaps

**Current state**: hooks.jsonl logs 8 hook types, events.jsonl logs agent lifecycle only.

**Missing events**:
1. **Workflow milestones**: phase-start, phase-complete, milestone-start, milestone-complete
2. **Plan lifecycle**: plan-created, plan-started, plan-completed, plan-verified
3. **Gate events**: gate-confirm-roadmap, gate-confirm-execute, gate-issues-review
4. **Error events**: executor-failure, verifier-gaps-found, integration-checker-failure
5. **Context events**: context-low, context-compact-triggered, context-restored
6. **Tool failures**: No PostToolUseFailure hook means tool failures aren't logged

**Priority**: MEDIUM — Current logging is sufficient for debugging, but workflow event log would help with analytics and dashboards

---

### 5.5 Context Management Gaps

**Current state**: context-budget-check.js only updates STATE.md. No hooks inject context to preserve critical information.

**Missing opportunities**:
1. **PreCompact**: Inject ROADMAP summary (phase list, current phase, progress %)
2. **PreCompact**: Inject config.json summary (mode, depth, gates)
3. **PreCompact**: Inject active phase context (current plan, next plan, blockers)
4. **PreCompact**: Inject references to critical files (VERIFICATION.md, SUMMARY.md for current phase)
5. **SessionStart (compact source)**: Inject "You were compacted during phase X, plan Y — here's what you were working on"

**Priority**: HIGH — Context preservation is critical for long-running workflows. Current STATE.md update is minimal.

---

### 5.6 Blocking vs. Warning Gaps

**Current state**: Most hooks warn but don't block. Only validate-commit.js blocks (on invalid format).

**Should block but doesn't**:
1. **validate-commit.js**: Sensitive files (.env, credentials) — currently warns, should block
2. **check-plan-format.js**: Invalid PLAN.md structure — currently warns, should block save
3. **check-roadmap-sync.js**: STATE/ROADMAP drift — currently warns, could block STATE write until ROADMAP is synced
4. **session-cleanup.js**: Stale .auto-next — currently deletes, could warn user instead

**Trade-offs**:
- Blocking hooks are more disruptive (Claude must fix the issue before proceeding)
- Warning hooks are more forgiving (Claude can ignore warnings)
- Current design favors warnings (async PostToolUse) over blocking (sync PreToolUse)

**Recommendation**: Add blocking PreToolUse hooks for critical violations (sensitive files, PLAN.md structure), keep warnings for minor issues (ROADMAP drift).

---

## 6. Workflow Enforcement Opportunities

### 6.1 /dev:quick Workflow Enforcement

**Problem**: `/dev:quick` recently skipped its workflow (wrote code directly instead of spawning executor). No hook prevented this.

**Root cause**: Skill prompt language is the only enforcement — if prompt is ambiguous or LLM misreads, workflow breaks.

**Hook solution**: PreToolUse Write|Edit hook that checks:
1. If current skill is `/dev:quick` (how to detect? check `.planning/.active-operation` or transcript?)
2. If Write/Edit target is in project source (not `.planning/`)
3. If PLAN.md exists for current quick task
4. If not: block with message "Quick tasks must create PLAN.md first. Run /dev:quick to create a plan."

**Implementation**:
```javascript
// PreToolUse Write|Edit hook
// Check if this is a /dev:quick operation
const activeOp = readFile('.planning/.active-operation'); // e.g., "/dev:quick fix-auth-bug"
if (activeOp.startsWith('/dev:quick')) {
  const targetFile = toolInput.file_path;
  if (!targetFile.includes('.planning/')) {
    // Writing to source code — check if PLAN.md exists
    const quickDirs = glob('.planning/quick/*/');
    const latestQuickDir = quickDirs[quickDirs.length - 1];
    const planExists = fileExists(`${latestQuickDir}/PLAN.md`);
    if (!planExists) {
      // BLOCK
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Quick task must create PLAN.md first. Complete Step 6 of /dev:quick workflow."
        }
      };
    }
  }
}
```

**Challenges**:
- How to detect active skill? `.active-operation` file doesn't exist (only mentioned in CLAUDE.md)
- Alternative: check transcript for last /dev:* command (fragile)
- Alternative: require skills to write `.planning/.current-skill` file

---

### 6.2 Gate Enforcement

**Problem**: Gates (confirm_execute, confirm_plan, etc.) rely on skill prompt language. If skill skips the check, nothing enforces it.

**Config.json gates**:
```json
"gates": {
  "confirm_project": true,
  "confirm_roadmap": true,
  "confirm_plan": true,
  "confirm_execute": false,
  "confirm_transition": true,
  "issues_review": true
}
```

**Hook solution**: PreToolUse Bash hook for `/dev:build` that checks:
1. If `gates.confirm_execute` is true
2. If `.planning/.gate-confirmed-execute-{phase}` file exists
3. If not: block with message "Gate check required: confirm_execute is enabled. Skill must ask user before proceeding."

**Challenge**: Detecting which skill is running (same issue as 6.1)

---

### 6.3 Phase Boundary Enforcement

**Problem**: Skills could accidentally work on wrong phase (e.g., edit phase 4 files when phase 2 is active in STATE.md).

**Hook solution**: PreToolUse Write|Edit hook that checks:
1. Read STATE.md current phase
2. Check if Write/Edit target is in `.planning/phases/{NN}-*/`
3. If NN != current phase: warn (or block?) with message "You're modifying phase NN files, but STATE.md shows phase M is active. Is this intentional?"

**Trade-off**: Might be too restrictive (e.g., planner might need to update multiple phases at once). Could be opt-in via config flag `safety.enforce_phase_boundaries`.

---

### 6.4 Must-Haves Validation

**Problem**: Executor completes plans without verifying must_haves are met. Verifier checks later, but executor should check inline.

**Current state**: check-plan-format.js validates that `must_haves` field exists, but doesn't validate its contents or check if they're met.

**Hook solution**: PostToolUse Bash hook after executor commits that:
1. Reads PLAN.md must_haves
2. For each truth: (can't auto-verify — requires human or verifier agent)
3. For each artifact: check if file exists
4. For each key_link: check if code reference exists (grep)
5. If any missing: warn executor with `additionalContext`

**Better solution**: This belongs in the executor agent's verification step, not in a hook. Hooks should enforce that verification HAPPENED, not do the verification themselves.

---

### 6.5 Autonomous Flag Enforcement

**Problem**: Plans with `autonomous: false` should require human confirmation, but executor doesn't check this.

**Hook solution**: PreToolUse Task hook (if Task spawns towline-executor) that:
1. Reads PLAN.md autonomous flag
2. If false and no `.planning/.human-confirmed-{plan}` file: block with message "This plan requires human confirmation. Set autonomous: true or run with --confirm flag."

**Challenge**: Detecting subagent type from PreToolUse Task is possible (tool_input has subagent_type field).

---

## 7. Context Management Opportunities

### 7.1 PreCompact Context Injection

**Current state**: context-budget-check.js only updates STATE.md Session Continuity section. Doesn't inject anything into Claude's context after compaction.

**Opportunity**: Use `hookSpecificOutput.additionalContext` in PreCompact hook to inject:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": "CONTEXT PRESERVATION NOTICE:\n\nYou were auto-compacted during Phase 3: API Routes.\nCurrent progress: 67% (14 of 21 plans complete).\nActive plan: 03-05 (JWT middleware).\nNext plan: 03-06 (Rate limiting).\n\nKey files:\n- .planning/STATE.md (source of truth)\n- .planning/phases/03-api-routes/SUMMARY-03-05.md (last completed work)\n- .planning/phases/03-api-routes/03-06-PLAN.md (next work)\n\nConfig: mode=autonomous, depth=comprehensive, gates=confirm_transition."
  }
}
```

**Note**: PreCompact hooks don't support `additionalContext` in the official docs (checked Claude Code docs). This might be a Towline-specific extension, or the docs are incomplete.

**Alternative**: Update STATE.md with richer Session Continuity section, rely on progress-tracker.js to inject it on next session.

---

### 7.2 SessionStart (compact source) Custom Injection

**Current state**: progress-tracker.js injects STATE.md summary for all session starts (startup, resume, clear, compact).

**Opportunity**: Customize injection based on `source` field:
- `startup`: Full injection (current)
- `resume`: Inject paused work context (`.continue-here.md` files)
- `clear`: Inject reminder that previous conversation was cleared
- `compact`: Inject **richer** context since details were just lost

**Implementation**: progress-tracker.js already gets `source` from stdin but ignores it. Add branching logic:

```javascript
const source = data.source || 'startup';
if (source === 'compact') {
  // Inject richer context for post-compaction
  parts.push('\n[COMPACTION RECOVERY MODE]');
  parts.push('Your conversation was just compacted. Review STATE.md carefully.');
  parts.push('Recent work: ' + getRecentWorkSummary()); // read last 3 SUMMARY.md files
  parts.push('Next steps: ' + getNextPlanSummary()); // read next PLAN.md
}
```

---

### 7.3 Context Budget Warning Hook

**Problem**: Towline relies on skills warning about context budget ("Context is getting full, consider /dev:pause"). No hook enforces this.

**Opportunity**: PostToolUse hook (fires after every tool) that:
1. Reads transcript file size or line count
2. If > 80% of typical context limit (estimated): inject warning
3. Use `additionalContext` to remind Claude: "Context budget is high. Consider pausing soon."

**Challenge**: Measuring context usage is hard (no API for it). Proxy: transcript size, tool call count, or session duration.

**Better solution**: Claude Code might expose context usage via hook stdin in the future. Check docs for updates.

---

## 8. Observability Opportunities

### 8.1 Workflow Event Logging

**Current state**: events.jsonl only logs agent lifecycle. No workflow events.

**Opportunity**: Add logEvent() calls to hooks for workflow milestones:

| Event | Where to Log | Details |
|-------|-------------|---------|
| `phase-start` | SessionStart hook (detect phase transition) | `{phase, name, goal}` |
| `phase-complete` | PostToolUse Write for VERIFICATION.md (status=passed) | `{phase, plans_completed, duration}` |
| `plan-start` | SubagentStart (if agent_type=towline-executor) | `{phase, plan, wave}` |
| `plan-complete` | PostToolUse Write for SUMMARY.md (status=complete) | `{phase, plan, provides, requires}` |
| `gate-confirm` | PreToolUse Bash (detect AskUserQuestion in transcript?) | `{gate_type, confirmed}` |
| `executor-failure` | PostToolUseFailure (if tool=Task, agent=executor) | `{phase, plan, error}` |

**Implementation**: Add to existing hooks or create new PostToolUse hooks for specific files.

---

### 8.2 Dashboard Integration

**Current state**: Towline Dashboard (test project) exists but has no hooks integration.

**Opportunity**: Hook events feed dashboard in real-time:
1. events.jsonl is read by dashboard backend
2. Server-Sent Events (SSE) push events to dashboard UI
3. Dashboard shows live agent activity, phase progress, recent events

**Requirements**:
- Dashboard must watch `.planning/logs/events.jsonl` (file-watch or polling)
- events.jsonl must be structured (already is — JSONL)
- events.jsonl must have enough detail (needs workflow events from 8.1)

---

### 8.3 Hook Performance Metrics

**Current state**: hooks.jsonl logs decision + details, but no timing.

**Opportunity**: Log hook execution time:
```json
{
  "ts": "...",
  "hook": "validate-commit",
  "event": "PreToolUse",
  "decision": "allow",
  "duration_ms": 45
}
```

**Implementation**: Add `startTime = Date.now()` before hook execution, `duration_ms = Date.now() - startTime` after, include in logHook() call.

**Use case**: Detect slow hooks, optimize critical path (PreToolUse is synchronous, so slow hooks block agentic loop).

---

### 8.4 PostToolUseFailure Hook for Error Logging

**Current state**: No hook fires on tool failures. Errors are only visible in transcript.

**Opportunity**: PostToolUseFailure hook that:
1. Logs all tool failures to events.jsonl
2. Categorizes failures (Bash exit code, Write permission denied, Read file not found, etc.)
3. Suggests recovery actions via `additionalContext` (e.g., "Bash command failed. Run /dev:debug to investigate.")

**Implementation**: New hook script `log-tool-failure.js`:

```javascript
// PostToolUseFailure hook
const data = JSON.parse(readStdin());
const toolName = data.tool_name;
const error = data.error;
const isInterrupt = data.is_interrupt;

logEvent('tool', 'failure', {
  tool: toolName,
  error: error,
  interrupt: isInterrupt
});

if (toolName === 'Bash' && !isInterrupt) {
  // Suggest debugging
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: "Bash command failed. Consider running /dev:debug to investigate systematically."
    }
  };
}
```

---

## 9. Advanced Hook Features (Not Used)

### 9.1 Prompt-Based Hooks

**What it is**: Hook runs an LLM prompt instead of a shell command. LLM evaluates JSON input, returns `{ok: true/false, reason: "..."}`.

**Example use case**: Stop hook that asks LLM "Are all tasks complete?" before allowing Claude to stop.

**Why Towline doesn't use it**: Towline's hooks are deterministic (validate format, check file existence, log). No LLM evaluation needed.

**Future opportunity**: Could use prompt-based hook for:
- **Stop hook**: "Check if current phase is complete before stopping"
- **UserPromptSubmit hook**: "Is this prompt asking to work outside current phase?"

**Trade-off**: Adds LLM call latency + cost to every hook invocation. Only use for complex validation.

---

### 9.2 Agent-Based Hooks

**What it is**: Hook spawns a subagent with tools (Read, Grep, Glob) to investigate before deciding. Up to 50 turns.

**Example use case**: Stop hook that runs tests, reads output, and blocks if tests fail.

**Why Towline doesn't use it**: Towline's validation is simpler (regex, file existence). Agent-based hooks are overkill.

**Future opportunity**: Could use agent-based hook for:
- **TaskCompleted hook**: Spawn verifier agent to check must_haves before marking task complete
- **Stop hook**: Spawn integration-checker agent to verify phase is truly complete

**Trade-off**: High latency (agent can take 30+ seconds), high cost (50 turns max). Only use for complex validation that requires code inspection.

---

### 9.3 Async Hooks

**What it is**: Hook runs in background (`async: true`), doesn't block agentic loop. Results delivered on next conversation turn.

**Example use case**: PostToolUse hook that runs test suite after file save (tests take 2 minutes, don't want to block Claude).

**Why Towline doesn't use it**: All current hooks are fast (<1 second). No need for async.

**Future opportunity**: Could use async hook for:
- **PostToolUse Write**: Run linter/formatter in background after save
- **PostToolUse Bash (git commit)**: Run CI/CD pipeline trigger in background
- **SessionEnd**: Archive session transcript to external storage

**Trade-off**: Can't block or return decisions (action already proceeded). Only useful for side effects (logging, notifications, external triggers).

---

## 10. Recommendations

### 10.1 Immediate (High Priority)

1. **Add PostToolUseFailure hook** (`log-tool-failure.js`)
   - Log all tool failures to events.jsonl
   - Suggest `/dev:debug` on Bash failures
   - Estimate: 30 minutes, high value for debugging

2. **Block sensitive files in validate-commit.js**
   - Change exit 0 to exit 2 when `.env`, credentials matched
   - Update tests to verify blocking
   - Estimate: 15 minutes, high value for safety

3. **Enhance context-budget-check.js (PreCompact)**
   - Save ROADMAP summary to STATE.md (not just timestamp)
   - Save current phase + next plan to STATE.md
   - Estimate: 45 minutes, high value for context preservation

4. **Enhance progress-tracker.js (SessionStart, compact source)**
   - Customize injection based on `source` field
   - Inject richer context for post-compaction sessions
   - Estimate: 30 minutes, medium value (context recovery)

---

### 10.2 Short-Term (Medium Priority)

5. **Add workflow event logging**
   - Extend existing hooks to log phase-start, plan-complete, etc. to events.jsonl
   - Create new PostToolUse hooks for VERIFICATION.md, SUMMARY.md writes
   - Estimate: 2 hours, medium value (dashboard integration, analytics)

6. **Add phase boundary enforcement hook**
   - PreToolUse Write|Edit hook warns if editing wrong phase
   - Make opt-in via `safety.enforce_phase_boundaries` config flag
   - Estimate: 1 hour, medium value (prevents confusion)

7. **Add hook performance metrics**
   - Add `duration_ms` to logHook() calls
   - Requires hook infrastructure change (wrap all hook calls)
   - Estimate: 1 hour, low value (nice-to-have for optimization)

---

### 10.3 Long-Term (Low Priority / Research)

8. **Explore UserPromptSubmit hook**
   - Research: Can we detect workflow violations from user prompt alone?
   - Prototype: Hook that warns "You're in phase 3, but asking about phase 4 features"
   - Estimate: 4 hours, speculative value

9. **Explore gate enforcement hooks**
   - Requires `.current-skill` or `.active-operation` file (doesn't exist yet)
   - Blocks PreToolUse Bash when gate not confirmed
   - Estimate: 6 hours, medium value (workflow safety)

10. **Explore prompt-based or agent-based hooks**
    - Research: What validation requires LLM evaluation?
    - Prototype: Stop hook that asks LLM "Is phase complete?"
    - Estimate: 8 hours, speculative value (might be overkill)

---

## 11. Testing Gaps

### Current Test Coverage
✅ **validate-commit.test.js** — Comprehensive (valid/invalid formats, edge cases)
✅ **hook-logger.test.js** — Comprehensive (JSONL, rotation, migration)
✅ **check-plan-format.test.js** — Comprehensive (PLAN.md, SUMMARY.md validation)
✅ **check-roadmap-sync.test.js** — Adequate (parsing, matching)
✅ **towline-tools.test.js** — Comprehensive (state load, plan index, parsers)

❌ **No tests for**:
- progress-tracker.js
- context-budget-check.js
- auto-continue.js
- log-subagent.js
- session-cleanup.js

### Recommended Test Additions
1. **progress-tracker.test.js** — Test STATE.md extraction, staleness checks
2. **context-budget-check.test.js** — Test Session Continuity update logic
3. **auto-continue.test.js** — Test .auto-next read/delete, config checks
4. **integration-hooks.test.js** — End-to-end test: trigger hooks via mock stdin

**Estimate**: 4 hours for full test coverage of remaining hooks

---

## Appendix: Claude Code Hook Reference Summary

**14 Available Events**:
1. SessionStart ✅ (used)
2. UserPromptSubmit ❌ (unused)
3. PreToolUse ✅ (used)
4. PermissionRequest ❌ (unused)
5. PostToolUse ✅ (used)
6. PostToolUseFailure ❌ (unused)
7. Notification ❌ (unused)
8. SubagentStart ✅ (used)
9. SubagentStop ✅ (used)
10. Stop ✅ (used)
11. TeammateIdle ❌ (unused)
12. TaskCompleted ❌ (unused)
13. PreCompact ✅ (used)
14. SessionEnd ✅ (used)

**Hook Types**:
- Command hooks (`type: "command"`) ✅ All 8 hooks use this
- Prompt hooks (`type: "prompt"`) ❌ None use this
- Agent hooks (`type: "agent"`) ❌ None use this

**Decision Control**:
- Exit code 0 (allow) ✅ All hooks use
- Exit code 2 (block) ✅ validate-commit.js only
- JSON `decision` field ❌ None use (validate-commit uses exit 2 instead)
- JSON `hookSpecificOutput` ❌ None use
- JSON `additionalContext` ❌ None use (progress-tracker.js is close — uses top-level field)

---

## Sources

All findings based on direct source code inspection:
- [S1] `plugins/dev/hooks/hooks.json`
- [S1] `plugins/dev/scripts/*.js` (8 hook scripts)
- [S1] `tests/*.test.js` (5 test files covering hooks)
- [S1] `.planning/config.json` (workflow configuration)
- [S2] Official Claude Code hooks documentation: https://code.claude.com/docs/en/hooks

---

**End of audit.**
