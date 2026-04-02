---
name: plan
description: "Orchestrates the creation of detailed, executable plans for a development phase by delegating research, planning, and plan-checking to specialized subagents. Produces structured PLAN.md files with task breakdowns, file targets, verification commands, and dependency waves that executor agents follow mechanically. Supports research phases, PRD-to-plan express paths, multi-phase planning, assumption surfacing, gap-closure planning from verification results, and team-based specialist planning. Use when the user is ready to plan a phase after discussion, needs to create or update execution plans, wants to add/insert/remove phases from the roadmap, or needs gap-closure plans after verification failures."
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion, Skill
argument-hint: "<phase-number> [--skip-research] [--assumptions] [--gaps] [--model <model>] [--auto] [--through <N>] [--prd <file>] | add | insert <N> | remove <N>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:plan-phase — Phase Planning

**References:** `@references/questioning.md`, `@references/ui-brand.md`

The plan skill orchestrates `/pbr:plan-phase`. It creates detailed, executable plans for a specific phase. Plans are the bridge between the roadmap and actual code — they must be specific enough for an executor agent to follow mechanically. The orchestrator stays lean, delegates heavy work to Task() subagents, and keeps the user's main context window clean.

### Example Usage

```
/pbr:plan-phase 3                    # Plan phase 3 with research + plan-checking
/pbr:plan-phase 3 --skip-research    # Plan without domain research step
/pbr:plan-phase 3 --gaps             # Create gap-closure plans from VERIFICATION.md
/pbr:plan-phase 3 --prd spec.md      # Generate plans from a PRD file
/pbr:plan-phase 1 --through 3        # Plan phases 1-3 in sequence
/pbr:plan-phase add                  # Append a new phase to the roadmap
/pbr:plan-phase insert 4             # Insert a new phase at position 4
/pbr:plan-phase remove 5             # Remove phase 5 from the roadmap
```

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Minimize** reading subagent output — read only plan frontmatter for summaries. Exception: if `context_window_tokens` in `.planning/config.json` is >= 500000, reading full plan bodies is permitted when content is needed for inline decisions.
- **Delegate** all research and planning work to subagents — the orchestrator routes, it doesn't plan

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PLANNING PHASE {N}                         ║
╚══════════════════════════════════════════════════════════════╝
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Multi-Session Sync

Before any phase-modifying operations (writing PLAN files, updating STATE.md/ROADMAP.md), acquire a claim:

```
acquireClaim(phaseDir, sessionId)
```

If the claim fails (another session owns this phase), display: "Another session owns this phase. Use `/pbr:progress` to see active claims."

On completion or error (including all exit paths), release the claim:

```
releaseClaim(phaseDir, sessionId)
```

## Prerequisites

- `.planning/config.json` exists (run `/pbr:new-project` first)
- `.planning/ROADMAP.md` exists with at least one phase
- `.planning/REQUIREMENTS.md` exists

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

### Standard Invocation

`/pbr:plan-phase <N>` — Plan phase N

Parse the phase number and optional flags:

| Argument | Meaning |
|----------|---------|
| `3` | Plan phase 3 |
| `3 --skip-research` | Plan phase 3, skip research step |
| `3 --assumptions` | Surface assumptions before planning phase 3 |
| `3 --gaps` | Create gap-closure plans for phase 3 (from VERIFICATION.md) |
| `3 --teams` | Plan phase 3 using specialist agent teams |
| `3 --model opus` | Use opus for all researcher, planner, and checker spawns in phase 3 |
| (no number) | Use current phase from STATE.md |
| `3 --preview` | Preview what planning would produce for phase 3 without spawning agents |
| `3 --audit` | Plan phase 3, then force full plan-checker validation |
| `3 --auto` | Plan phase 3 with auto mode — suppress confirmation gates, auto-advance on success |
| `1 --through 3` | Plan phases 1 through 3 in a single planner session (requires planning.multi_phase: true) |
| `3 --prd path/to/prd.md` | Plan phase 3 using a PRD file as input — skip discussion, generate CONTEXT.md from PRD |

### Subcommands

| Subcommand | Meaning |
|------------|---------|
| `add` | Append a new phase to the end of the roadmap |
| `insert <N>` | Insert a new phase at position N (uses decimal numbering) |
| `remove <N>` | Remove phase N from the roadmap |

### Freeform Text Guard — CRITICAL

**STOP. Before ANY context loading or Step 1 work**, you MUST check whether `$ARGUMENTS` looks like freeform text rather than a valid invocation. This check is non-negotiable. Valid patterns are:

- Empty (no arguments)
- A phase number: integer (`3`, `03`) or decimal (`3.1`)
- A subcommand: `add`, `insert <N>`, `remove <N>`
- A phase number followed by flags: `3 --skip-research`, `3 --assumptions`, `3 --gaps`, `3 --teams`, `3 --auto`, `3 --prd <file>`
- A phase number followed by --through and another number: `1 --through 3`
- The word `check` (legacy alias)

If `$ARGUMENTS` does NOT match any of these patterns — i.e., it contains freeform words that are not a recognized subcommand or flag — then **stop execution** and respond:

```
`/pbr:plan-phase` expects a phase number or subcommand.

Usage:
  /pbr:plan-phase <N>              Plan phase N
  /pbr:plan-phase <N> --gaps       Create gap-closure plans
  /pbr:plan-phase add              Add a new phase
  /pbr:plan-phase insert <N>       Insert a phase at position N
  /pbr:plan-phase remove <N>       Remove phase N
```

Then suggest the appropriate skill based on the text content:

| If the text looks like... | Suggest |
|---------------------------|---------|
| A task, idea, or feature request | `/pbr:todo` to capture it, or `/pbr:explore` to investigate |
| A bug or debugging request | `/pbr:debug` to investigate the issue |
| A review or quality concern | `/pbr:verify-work` to assess existing work |
| Anything else | `/pbr:explore` for open-ended work |

