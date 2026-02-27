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

---

## Compound Init Commands

Compound commands that compose multiple data sources into a single JSON response.
Replace multi-step context loading in skills with a single CLI call.

### `init execute-phase <phase>`

Everything an executor needs to start building a phase.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init execute-phase 3
```

**Output:**
```json
{
  "executor_model": "sonnet",
  "verifier_model": "sonnet",
  "config": { "depth": "standard", "mode": "interactive", "parallelization": {}, "planning": {}, "gates": {}, "features": {} },
  "phase": { "num": "3", "dir": "03-auth", "name": "auth", "goal": "...", "has_context": false, "status": "planned", "plan_count": 2, "completed": 0 },
  "plans": [{ "file": "PLAN-01.md", "plan_id": "01", "wave": 1, "autonomous": true, "has_summary": false, "must_haves_count": 4, "depends_on": [] }],
  "waves": { "wave_1": ["01", "02"] },
  "branch_name": "main",
  "git_clean": true
}
```

### `init plan-phase <phase>`

Everything a planner needs to start phase planning.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init plan-phase 3
```

**Output:** `researcher_model`, `planner_model`, `checker_model`, `config` (depth profile, features, planning settings), `phase` (num, dir, goal, depends_on), `existing_artifacts`, `workflow` flags.

### `init quick <description>`

Everything the quick skill needs: next task number, slug, directory path.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init quick "add search feature"
```

**Output:** `next_task_number`, `slug`, `dir`, `dir_name`, `timestamp`, `config` subset.

### `init verify-work <phase>`

Everything a verifier needs to start verification.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init verify-work 3
```

**Output:** `verifier_model`, `phase` info, `has_verification`, `prior_attempts`, `prior_status`, `summaries`.

### `init resume`

Detect interrupted state and suggest continuation.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init resume
```

**Output:** `state`, `auto_next`, `continue_here`, `active_skill`, `current_phase`, `progress`.

### `init progress`

All phases with status and completion data.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init progress
```

**Output:** `current_phase`, `total_phases`, `status`, `phases` array, `total_plans`, `completed_plans`, `percentage`.

---

## State Mutation Extensions

### `state patch <JSON>`

Multi-field atomic STATE.md update. Updates all fields in a single pass.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"executing","last_activity":"now"}'
```

**Valid fields:** `current_phase`, `status`, `plans_complete`, `last_activity`, `progress_percent`, `phase_slug`, `total_phases`, `last_command`, `blockers`

**Output:** `{ "success": true, "updated": ["status", "last_activity"] }`

### `state advance-plan`

Increment current plan number in STATE.md and update progress percentage.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state advance-plan
```

**Output:** `{ "success": true, "previous_plan": 1, "current_plan": 2, "total_plans": 5, "progress_percent": 40 }`

### `state record-metric [--duration Nm] [--plans-completed N]`

Record session/execution metrics. Appends to HISTORY.md and updates last_activity.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state record-metric --duration 15m --plans-completed 3
```

**Output:** `{ "success": true, "duration_minutes": 15, "plans_completed": 3 }`
