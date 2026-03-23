# PBR CLI Tools

`pbr-tools.js` is a 2000+ line Node.js CLI at `plugins/pbr/scripts/pbr-tools.js` with 80+ lib modules in `scripts/lib/`. Agents call it to avoid wasting tokens on file parsing and state manipulation.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js <command> [args]
```

---

## State Management

| Command | Description |
|---------|-------------|
| `state load` | Full project state as JSON (STATE.md + ROADMAP.md + config) |
| `state check-progress` | Recalculate progress from filesystem |
| `state update <field> <value>` | Atomically update a STATE.md field |
| `state reconcile` | Detect and repair STATE.md/ROADMAP.md desync |
| `state backup` | Create timestamped backup of STATE.md and ROADMAP.md |
| `state advance-plan` | Advance plan counter and return current/total |
| `state record-activity <msg>` | Record activity to STATE.md history |
| `state update-progress` | Recalculate and write progress percentage |
| `state patch <json>` | Patch multiple STATE.md fields atomically |

### Examples

```bash
# Load full state
node pbr-tools.js state load

# Update status to building
node pbr-tools.js state update status building

# Reconcile state with filesystem
node pbr-tools.js state reconcile
```

---

## Config

| Command | Description |
|---------|-------------|
| `config validate` | Validate config.json against schema |
| `config get <dot.path>` | Read a config value by dot-path key |
| `config load-defaults` | Load default config values |
| `config save-defaults` | Save current config as defaults |
| `config format` | Format config.json |
| `config resolve-depth` | Resolve depth profile overrides |

### Examples

```bash
# Check if auto_checkpoints is enabled
node pbr-tools.js config get gates.auto_checkpoints