Do NOT proceed with planning. The user needs to use the correct skill.

**Self-check**: If you reach Step 1 without having matched a valid argument pattern above, you have a bug. Stop immediately and show the usage block.

---

## Orchestration Flow: Standard Planning

Execute these steps in order for standard `/pbr:plan-phase <N>` invocations.

---

### Step 1: Parse and Validate (inline)

Reference: `skills/shared/config-loading.md` for the tooling shortcut (`state load`, `plan-index`, `phase-info`) and config field reference.

1. Parse `$ARGUMENTS` for phase number and flags
   - If `--model <value>` is present in `$ARGUMENTS`, extract the value (sonnet, opus, haiku, inherit). Store as `override_model`. When spawning researcher, planner, and plan-checker Task() agents, use `override_model` instead of the config-derived model values. If an invalid value is provided, display an error and list valid values.
   - If `--auto` is present in `$ARGUMENTS`: set `auto_mode = true`. Log: "Auto mode enabled — suppressing confirmation gates"
   - If `--through <M>` is present:
     a. Read `planning.multi_phase` from config
     b. If `planning.multi_phase` is `false` or unset: display error:
        "`--through` requires `planning.multi_phase: true` in config. Set it with: `/pbr:config set planning.multi_phase true`"
        Then STOP.
     c. Parse start phase (N) and end phase (M). Validate both exist in ROADMAP.md.
     d. Store `through_phases = [N, N+1, ..., M]`
     e. Log: "Multi-phase planning: phases {N} through {M}"
   - If `--prd <file>` is present in `$ARGUMENTS`:
     a. Extract the file path from the argument
     b. Set `prd_mode = true`
     c. Log: "PRD express path — will generate CONTEXT.md from PRD, skip discussion"
2. **CRITICAL — Init first.** Run the init CLI call as the FIRST action after argument parsing:
   ```bash
   node plugins/pbr/scripts/pbr-tools.js init plan-phase {N}
   ```
   Store the JSON result as `blob`. All downstream steps MUST reference `blob` fields instead of re-reading files. Key fields: `blob.phase.dir`, `blob.phase.goal`, `blob.phase.depends_on`, `blob.config.depth`, `blob.config.profile`, `blob.researcher_model`, `blob.planner_model`, `blob.checker_model`, `blob.existing_artifacts`, `blob.workflow.research_phase`, `blob.workflow.plan_checking`, `blob.drift`.
   **Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP the `.active-skill` write below — the autonomous orchestrator owns `.active-skill` during speculative planning.
   **CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.
3. Resolve depth profile: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. Validate using blob fields:
   - `blob.phase.dir` is set (phase exists in ROADMAP.md and directory exists)
   - `blob.existing_artifacts` is empty or user confirms re-planning
5. If no phase number given, use `blob.phase.number` (already resolved from STATE.md by init)
6. **CONTEXT.md existence check**: If the phase is non-trivial (has 2+ requirements or success criteria), check whether a CONTEXT.md exists at EITHER `.planning/CONTEXT.md` (project-level) OR `.planning/phases/{blob.phase.dir}/CONTEXT.md` (phase-level). If NEITHER exists, warn: "Phase {N} has no CONTEXT.md. Consider running `/pbr:discuss-phase {N}` first to capture your preferences. Continue anyway?" If user says no, stop. If yes, continue. If at least one exists, proceed without warning.

#### --prd express path

If `prd_mode` is `true`:

1. Read the PRD file specified by the `--prd` argument
2. Parse the PRD content, looking for these sections (case-insensitive):
   - **Requirements** / **Functional Requirements** / **User Stories**
   - **Scope** / **In Scope** / **Out of Scope**
   - **Constraints** / **Technical Constraints**
   - **Decisions** / **Architecture Decisions** / **Design Decisions**
   - **Goals** / **Objectives**
**CRITICAL — DO NOT SKIP: Write CONTEXT.md from the PRD NOW. The planner agent requires this file for locked decisions.**
3. Generate `.planning/phases/{NN}-{slug}/CONTEXT.md` from the PRD:
   ```markdown
   ---
   source: prd
   prd_file: "{original file path}"
   generated: "{ISO timestamp}"
   ---
   # Phase {N} Context (from PRD)

   ## Decision Summary
   {Extracted decisions from PRD, each as a locked decision}

   ## Scope
   {Extracted scope boundaries}

   ## Constraints
   {Extracted constraints}

   ## Requirements Mapping
   {Map PRD requirements to phase REQ-IDs where possible}

   ## Deferred Ideas
   {Any out-of-scope items from the PRD}
   ```
4. Log: "Generated CONTEXT.md from PRD ({line_count} lines)"
5. **Skip Step 6 (CONTEXT.md existence check)** — we just created one
6. **Skip Steps 3 and 4** (assumption surfacing and research) — the PRD provides the context
7. Proceed directly to **Step 5** (planning) with the PRD-derived context

---

#### --preview mode

If `--preview` is present in `$ARGUMENTS`:

