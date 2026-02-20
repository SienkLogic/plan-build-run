# pbr-tools.js CLI Reference

Command-line interface for structured JSON operations on `.planning/` state.
Skills and agents call this via Bash to avoid token-expensive text parsing.

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js <command> [args]
```

All commands output JSON to stdout. Errors output JSON with an `error` field to stderr (exit code 1).

---

## State Commands

### `state load`

Returns full project state as a single JSON object.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state load
```

**Output:**
```json
{
  "exists": true,
  "config": { ... },        // config.json contents
  "state": {                 // STATE.md frontmatter + parsed body
    "version": 2,
    "current_phase": "1",
    "status": "building",
    "progress_percent": 45,
    "last_activity": "2025-01-15",
    "last_command": "/pbr:build",
    "blockers": []
  },
  "roadmap": {               // Parsed ROADMAP.md
    "phases": [{ "number": "01", "name": "...", "status": "planned", ... }]
  },
  "phase_count": 3,
  "current_phase": "1",
  "progress": { "phases": [...], "total_plans": 5, "completed_plans": 2, "percentage": 40 }
}
```

### `state check-progress`

Recalculates progress from filesystem (plan files, summaries, verification).

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state check-progress
```

**Output:**
```json
{
  "phases": [
    { "directory": "01-setup", "plans": 2, "summaries": 2, "completed": 2, "has_verification": true, "status": "verified" }
  ],
  "total_plans": 5,
  "completed_plans": 3,
  "percentage": 60
}
```

### `state update <field> <value>`

Atomically updates a single field in STATE.md. Uses file locking.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update current_phase 2
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update status building
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update last_activity now   # auto-timestamps
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update plans_complete 3
```

**Valid fields:** `current_phase`, `status`, `plans_complete`, `last_activity`

**Output:** `{ "success": true, "field": "status", "value": "building" }`

---

## Config Commands

### `config validate`

Validates `config.json` against the JSON schema. Detects both schema violations and semantic conflicts.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config validate
```

**Output:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["features.auto_continue=true with mode=interactive: auto_continue only fires in autonomous mode"]
}
```

### `config resolve-depth [dir]`

Resolves the effective depth profile by merging base profile with user overrides.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth /path/to/.planning
```

**Output:** Full depth profile object with all resolved values (research rounds, plan detail level, verification depth, etc.)

---

## Plan & Phase Commands

### `plan-index <phase>`

Returns plan inventory for a phase, grouped by wave.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js plan-index 1
```

**Output:**
```json
{
  "phase": "01-setup",
  "total_plans": 3,
  "plans": [
    {
      "file": "PLAN-01.md",
      "plan_id": "01",
      "wave": 1,
      "type": "feature",
      "autonomous": true,
      "depends_on": [],
      "gap_closure": false,
      "has_summary": true,
      "must_haves_count": 4
    }
  ],
  "waves": { "wave_1": ["01", "02"], "wave_2": ["03"] }
}
```

### `phase-info <phase>`

Comprehensive single-phase status combining roadmap, filesystem, and plan data.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js phase-info 1
```

**Output:**
```json
{
  "phase": "01-setup",
  "name": "setup",
  "goal": "Initialize project infrastructure",
  "roadmap_status": "building",
  "filesystem_status": "partial",
  "plans": [...],
  "plan_count": 3,
  "summaries": [{ "file": "SUMMARY-01.md", "plan": "01", "status": "complete" }],
  "completed": 1,
  "verification": null,
  "has_context": false
}
```

### `must-haves <phase>`

Collects all must-haves from phase plans — truths, artifacts, and key links.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js must-haves 1
```

**Output:**
```json
{
  "phase": "01-setup",
  "plans": {
    "01": { "truths": ["..."], "artifacts": ["..."], "key_links": ["..."] }
  },
  "all": { "truths": [...], "artifacts": [...], "key_links": [...] },
  "total": 12
}
```

---

## Frontmatter Command

### `frontmatter <filepath>`

Parses a markdown file's YAML frontmatter and returns as JSON.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js frontmatter .planning/phases/01-setup/PLAN-01.md
```

**Output:** The frontmatter fields as a JSON object. Returns `{ "error": "File not found: ..." }` if the file doesn't exist.

---

## Roadmap Commands

### `roadmap update-status <phase> <status>`

Updates the Status column for a phase in ROADMAP.md's Phase Overview table. Uses file locking. Warns on invalid status transitions but does not block them.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status 1 building
```

**Valid statuses:** `pending`, `planned`, `building`, `built`, `partial`, `needs_fixes`, `verified`, `skipped`

**Output:** `{ "success": true, "old_status": "planned", "new_status": "building" }`

### `roadmap update-plans <phase> <complete> <total>`

Updates the Plans column (e.g., "2/5") for a phase in ROADMAP.md.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-plans 1 2 5
```

**Output:** `{ "success": true, "old_plans": "1/5", "new_plans": "2/5" }`

---

## History Commands

### `history append <type> <title> [body]`

Appends a record to HISTORY.md. Creates the file if it doesn't exist.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js history append milestone "v1.0 Release" "Initial release with core features"
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js history append phase "01-setup Complete" "3 plans executed, all verified"
```

**Types:** `milestone`, `phase`

**Output:** `{ "success": true }`

### `history load`

Loads all HISTORY.md records as structured JSON.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js history load
```

**Output:**
```json
{
  "records": [
    { "type": "milestone", "title": "v1.0 Release", "date": "2025-01-15", "body": "..." }
  ],
  "line_count": 42
}
```

Returns `null` if HISTORY.md doesn't exist.

---

## Event Command

### `event <category> <event> [JSON-details]`

Logs a structured event to `.planning/logs/events.jsonl`.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js event build plan-complete '{"plan":"01","phase":"01-setup"}'
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js event error hook-failure '{"script":"validate-task.js"}'
```

**Output:** `{ "logged": true, "category": "build", "event": "plan-complete" }`

If the JSON-details argument is not valid JSON, it's stored as `{ "raw": "<the string>" }`.