# Get node repair budget
node pbr-tools.js config get workflow.node_repair_budget
```

---

## Roadmap

| Command | Description |
|---------|-------------|
| `roadmap update-status <phase> <status>` | Update phase status in ROADMAP.md |
| `roadmap update-plans <phase> <complete> <total>` | Update phase plan counts |
| `roadmap reconcile` | Reconcile all ROADMAP statuses against disk state |
| `roadmap get-phase <N>` | Get comprehensive phase info as JSON |
| `roadmap append-phase [--goal "..."] [--name "..."]` | Append new phase |
| `roadmap analyze` | Analyze roadmap structure |

---

## Phase

| Command | Description |
|---------|-------------|
| `phase add <slug> [--after N] [--goal "..."]` | Add phase with ROADMAP integration |
| `phase remove <N>` | Remove empty phase directory (with renumbering) |
| `phase list [--status S] [--before N]` | List phase directories |
| `phase complete <N>` | Mark phase complete, advance STATE.md |
| `phase insert <N> <slug> [--goal "..."]` | Insert phase at position, renumber |
| `phase commits-for <N>` | Read phase manifest commits |
| `phase first-last-commit <N>` | First/last commit hashes from manifest |
| `phase-info <phase>` | Comprehensive single-phase status as JSON |
| `plan-index <phase>` | Plan inventory grouped by wave |

---

## Compound Operations

Atomic multi-step operations that update STATE.md + ROADMAP.md together.

| Command | Description |
|---------|-------------|
| `compound init-phase <N> <slug> [--goal]` | Create phase dir + STATE + ROADMAP |
| `compound complete-phase <N>` | Validate SUMMARY + update STATE + ROADMAP |
| `compound init-milestone <ver> [--name] [--phases]` | Create milestone archive structure |

---

## Todo

| Command | Description |
|---------|-------------|
| `todo list [--theme X] [--status Y]` | List todos as JSON |
| `todo get <NNN>` | Get specific todo by number |
| `todo add <title> [--priority P] [--theme T]` | Add new todo |
| `todo done <NNN>` | Mark todo as complete |

---

## Intel

| Command | Description |
|---------|-------------|
| `intel query <term>` | Search intel files for a term |
| `intel status` | Report staleness of each intel file |
| `intel diff` | Changes since last refresh snapshot |

---

## Requirements

| Command | Description |
|---------|-------------|
| `requirements mark-complete <ids>` | Mark comma-separated REQ-IDs as complete |

---

## History

| Command | Description |
|---------|-------------|
| `history append <type> <title> [body]` | Append to STATE.md history |
| `history load` | Load history records as JSON |

---

## Learnings

| Command | Description |
|---------|-------------|
| `learnings ingest <json-file>` | Ingest learning entry into global store |
| `learnings query [--tags] [--min-confidence] [--stack] [--type]` | Query learnings |
| `learnings check-thresholds` | Check deferral trigger conditions |
| `learnings copy-global <path> <proj>` | Copy cross-project learnings |
| `learnings query-global [--tags] [--project]` | Query global knowledge |

---

## Incidents & Negative Knowledge

| Command | Description |
|---------|-------------|
| `incidents list [--limit N]` | List recent incidents |
| `incidents summary` | Aggregate stats by type/severity/source |
| `incidents query [--type] [--severity] [--source]` | Filter incidents |
| `nk record --title --category --files --tried --failed` | Record negative knowledge |
| `nk list [--category] [--phase] [--status]` | List negative knowledge entries |
| `nk resolve <slug>` | Mark negative knowledge as resolved |

---

## Data Management

| Command | Description |
|---------|-------------|
| `data status` | Freshness report for research/intel/codebase dirs |
| `data prune --before <date> [--dry-run]` | Archive stale files |
| `auto-cleanup --phase N \| --milestone vN` | Auto-close todos, archive notes |

---

## Validation & Quality

| Command | Description |
|---------|-------------|
| `validate-project` | Comprehensive .planning/ integrity check |
| `frontmatter <filepath>` | Parse YAML frontmatter to JSON |
| `must-haves <phase>` | Collect all must-haves from phase plans |
| `spot-check <slug> <planId>` | Verify SUMMARY, key_files, commits exist |
| `verify spot-check <type> <path>` | Type-based spot-check (plan, summary, verification, quick) |
| `verify summary <path> [--check-files N]` | Validate SUMMARY.md: exists, files exist, commits valid, self-check |
| `verify plan-structure <path>` | Validate PLAN.md: frontmatter, all 7 task elements, wave/dep consistency |
| `verify phase-completeness <phase>` | Check phase has all expected artifacts (PLANs, SUMMARYs) |
| `verify artifacts <plan-path>` | Check must_haves.artifacts exist and are substantive (L1-L2) |
| `verify key-links <plan-path>` | Check must_haves.key_links are wired between components |
| `verify commits <hash1> [hash2...]` | Verify commit SHAs exist in git history |
| `verify references <path>` | Check @-references in a file resolve to existing files |
| `staleness-check <slug>` | Check if plans are stale vs dependencies |
| `summary-gate <slug> <planId>` | Verify SUMMARY.md exists and is valid |

---

## Session & Skill

| Command | Description |
|---------|-------------|
| `session get <key>` | Read from .session.json |
| `session set <key> <value>` | Write to .session.json |
| `session clear [key]` | Clear session or key |
| `session dump` | Print entire session state |
| `skill-section <skill> <section>` | Extract section from SKILL.md |
| `skill-section --list <skill>` | List all headings in a skill |
| `skill-metadata <name>` | Get metadata for a skill |
| `step-verify [skill] [step] [json]` | Validate step completion |
| `build-preview [slug]` | Preview what execute-phase would do |

---

## Other

| Command | Description |
|---------|-------------|
| `help` | List all skills with metadata as JSON |
| `spec parse/diff/reverse/impact` | UI spec operations |
| `claim acquire/release/list` | Phase claim management |
| `checkpoint init/update` | Checkpoint manifest operations |
| `seeds match <slug> <N>` | Find matching seed files |
| `suggest-alternatives <type> [args]` | Suggest fixes for common errors |
| `hooks perf [--last N] [--json]` | Hook performance report |
| `audit plan-checks [--last N]` | List plan-check results from logs |
| `insights import <html> [--project]` | Parse insights HTML into learnings |