1. Detect the `--preview` flag and extract the phase number.
2. Render the following dry-run banner:

   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  DRY RUN — /pbr:plan-phase {N} --preview                           ║
   ║  No researchers or planners will be spawned                  ║
   ╚══════════════════════════════════════════════════════════════╝
   ```

3. Show the 5 steps that would occur:

   1. Parse ROADMAP.md for phase {N} goal, dependencies, and requirements
   2. Spawn researcher agents to investigate codebase and gather context
   3. Spawn planner agent to write PLAN files based on research
   4. Run plan-checker to validate structure and completeness
   5. Present plans for your approval before building

4. Show estimated agent spawns: ~2-4 agents (1-2 researchers + 1 planner + 1 plan-checker)
5. Show output location: `.planning/phases/{NN}-{slug}/PLAN-NN.md`

6. **STOP** — do not proceed to Step 2.

---

**If phase already has plans:**
- **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
  Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
  question: "Phase {N} already has plans. Re-plan from scratch?"
  header: "Re-plan?"
  options:
    - label: "Yes"  description: "Delete existing plans and create new ones"
    - label: "No"   description: "Keep existing plans unchanged"
- If "Yes": delete existing PLAN.md files in the phase directory
- If "No" or "Other": stop

---

### Step 2: Load Context (inline)

From the init `blob` captured in Step 1, extract the context fields needed for planning. Build lean context bundles for subagent prompts — include paths and one-line descriptions, NOT full file bodies. Agents have the Read tool and will pull file contents on-demand.

```
1. Use blob.phase.goal, blob.phase.depends_on for phase goal and dependencies from ROADMAP.md
2. Read .planning/REQUIREMENTS.md — extract requirements mapped to this phase
3. Read .planning/CONTEXT.md (if exists) — extract only the `## Decision Summary` section (everything from `## Decision Summary` to the next `##` heading). If no Decision Summary section exists (legacy CONTEXT.md), fall back to extracting the full `## Decisions (LOCKED...)` and `## Deferred Ideas` sections.
4. Read .planning/phases/{NN}-{slug}/CONTEXT.md (if exists) — extract only the `## Decision Summary` section. Fall back to full locked decisions + deferred sections if no Decision Summary exists.
5. Use blob.config for feature flags, depth, model settings instead of re-reading config.json
6. List prior SUMMARY.md file paths and extract frontmatter metadata only (status, provides, key_files). Do NOT read full SUMMARY bodies — agents pull these on-demand via Read tool.
7. Read .planning/research/SUMMARY.md (if exists) — extract research findings
```

**Digest-select depth for prior SUMMARYs (Step 6):**

Reference: `skills/shared/digest-select.md` for the full depth rules and examples. In short: direct dependencies get frontmatter + key decisions, transitive get frontmatter only, 2+ back get skipped.

Collect all of this into a context bundle that will be passed to subagents.

---

### Step 3: Assumption Surfacing (inline, if `--assumptions` flag)

**IMPORTANT**: This step is FREE (no subagents). It happens entirely inline.

Before spawning any agents, present 4 assumptions to the user — one each for: approach (how the phase will be implemented), key technology, architecture, and scope boundary. For each, ask the user to confirm or correct. Record corrections as new CONTEXT.md locked decisions. After all assumptions are confirmed/corrected, continue to Step 4.

---

### Optional: Thinking Partner Chain

If the phase has 3+ interacting locked decisions in CONTEXT.md or 3+ dependencies that create architectural tension, the assumption list may benefit from structured reasoning before research:

"These assumptions interact in non-obvious ways. Running through structured analysis to identify hidden conflicts..."

Invoke: `Skill({ skill: "thinking-partner", args: "Assumptions for phase {N}: {list assumptions}. Locked decisions: {list from CONTEXT.md}. Identify conflicts, second-order effects, and assumptions that contradict each other." })`

Skip this step if:

- Fewer than 3 interacting decisions
- Phase is simple/independent (no dependency tension)
- User has explicitly said to skip discussion

---

### Step 4: Phase Research (delegated, conditional)

**Skip this step if ANY of these are true:**
- `--skip-research` flag is set
- `--gaps` flag is set
- Depth profile has `features.research_phase: false`

To check: use `blob.workflow.research_phase` from the init blob. This replaces checking `features.research_phase` and `depth` separately -- the init already incorporates both.

**Conditional research (standard/balanced mode):** When `blob.workflow.research_phase` is `true`, also check whether `.planning/codebase/` or `.planning/research/` already contains relevant context for this phase. If substantial context exists (>3 files in codebase/ or a RESEARCH.md mentioning this phase's technologies), skip research and note: "Skipping research -- existing context found in {directory}." This implements the balanced mode's "conditional research" behavior.

**If research is needed:**

Display to the user: `◆ Spawning researcher...`

**Parallel research optimization (1M context):** If `context_window_tokens` in `.planning/config.json` is >= 500000, spawn the researcher Task() AND the pre-planner briefing Task() (Step 4.5) in parallel using `run_in_background: true` for both. Both are independent -- the researcher analyzes technologies while the briefing scans seeds and deferred items. Wait for both to complete before proceeding to the planner.

Display: `◆ Spawning researcher + pre-planner briefing in parallel (1M context)...`

**Individual Agent Calls:** Each parallel spawn (researcher, pre-planner briefing) MUST be a separate Task() tool call in a single response message. Do NOT combine or describe them in prose. Each separate Task() call gets its own colored badge in the Claude Code UI.

If `context_window_tokens` < 500000, maintain the existing sequential flow: researcher first, then pre-planner briefing.

Spawn a researcher Task():

```
Task({
  subagent_type: "pbr:researcher",
  prompt: <phase research prompt>
})

NOTE: The pbr:researcher subagent type auto-loads the agent definition. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Phase Research Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/researcher-prompt.md.tmpl` and use it as the prompt template for spawning the researcher agent. Fill in the placeholders with phase-specific context:
- `{NN}` - phase number (zero-padded)
- `{phase name}` - phase name from roadmap
- `{goal from roadmap}` - phase goal statement
- `{REQ-IDs mapped to this phase}` - requirement IDs
- `{dependencies from roadmap}` - dependency list
- Fill `<project_context>` and `<prior_work>` blocks per the shared partial (`templates/prompt-partials/phase-project-context.md.tmpl`): Decision Summary for context, manifest table for prior work

**Prepend this block to the researcher prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/ROADMAP.md — phase goals, dependencies, and structure
2. .planning/REQUIREMENTS.md — scoped requirements for this phase (if exists)
3. .planning/intel/arch.md — architecture intelligence (if exists)
</files_to_read>
```

Wait for the researcher to complete before proceeding.

After the researcher completes, check the Task() output for a completion marker:
- If `## RESEARCH COMPLETE` is present: proceed to planner
- If `## RESEARCH BLOCKED` is present: warn the user that research could not complete, ask if they want to proceed with limited context or stop
- If neither marker is present: warn that researcher may not have completed successfully, but proceed

---

### Step 4.5: Pre-Planner Briefing (delegated)

**CRITICAL (no hook): Run pre-planner briefing before spawning the planner. Do NOT skip this step.**

**Note:** If `context_window_tokens` >= 500000, this step was already spawned in parallel with the researcher in Step 4. Skip spawning it again -- just read the results.

Consolidate seed scanning and deferred idea surfacing into a single lightweight Task():

```
Task({
  subagent_type: "pbr:general",
  model: "haiku",
  prompt: "Pre-planner briefing for Phase {NN} ({phase-slug}).

1. SEED SCANNING:
   Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js seeds match {phase-slug} {phase-number}`
   If `matched` is non-empty, output a ## Seeds section listing each seed name, description, and content.
   If empty, output: ## Seeds\nNo matching seeds found.

2. DEFERRED IDEAS:
   Collect deferred items from three sources:

   a. **Project CONTEXT.md**: Read `.planning/CONTEXT.md`. Check for `<deferred>` XML tags (preferred)
      OR `## Deferred` / `## Deferred Ideas` markdown headers (backward compat).
      Extract items that mention Phase {NN} or keywords matching the phase slug.

   b. **Phase CONTEXT.md**: Read `.planning/phases/{NN}-{slug}/CONTEXT.md` (if exists).
      Check for `<deferred>` XML tags OR markdown deferred headers. Extract relevant items.

   c. **Prior phase SUMMARY.md files**: Read SUMMARY-*.md files from the prior phase directory
      (`.planning/phases/{prior_phase_dir}/SUMMARY-*.md`, where prior_phase_dir is phase N-1).
      Extract the `deferred:` field from each SUMMARY frontmatter. List any deferred items
      from the prior phase that might now be in scope for this phase.

   Output a ## Deferred Ideas section with sub-sections:
   - 'From project CONTEXT.md:' (items from project-level deferred, or 'None')
   - 'From phase CONTEXT.md:' (items from current phase deferred, or 'None')
   - 'From prior phase:' (items from prior phase SUMMARY.md deferred fields, or 'None')
   If all three sources are empty, output: ## Deferred Ideas\nNo relevant deferred items.

Output format: Return both sections as markdown. End with ## BRIEFING COMPLETE."
})
```

After the Task() completes:
- If `## Seeds` section contains matches:
  - If `gates.confirm_seeds` is `true` in config:
    **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
    Present them to the user via AskUserQuestion (pattern: yes-no-pick from `skills/shared/gate-prompts.md`):
      question: "Include these {N} seeds in planning?"
      header: "Seeds?"
      options:
        - label: "Yes, all"     description: "Include all {N} matching seeds"
        - label: "Let me pick"  description: "Choose which seeds to include"
        - label: "No"           description: "Proceed without seeds"
    - If "Yes, all": include seed content in planner context
    - If "Let me pick": present individual seeds for selection
    - If "No": proceed without seeds
  - If `gates.confirm_seeds` is `false` (default): automatically include all matching seeds in planner context without prompting. Log: "Including {N} seeds automatically (gates.confirm_seeds=false)."

- If `## Deferred Ideas` section has items:
  - If `gates.confirm_deferred` is `true` in config:
    **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
    Present via AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
      question: "Include these deferred ideas in planning context?"
    - If "Yes": append to planner context under `Deferred ideas to consider:`
    - If "No": proceed without changes
  - If `gates.confirm_deferred` is `false` (default): automatically append deferred ideas to planner context without prompting. Log: "Including deferred ideas automatically (gates.confirm_deferred=false)."

- If both sections are empty: proceed silently to Step 5 (no AskUserQuestion needed)

---

### Step 5: Planning (delegated)

#### Team Mode (--teams)

**Read teams config:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config get parallelization.use_teams
```

Store the result as `use_teams_config`. If the CLI returns `true`, treat it as if `--teams` was passed.

If `--teams` flag is set OR `use_teams_config` is `true` (from the config read above):
1. Log: "Team mode enabled (source: {--teams flag | config parallelization.use_teams})"
2. Read `references/agent-teams.md` for role definitions
3. Spawn 3 parallel planner agents (architect, security, test) with role-specific prompts
4. Wait for all 3 to complete
5. Spawn synthesizer agent to merge outputs from `.planning/phases/{NN}-{slug}/team/` into final PLAN files

If neither `--teams` flag nor `use_teams_config` is true, proceed with the single-planner flow below.

#### Multi-Phase Flow (--through)

If `through_phases` is set (from Step 1 --through parsing):

1. For each phase P in `through_phases` (in order):
   a. Load phase P's context: use `blob.phase.goal` and `blob.phase.depends_on` for the first phase; for subsequent phases, run `pbr-tools.js init` with `plan-phase {P}` to get a fresh blob
   b. Load phase P's CONTEXT.md (if exists)
   c. If P > first phase: include prior phase plans as accumulated context
      - For each already-planned phase in this session, include:
        - Plan frontmatter summary (provides, files_modified, must_haves)
        - This gives the planner visibility into cross-phase dependencies
   d. Spawn planner Task() with multi-phase instructions:

      Add to the planner prompt's `<planning_instructions>` block:
      ```
      MULTI-PHASE CONTEXT: This is phase {P} of {N} in a multi-phase planning session ({start} through {end}).
      Prior phases planned in this session: {list of phase numbers and their provides}

      CROSS-PHASE CONFLICT DETECTION:
      - Check files_modified in your plans against files_modified from prior phases
      - If overlap detected: add a warning comment in the plan frontmatter: `cross_phase_conflict: ["{file} also modified in phase {X}"]`
      - Ensure depends_on includes the conflicting prior phase plan
      ```

   e. Wait for planner to complete
   f. Read the created plan frontmatters (provides, files_modified) to build accumulated context
   g. Display: "Phase {P} planned ({N} plans). Proceeding to phase {P+1}..."

2. After all phases planned, display summary:
   ```
   Multi-phase planning complete: {total_plans} plans across phases {start}-{end}
   Cross-phase conflicts detected: {count} (see plan frontmatter for details)
   ```

3. Skip to Step 5b (spot-check) -- run spot-check across ALL phase directories that were planned.

#### Single-Planner Flow (default)

**Learnings injection (opt-in):** Check for planning and estimation learnings before spawning the planner:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js learnings query --tags "estimation,planning,process,workflow" 2>/dev/null
```

If non-empty JSON array returned:

- Write to temp file and note as `{learnings_temp_path}`:

  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js learnings query --tags "estimation,planning,process,workflow" > /tmp/pbr-learnings-$$.md
  ```

- Add as an additional `files_to_read` item in the planner prompt below

If no learnings or command fails: omit.

**Intel Staleness Check** (before spawning planner):

If `.planning/config.json` has `intel.enabled` not explicitly `false`:

Run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js intel status
```

If the output indicates any intel file is stale (>24h old) or missing:
Display an advisory warning:
```
Warning: Intel data is stale or missing. Planning will proceed without fresh codebase intelligence.
Consider running /pbr:intel refresh for better plan quality.
```

Continue with planner spawn regardless — this is advisory only, not a gate.
If intel is disabled or config doesn't exist: skip silently.

Display to the user: `◆ Spawning planner...`

Spawn the planner Task() with all context inlined:

```
Task({
  subagent_type: "pbr:planner",
  prompt: <planning prompt>
})

NOTE: The pbr:planner subagent type auto-loads the agent definition.

After planner completes, check for completion markers: `## PLANNING COMPLETE`, `## PLANNING FAILED`, or `## PLANNING INCONCLUSIVE`. Route accordingly. Do NOT inline it.

**Memory capture:** Reference `skills/shared/memory-capture.md` — check planner output for `<memory_suggestion>` blocks and save any reusable knowledge discovered during planning.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Planning Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/planner-prompt.md.tmpl` and use it as the prompt template for spawning the planner agent. Fill in all placeholder blocks with phase-specific context:

- `<phase_context>` - from `blob.phase.dir`, `blob.phase.goal`, `blob.phase.depends_on` plus requirements and success criteria
- `<project_context>` - locked decisions, user constraints, deferred ideas, phase-specific decisions
- `<prior_work>` - manifest table of preceding phase SUMMARY.md file paths with status and one-line exports (NOT full bodies)
- `<research>` - file path to RESEARCH.md if it exists (NOT inlined content)
- `<config>` - from `blob.config`: max tasks, parallelization, TDD mode
- `<planning_instructions>` - phase-specific planning rules and output path

**Prepend this block to the planner prompt before sending:**

```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/CONTEXT.md — locked decisions and constraints (if exists)
2. .planning/ROADMAP.md — phase goals, dependencies, and structure
3. .planning/phases/{NN}-{slug}/RESEARCH.md — research findings (if exists)
4. .planning/phases/{NN}-{slug}/CONTEXT.md — phase-level decisions and deferred items (if exists)
5. .planning/phases/{prior_phase_dir}/SUMMARY-*.md — prior phase summaries with deferred items (if prior phase exists)
{if learnings_temp_path exists}6. {learnings_temp_path} — cross-project learnings (estimation and planning patterns from past PBR projects){/if}
7. .planning/intel/arch.md — architecture intelligence (if exists)
8. .planning/intel/stack.json — tech stack intelligence (if exists)
</files_to_read>
```

Items 4-5 provide the planner with deferred items from the current phase CONTEXT.md and from prior phase SUMMARY.md files, enabling the deferred-items forward path. If `{learnings_temp_path}` was produced in the learnings injection step above, replace `{if...}{/if}` with the actual line. If no learnings were found, omit item 6 entirely. If no prior phase exists, omit item 5.

Wait for the planner to complete.

After the planner returns, read the plan files it created to extract counts. Display a completion summary using standardized status symbols (see `@references/ui-brand.md`):

```
✓ Planner created {N} plan(s) across {M} wave(s)
```

Where `{N}` is the number of PLAN.md files written and `{M}` is the number of distinct wave values across those plans (from frontmatter).

Present a wave execution table using standardized symbols:

```
Wave 1: ○ Plan 01, ○ Plan 02
Wave 2: ○ Plan 03
```

Use `○` (pending) for all plans at this stage since none have been executed yet.

### Step 5b: Spot-Check Planner Output (CLI-enforced)

CRITICAL (no hook): Verify planner output using CLI before proceeding.

For each PLAN file in the phase directory:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js verify plan-structure ".planning/phases/{NN}-{slug}/{plan_file}"
```

Parse JSON result per file:
- `valid: true` — plan structure is sound
- `valid: false` — read `errors` array. Report to user.
- `warnings` — note but don't block

Also verify overall plan count:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js verify spot-check plan ".planning/phases/{NN}-{slug}"
```

If ANY plan fails structural validation, present user with: **Retry** / **Continue anyway** / **Abort**

---

### Step 6: Plan Validation (delegated, conditional)

**Skip this step if:**
- `features.inline_verify` is `true` in config AND `--audit` flag is NOT set (planner self-validates)

Plan-checking is always enabled. Quick depth uses a reduced dimension set (D1-D7, skipping D8 Nyquist and D9 Data Contracts). The `--audit` flag forces full 9-dimension checking regardless of depth.

To check: use the resolved depth profile from Step 1. The profile consolidates the depth setting and any user overrides into a single boolean.

**Force validation:** If `--audit` flag is set, ALWAYS spawn the plan-checker agent regardless of depth profile or inline_verify setting. Display: `◆ Audit mode: spawning plan checker (--audit flag)`

**Inline verify mode:** If `features.inline_verify` is `true` and `--audit` is NOT set, use the CLI plan-structure validation result from Step 5b instead of spawning the full plan-checker. Display: `✓ Using CLI structural validation (inline_verify enabled). Use --audit to force full plan-checker.`

When inline_verify skips the plan-checker spawn, write `.plan-check.json` based on the ACTUAL CLI validation results from Step 5b:
- If ALL plans passed structural validation (`valid: true`): write `{ "status": "passed", "dimensions_checked": 1, "blockers": 0, "warnings": {warning_count}, "timestamp": "<ISO>", "source": "inline_verify" }`
- If ANY plan failed structural validation (`valid: false`): write `{ "status": "failed", "dimensions_checked": 1, "blockers": {error_count}, "warnings": {warning_count}, "errors": [{error_list}], "timestamp": "<ISO>", "source": "inline_verify" }` — the build gate WILL block. Do NOT write `"status": "passed"` when validation found errors.
- The `dimensions_checked: 1` reflects that inline_verify only checks structural validity (D2), not the full 9 dimensions. Use `--audit` for comprehensive checking.

**If validation is enabled:**

Display to the user: `◆ Spawning plan checker...`

Spawn the plan checker Task():

```
Task({
  subagent_type: "pbr:plan-checker",
  prompt: <checker prompt>
})

NOTE: The pbr:plan-checker subagent type auto-loads the agent definition. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Checker Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/checker-prompt.md.tmpl` and use it as the prompt template for spawning the plan checker agent. Fill in the placeholders:
- `<plans_to_check>` - manifest table of PLAN.md file paths (checker reads each via Read tool)
- `<phase_context>` - phase goal and requirement IDs
- `<depth>` - current depth profile (quick, standard, comprehensive) so checker knows which dimensions to evaluate
- `<context>` - file paths to project-level and phase-level CONTEXT.md files (checker reads via Read tool)

**Prepend this block to the checker prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/phases/{NN}-{slug}/PLAN-*.md — plan files to validate
2. .planning/CONTEXT.md — locked decisions to check against (if exists)
</files_to_read>
```

**Process checker results:**

After the plan checker returns, display its result:

- If `VERIFICATION PASSED`: display `✓ Plan checker: all plans passed` and proceed to Step 8
- If issues found: display `⚠ Plan checker found {N} issue(s) — entering revision loop` and proceed to Step 7

**Plan-check artifact:** The plan-checker agent writes `.plan-check.json` to the phase directory as part of its output. After the checker completes, verify the artifact exists:
- Run: `ls .planning/phases/{NN}-{slug}/.plan-check.json`
- If missing: write it manually based on checker output (status, blocker/warning counts, timestamp)
- If present: proceed — the build gate will read this artifact

**Step 6b: Requirements Coverage Gate (structural)**

After plan validation passes, verify that ALL phase requirements are covered by at least one plan's `implements` field. This is a structural check, not agent behavior — it reads actual plan files.

```bash
# 1. Get phase requirements from ROADMAP
PHASE_REQS=$(grep -A 20 "### Phase {N}" .planning/ROADMAP.md | grep -oP 'REQ-[A-Z0-9-]+' | sort -u)

# 2. Get implemented requirements from all plan files
PLAN_REQS=$(grep -h "implements:" .planning/phases/{NN}-{slug}/PLAN-*.md | grep -oP 'REQ-[A-Z0-9-]+|GSD-[0-9]+' | sort -u)

# 3. Find uncovered requirements
UNCOVERED=$(comm -23 <(echo "$PHASE_REQS") <(echo "$PLAN_REQS"))
```

If `UNCOVERED` is non-empty:
- Display: `⚠ Requirements coverage incomplete — {N} requirement(s) not covered by any plan: {list}`
- If depth is `quick`: display warning but do NOT block
- If depth is `standard` or `comprehensive`: present user with **Fix plans** / **Continue anyway** / **Abort**

If `UNCOVERED` is empty or no phase requirements found in ROADMAP:
- Display: `✓ Requirements coverage: all phase requirements mapped to plans`

---

### Step 7: Revision Loop (max 3 iterations)

Reference: `skills/shared/revision-loop.md` for the full Check-Revise-Escalate pattern.

**YAML Issue Parsing:** After the plan-checker returns with issues, parse the YAML `issues:` block from the checker output (located under the `## Issues` heading). Count BLOCKER and WARNING issues separately.

**Issue Count Tracking:** Track `issue_count` per iteration. If the current iteration's `issue_count >= prev_issue_count` (count did not decrease), break early with:
`⚠ Revision loop stalled (issue count not decreasing). Escalating to user.`

**Iteration Display:** At the start of each iteration, display:
`◆ Revision iteration {N}/3 — {blocker_count} blockers, {warning_count} warnings`

Follow the revision loop pattern with:
- **Producer**: planner (re-spawned with `${CLAUDE_SKILL_DIR}/templates/revision-prompt.md.tmpl` — pass the YAML issues block verbatim in the `<checker_issues>` section)
- **Checker**: plan-checker (back to Step 6)
- **Early exit**: if issue count does not decrease between iterations, stop the loop and escalate
- **Escalation**: present issues to user, offer "Proceed anyway" or "Adjust approach" (re-enter Step 5)

```
prev_issue_count = Infinity

LOOP (iteration = 1 to 3):
  1. Parse YAML issues from checker output
  2. Count: blocker_count = issues where severity == "BLOCKER"
           warning_count = issues where severity == "WARNING"
           issue_count = blocker_count + warning_count
  3. Display: ◆ Revision iteration {iteration}/3 — {blocker_count} blockers, {warning_count} warnings
  4. If issue_count >= prev_issue_count:
     → Display stall warning, escalate to user
  5. prev_issue_count = issue_count
  6. Read revision-prompt.md.tmpl, fill in YAML issues block
  7. Re-spawn planner with revision prompt
  8. Re-run plan-checker (Step 6)
  9. If checker returns PASSED → exit loop, proceed to Step 8
```

---

### Step 8: User Approval (inline, conditional)

**Skip if:**
- `gates.confirm_plan` is `false` in config
- `mode` is `autonomous` in config
- `auto_mode` is `true` — proceed as if user selected "Approve"

**If approval is needed:**

Present a summary of all plans to the user. For each plan include: plan name, wave, task count, must-haves, files_modified. For each task include the task name. Add a wave execution order summary (Wave 1: Plan 01, 02 (parallel), Wave 2: Plan 03, etc.).

**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use AskUserQuestion (pattern: approve-revise-abort from `skills/shared/gate-prompts.md`):
  question: "Approve these {count} plans for Phase {N}?"
  header: "Approve?"
  options:
    - label: "Approve"          description: "Proceed to build phase"
    - label: "Request changes"  description: "Discuss adjustments before proceeding"
    - label: "Abort"            description: "Cancel planning for this phase"

**If user selects 'Request changes' or 'Other':**
- Discuss what needs to change
- Re-enter Step 5 with updated context/constraints
- Or make small inline edits to plan files directly

**If user selects 'Approve':**
- **CONTEXT.md compliance reporting**: Check locked decisions from BOTH sources:
  a. Project-level: `.planning/CONTEXT.md` (if exists) — cross-cutting decisions for all phases
  b. Phase-level: `.planning/phases/{NN}-{slug}/CONTEXT.md` (if exists) — phase-specific decisions
     Phase-level decisions override project-level for the same decision area.

  Collect ALL locked decisions from both files (deduplicate identical decision text).
  Compare against the generated plan tasks. Print:
  `CONTEXT.md compliance: {M}/{N} locked decisions mapped to tasks`
  where M = locked decisions reflected in at least one task action, N = total unique locked decisions.
  If any locked decisions are unmapped, list them as warnings.
  If neither CONTEXT.md exists: skip this check silently.
- **Dependency fingerprinting**: For each dependency phase (phases that this phase depends on, per ROADMAP.md):
  1. Find all SUMMARY.md files in the dependency phase directory
  2. Compute a fingerprint string for each: `"len:{bytes}-mod:{mtime}"` and add as a `dependency_fingerprints` map in each plan's YAML frontmatter — this allows the build skill to detect stale plans if dependencies were rebuilt.
- **Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP all `state update` CLI calls in this section. Do NOT update STATE.md `status`, `current_phase`, or `plans_total` — the autonomous orchestrator manages state exclusively during speculative runs. Also SKIP the ROADMAP.md progress table update below.
- **Update ROADMAP.md Progress table** (REQUIRED — do this BEFORE updating STATE.md):

  > Note: Use CLI for atomic writes — direct Write bypasses file locking.

  ```bash
  # Note: For initial phase setup, `compound init-phase` bundles dir creation + ROADMAP + STATE atomically.
  # Here we update ROADMAP plan counts and status separately, then patch STATE atomically.
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-plans {phase} 0 {N}
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status {phase} planned
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"planned","last_activity":"now"}'
  ```
- Update STATE.md via CLI **(CRITICAL (no hook) — update BOTH frontmatter AND body)**: set `status: "planned"`, `plans_total`, `last_command` in frontmatter AND update `Status:`, `Plan:` lines in body `## Current Position`

**Tooling shortcut**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"planned","last_command":"/pbr:plan-phase {N}"}'`
- **If `auto_mode` is `true`:** Set `features.auto_advance = true` and `mode = autonomous` behavior for the remainder of this invocation. Chain directly to build: `Skill({ skill: "pbr:build", args: "{N} --auto" })`. This continues the plan→build→review cycle automatically.
- **Else if `features.auto_advance` is `true` AND `mode` is `autonomous`:** Chain directly to build: `Skill({ skill: "pbr:build", args: "{N}" })`. This continues the build→review→plan→build cycle automatically.
- **Otherwise:** Suggest next action: `/pbr:execute-phase {N}`

---

## Orchestration Flow: Subcommands

### Subcommand: `add`

**Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP the `.active-skill` write below — the autonomous orchestrator owns `.active-skill` during speculative planning.
**CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.

1. Read `.planning/ROADMAP.md`
2. Calculate next phase number (last phase + 1)
3. Ask user: "What's the goal for this new phase?"
4. Ask user: "What requirements does it address?" (show available unassigned REQ-IDs)
5. Ask user: "What phases does it depend on?"
6. Append phase to ROADMAP.md
**CRITICAL: Create the phase directory NOW. Do not skip this step.**

7. Create phase directory: `.planning/phases/{NN}-{slug}/`
8. Update STATE.md if needed
9. Suggest: `/pbr:plan-phase {N}` to plan the new phase
10. **Speculative mode guard:** If `--speculative` is present, skip the delete below (nothing was written).
    Delete `.planning/.active-skill` if it exists.

### Subcommand: `insert <N>`

Reference: `@references/decimal-phase-calculation.md` for decimal numbering rules.

**Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP the `.active-skill` write below — the autonomous orchestrator owns `.active-skill` during speculative planning.
**CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.

1. Read `.planning/ROADMAP.md`
2. Calculate decimal phase number:
   - If inserting at position 3: becomes 3.1
   - If 3.1 already exists: becomes 3.2
   - Etc. (see decimal-phase-calc.md)
3. Ask user for phase goal, requirements, dependencies
4. Insert phase into ROADMAP.md at the correct position
5. Create phase directory: `.planning/phases/{NN.M}-{slug}/`
6. Update dependencies of subsequent phases if affected
7. Suggest: `/pbr:plan-phase {N.M}` to plan the new phase
8. **Speculative mode guard:** If `--speculative` is present, skip the delete below (nothing was written).
   Delete `.planning/.active-skill` if it exists.

### Subcommand: `remove <N>`

1. Read `.planning/ROADMAP.md`
2. Validate:
   - Phase must exist
   - Phase must be in `pending` or `not started` status (cannot remove completed/in-progress phases)
   - No other phases depend on this phase (or user confirms breaking dependencies)
3. **Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP the `.active-skill` write below — the autonomous orchestrator owns `.active-skill` during speculative planning.
   **CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.
4. Confirm with user: "Remove Phase {N}: {name}? This will delete the phase directory and renumber subsequent phases."
5. If confirmed:
   - Delete `.planning/phases/{NN}-{slug}/` directory
   - Remove phase from ROADMAP.md
   - Renumber subsequent phases (N+1 becomes N, etc.)
   - Update all `depends_on` references in ROADMAP.md
   - Update STATE.md if needed
6. **Speculative mode guard:** If `--speculative` is present, skip the delete below (nothing was written).
   Delete `.planning/.active-skill` if it exists.

---

## Orchestration Flow: Gap Closure (`--gaps`)

When invoked with `--gaps`:

1. Read `.planning/phases/{NN}-{slug}/VERIFICATION.md`
   - If no VERIFICATION.md exists: tell user "No verification report found. Run `/pbr:verify-work {N}` first."
2. Extract all gaps from the verification report
3. Spawn planner Task() in Gap Closure mode:

Read `${CLAUDE_SKILL_DIR}/templates/gap-closure-prompt.md.tmpl` and use it as the prompt template for the gap closure planner. Fill in the placeholders:
- `<verification_report>` - inline the FULL VERIFICATION.md content
- `<existing_plans>` - inline all existing PLAN.md files for the phase
- `<gap_closure_instructions>` - specify output path and gap_closure frontmatter flag

4. After gap-closure plans are created:
   - Run plan checker (if enabled)
   - Present to user for approval
   - Suggest: `/pbr:execute-phase {N} --gaps-only`

---

## Error Handling

### Phase not found
If the specified phase doesn't exist in ROADMAP.md, use conversational recovery:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js suggest-alternatives phase-not-found {slug}`
2. Parse the JSON response to get `available` phases and `suggestions` (closest matches).
3. Display: "Phase '{slug}' not found. Did you mean one of these?"
   - List `suggestions` (if any) as numbered options.
   - Offer "Show all phases" to list `available`.
4. **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion (pattern: yes-no-pick from `skills/shared/gate-prompts.md`) to let the user pick a phase or abort.
   - If user picks a valid phase slug: re-run with that slug.
   - If user chooses to abort: stop cleanly with a friendly message.

### Missing prerequisites
If REQUIREMENTS.md or ROADMAP.md don't exist, use conversational recovery:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js suggest-alternatives missing-prereq {phase}`
2. Parse the JSON response to get `existing_summaries`, `missing_summaries`, and `suggested_action`.
3. Display what is already complete and what is missing.
4. Use AskUserQuestion to offer: "Run /pbr:execute-phase {prerequisite-phase} first, or continue anyway?"
   - If user chooses to continue: proceed with planning (note missing prereqs in plan frontmatter).
   - If user chooses to build first: stop and display the suggested build command.

### Research agent fails
If the researcher Task() fails, display:
```
⚠ Research agent failed. Planning without phase-specific research.
  This may result in less accurate plans.
```
Continue to the planning step.

### Planner agent fails
If the planner Task() fails, display a branded error box — see `skills/shared/error-reporting.md`, pattern: Planner agent failure.

### Checker loops forever
After 3 revision iterations without passing, display a branded error box — see `skills/shared/error-reporting.md`, pattern: Checker loops.
Present remaining issues and ask user to decide: proceed or intervene.

---

## Files Created/Modified by /pbr:plan-phase

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/RESEARCH.md` | Phase-specific research | Step 4 |
| `.planning/phases/{NN}-{slug}/{NN}-{MM}-PLAN.md` | Executable plan files | Step 5 |
| `.planning/CONTEXT.md` | Updated with assumptions | Step 3 (--assumptions) |
| `.planning/ROADMAP.md` | Plans Complete + Status → `planned`; updated for add/insert/remove | Step 8, Subcommands |
| `.planning/STATE.md` | Updated with plan status | Step 8 |

---

## Cleanup

**Speculative mode guard:** If `--speculative` is present, skip the delete below (nothing was written).
Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

## Completion

After planning completes, present:

Use the branded stage banner and next-up block from `${CLAUDE_SKILL_DIR}/templates/completion-output.md.tmpl`.
Fill in: `{N}` (phase number), `{phase-name}`, `{plan_count}`, `{plan_list_lines}` (one line per plan with wave and task count), `{wave_table_lines}` (one line per wave).
