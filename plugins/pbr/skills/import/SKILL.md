---
name: import
description: "Import external plans. Validates context, detects conflicts, generates PLAN.md."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--from <filepath>] [--skip-checker] | --prd <filepath>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► IMPORTING PLAN                             ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:import — Plan Import

You are the orchestrator for `/pbr:import`. This skill imports an external plan document (design doc, RFC, AI-generated plan, etc.) into the Plan-Build-Run planning format. It validates the imported document against project context, detects conflicts with locked decisions and existing architecture, and generates properly formatted PLAN.md files. Your job is to stay lean, do conflict detection inline, and delegate only the plan checker to a Task() subagent.

## References

- `references/ui-brand.md` — Status symbols, banners, checkpoint boxes for import display output
- `references/questioning.md` — Questioning patterns for gap-fill prompts during PRD import

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Minimize** reading subagent output — read only verdicts, not full reports

## Prerequisites

- `.planning/config.json` exists (run `/pbr:new-project` first)
- `.planning/ROADMAP.md` exists with at least one phase
- `.planning/REQUIREMENTS.md` exists (optional — if absent, skip requirement ID cross-referencing and warn the user: "No REQUIREMENTS.md found. Skipping REQ-ID validation.")

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

Reference: `skills/shared/config-loading.md` for the tooling shortcut and config field reference.

1. Parse `$ARGUMENTS` for phase number
2. Parse optional `--from <filepath>` flag (path to the external document to import)
3. Parse optional `--skip-checker` flag (skip plan validation step)
3b. Parse optional `--prd <filepath>` flag.
    - If `--prd` is present: **branch into PRD Import Flow (Steps A–G below)** immediately after writing `.active-skill`.
    - Do NOT proceed to Step 2 (standard import flow). The --prd branch is a completely separate execution path.
    - If both `--prd` and `--from` are present: treat `--prd` as the primary flag; `--from` is ignored with an [INFO] note.
    - If `--prd` is present but no filepath follows: display error "Missing filepath for --prd flag." and stop.
4. **CRITICAL: Write .active-skill NOW.** Write the text "import" to `.planning/.active-skill` using the Write tool.

**→ If --prd flag was set: jump to PRD Import Flow (Step A). Do not continue to Step 2.**

5. Validate:
   - Phase exists in ROADMAP.md
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
6. If no phase number given, read current phase from `.planning/STATE.md`
7. Check for existing plans in the phase directory (glob for `*-PLAN.md`)
   - If plans exist: ask user via AskUserQuestion: "Phase {N} already has plans. Replace them with imported plans?"
   - If yes: note that existing plans will be overwritten in Step 7
   - If no: stop

---

## PRD Import Flow

> **Entered when `--prd <filepath>` is present in $ARGUMENTS. Steps A–G replace Steps 2–11 entirely for this path.**

---

### Step A: Read and Validate PRD File

1. Read the file at the `--prd <filepath>` path.
2. If the file does not exist: display the "Import file not found" error from the Error Handling section and stop.
3. If the file is empty or < 100 characters: display error "PRD file appears empty or too short to extract meaningful content." and stop.
4. Store the full PRD content for use in Steps B–E.

---

### Step B: Gap Detection — Identify Missing Sections (inline)

Analyze the PRD content for the presence of these six required sections:

| Section | What to look for |
|---------|-----------------|
| Project name / title | A clear product name or title |
| Problem statement | What problem the product solves, who it's for |
| Goals / success criteria | Measurable outcomes, KPIs, or acceptance tests |
| Functional requirements | Feature list, user stories, or capabilities |
| Non-functional requirements | Performance, security, reliability constraints |
| Out of scope / deferred | Explicitly excluded features |

For each section that is **absent or ambiguous**, record it as a gap.

**If 1–3 gaps found:** Batch all gaps into ≤ 3 AskUserQuestion calls (max 4 options each). Ask the user to supply the missing info:

- If 1 gap: one AskUserQuestion with a freeform prompt.
- If 2–3 gaps: group into 2 AskUserQuestion calls of related topics (e.g., "Requirements" and "Constraints/Scope").
- If > 3 gaps: group all into exactly 3 AskUserQuestion calls. Do NOT exceed 3 calls.

Example AskUserQuestion for missing requirements:

```
Use AskUserQuestion:
  question: "The PRD doesn't clearly specify functional requirements. Please describe the main features or capabilities this product must have."
  header: "Fill Gap"
  options: []   ← freeform (no options means free text input)
  multiSelect: false
```

**If 0 gaps:** proceed directly to Step C with no prompts.

Incorporate user answers into the extraction context used in Step C.

---

### Step C: Extract Project Files Inline (PROJECT.md with Context, REQUIREMENTS.md)

Using the PRD content (plus any gap-fill answers from Step B), generate the content for two files. Context is merged into PROJECT.md (not a separate CONTEXT.md). Do this inline in your context — no subagents.

**C1. Generate PROJECT.md content** using `templates/PROJECT.md.tmpl` as the structure:

- `{project_name}`: extract from PRD title/header
- `{ONE sentence core value statement}`: extract from problem statement / vision
- Vision section: 2-3 sentences from PRD problem statement
- Scope — In Scope: features from functional requirements section
- Scope — Out of Scope: features from "out of scope" section (or mark "None specified" if absent)
- Success Criteria: from goals/KPIs section
- Stakeholders: extract if present; default to "Primary user: end users of the product"
- Milestones line: leave as "Planned in {N} phases across 1 milestone — see .planning/ROADMAP.md"
- **## Context section** (merged from brownfield variant TMPL-06):
  - Locked Decisions: extract any explicit technology choices or constraints from PRD
  - User Constraints: extract deployment, team size, budget, timeline if mentioned
  - Deferred Ideas: items from "out of scope" section
  - Claude's Discretion Areas: leave empty (executor will fill as they work)

**C2. Generate REQUIREMENTS.md content** using `templates/REQUIREMENTS.md.tmpl` as the structure:

- Functional Requirements: each feature/capability from PRD becomes one REQ-F-xxx row
- Number from REQ-F-001 sequentially
- Priority: "Must" for core features, "Should" for nice-to-haves (infer from PRD language)
- Non-Functional Requirements: from performance/security/reliability section if present
- Deferred Requirements: items from "out of scope" section
- Traceability table: leave "Implemented In" and "Verified In" columns as "—"

---

### Step D: Confirmation Gate

**Check config:** Read `.planning/config.json`. If `prd.auto_extract` is `true`, skip this step entirely and proceed directly to Step E.

**If prd.auto_extract is false (default):**

Display a preview of the three generated files (show first 10 lines of each with a `...` truncation).

Then present the confirmation gate using the **approve-revise-abort** pattern from `skills/shared/gate-prompts.md`:

```
Use AskUserQuestion:
  question: "Approve these extracted files? (PROJECT.md with Context section, REQUIREMENTS.md — ROADMAP.md will be generated next)"
  header: "Approve?"
  options:
    - label: "Approve"          description: "Write files and generate ROADMAP.md"
    - label: "Request changes"  description: "Describe what to adjust before writing"
    - label: "Abort"            description: "Cancel PRD import"
  multiSelect: false
```

- **Approve**: proceed to Step E.
- **Request changes**: ask user what to change (AskUserQuestion freeform), revise the affected file(s) inline, and re-display the gate. Repeat until Approve or Abort.
- **Abort**: delete `.planning/.active-skill` and stop with message: "PRD import cancelled."

---

### Step E: Check for Existing Files and Write PROJECT.md, REQUIREMENTS.md

For each of the two files (`PROJECT.md`, `REQUIREMENTS.md` in `.planning/`):

1. Check if the file already exists (Glob `.planning/PROJECT.md`, etc.).
2. If it exists: use AskUserQuestion yes-no pattern:
   ```
   question: ".planning/{filename} already exists. Overwrite it?"
   header: "Overwrite?"
   options:
     - label: "Yes"  description: "Replace existing file"
     - label: "No"   description: "Keep existing, skip this file"
   ```
   - If No: skip writing that file.
3. Write approved content to:
   - `.planning/PROJECT.md` (includes ## Context section — do NOT create separate CONTEXT.md)
   - `.planning/REQUIREMENTS.md`

---

### Step F: Delegate ROADMAP.md Generation to pbr:planner

Display: `◆ Generating ROADMAP.md via planner...`

Spawn the planner subagent:

```
Task({
  subagent_type: "pbr:planner",
  prompt: "
You are the planner agent in Roadmap Mode.

<files_to_read>
CRITICAL: Read these files BEFORE any other action:
1. .planning/PROJECT.md
2. .planning/REQUIREMENTS.md
3. .planning/CONTEXT.md
</files_to_read>

Generate `.planning/ROADMAP.md` from the project files above.

Use the roadmap template at `${CLAUDE_PLUGIN_ROOT}/templates/ROADMAP.md.tmpl`.
Apply Requirement Coverage Validation: every requirement in REQUIREMENTS.md must appear in at least one phase.
Apply the Dual Format requirement: Quick-scan checklist at top + detailed phase descriptions.
Wrap all phases in a Milestone section named after the project.

Write ROADMAP.md to `.planning/ROADMAP.md`.
Output your completion marker when done: ## PLANNING COMPLETE
"
})
```

After the Task() completes:

- Confirm `.planning/ROADMAP.md` exists (Glob check).
- If missing: display error "Planner failed to generate ROADMAP.md. Run /pbr:plan-phase to retry." and proceed to Step G anyway (the other 3 files are already written).

---

### Step G: State Updates, Commit, and Summary

**G1. Initialize STATE.md** (if it does not already exist):

- Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state load`
- If STATE.md does not exist: create `.planning/STATE.md` with frontmatter fields:
  ```
  project: {project_name from PROJECT.md}
  current_phase: 1
  status: planning
  source: prd-import
  prd_file: {filepath}
  ```

**G2. Update STATE.md** with PRD import status:

- Set `status: planning`
- Note `source: prd-import` and `prd_file: {filepath}`

**G3. Commit (if planning.commit_docs is true in config):**

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

```
docs(planning): init project docs from PRD import
```

Stage: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/CONTEXT.md`, `.planning/ROADMAP.md` (if generated), `.planning/STATE.md`.

**G4. Delete `.planning/.active-skill`.**

**G5. Display completion banner:**

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PRD IMPORT COMPLETE ✓                       ║
╚══════════════════════════════════════════════════════════════╝

**Project**: {project_name}
**Source**: {prd_filepath}

Files generated:
  ✓ .planning/PROJECT.md (includes ## Context section)
  ✓ .planning/REQUIREMENTS.md
  {✓ or ✗} .planning/ROADMAP.md

Requirements extracted: {count} REQ-IDs
Gaps filled: {count} (via interactive prompts)



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Plan Phase 1** — generate execution plans for the first phase

`/pbr:plan-phase 1`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:discuss-phase` — review and refine decisions before planning
- `/pbr:progress` — see full project overview
```

---

> **End of PRD Import Flow. Steps 2–11 below apply only to the standard --from flow.**

---

### Step 2: Load Full Project Context (inline)

Read all relevant context files. This context is used for conflict detection in Step 4.

```
1. ROADMAP.md — extract current phase goal, dependencies, requirements, success criteria
2. REQUIREMENTS.md — extract REQ-IDs mapped to this phase
3. CONTEXT.md (project-level, if exists) — extract locked decisions, deferred ideas, constraints
4. Phase CONTEXT.md (if exists at .planning/phases/{NN}-{slug}/CONTEXT.md) — phase-specific locked decisions from /pbr:discuss-phase
5. config.json — extract feature flags, depth, model settings
6. Prior SUMMARY.md files — use digest-select depth per `skills/shared/digest-select.md` (direct deps: full body for conflict detection, transitive: frontmatter only, 2+ back: skip)
7. Research SUMMARY.md (if exists at .planning/research/SUMMARY.md)
8. Seeds — glob .planning/seeds/*.md, check trigger field for matches:
   - trigger equals the phase slug
   - trigger is a substring of the phase directory name
   - trigger equals the phase number as integer
   - trigger equals * (always matches)
9. Pending todos — scan .planning/todos/pending/ for items related to this phase
10. Notes (if .planning/notes/ exists) — check for related notes
```

Collect all of this into a context bundle for use in Steps 4 and 5.

---

### Step 3: Read and Parse Imported Document (inline)

**If `--from <filepath>` was provided:**
- Read the file at the specified path
- If the file does not exist: "File not found: {filepath}. Check the path and try again."

**If no `--from` flag:**
- Use AskUserQuestion to ask the user: "No --from path specified. Please describe or paste the plan you want to import."
- Accept the user's response as the imported document

**Parse the document into structured sections:**
1. Identify phases, steps, tasks, or sections in the document
2. Extract: scope, approach, files to create/modify, dependencies between steps, verification steps
3. Note the document's assumptions about tech stack, architecture, and project state
4. If the document is unstructured prose: extract actionable items and group them by subsystem

---

### Step 4: Conflict Detection (inline — CRITICAL)

Compare the imported plan against ALL loaded context from Step 2.

<format_rules>
HARD REQUIREMENTS FOR THIS STEP — violations are bugs:

1. Run ALL checks below (BLOCKER + WARNING + INFO) before presenting anything.
2. Use ONLY these three labels: `[BLOCKER]`, `[WARNING]`, `[INFO]`. Never CRITICAL, HIGH, MEDIUM, LOW, or any other label.
3. DO NOT use markdown tables for findings. Use the plain-text format shown below.
4. Present one consolidated "Conflict Detection Report" with three sections.
5. After the report, use AskUserQuestion if blockers exist.

WRONG (never do this):
| Area | Import | Project | Severity |
|------|--------|---------|----------|
| Framework | Fastify | Express | CRITICAL |

RIGHT (always do this):
[BLOCKER] Framework mismatch
  Found: Plan uses Fastify with @fastify/view
  Expected: Express 5.x (locked decision in CONTEXT.md)
  → Replace Fastify with Express 5.x
</format_rules>

#### BLOCKER checks (must resolve before continuing):
Run each of these checks. If any matches, record a `[BLOCKER]`:

1. **Locked decision conflict**: Does the plan contradict ANY locked decision in CONTEXT.md or phase CONTEXT.md? Check every locked decision row against the plan's tech choices, libraries, frameworks, and architecture.
2. **Deferred idea implementation**: Does the plan implement something explicitly listed in CONTEXT.md's "Deferred Ideas" section?
3. **Missing dependency phase**: Does the plan depend on a phase that does not exist in ROADMAP.md?
4. **Incomplete dependency phase**: Does the plan depend on a phase that is not complete (no SUMMARY.md with status: complete)?
5. **Architecture mismatch**: Do files referenced in the plan already exist with different architecture than the plan assumes?
6. **Tech stack mismatch**: Does the plan assume a library or framework not used by the project? Cross-check against config.json, prior SUMMARYs, RESEARCH.md files, and the codebase.

#### WARNING checks (user should review):
Run each of these checks. If any matches, record a `[WARNING]`:

1. **Requirement coverage gap**: Does the plan fail to cover all phase requirements from REQUIREMENTS.md? List each missing REQ-ID explicitly. This is mandatory — you must cross-reference every REQ-ID assigned to this phase against the plan's tasks. **Guard:** If REQUIREMENTS.md does not exist (as noted in Prerequisites), skip this check entirely and emit `[INFO] No REQUIREMENTS.md — REQ-ID coverage check skipped` instead.
2. **Task count exceeds limit**: Does any logical grouping in the plan contain more than 3 tasks? Plan-Build-Run plans are limited to 2-3 tasks each. Count the tasks in the imported document and flag if over 3.
3. **Scope exceeds file limit**: Does any logical grouping reference more than 8 files? Plan-Build-Run plans are limited to 5-8 files each.
4. **Stale dependencies**: Does the plan assume prior phase output that has changed since the plan was written?
5. **Todo overlap**: Does the plan scope overlap with a pending todo in `.planning/todos/pending/`?
6. **Naming convention mismatch**: Does the plan create files in unexpected locations that don't follow conventions from prior phases? Check directory structure patterns (e.g., routes/, services/, repositories/ vs components/, controllers/).
7. **Dependency ordering conflict**: Does the plan's task ordering conflict with the dependency graph implied by file dependencies?

#### INFO checks (supplementary context):
Run each of these checks. If any matches, record an `[INFO]`:

1. **Related notes**: Are there related notes in `.planning/notes/`?
2. **Matching seeds**: Are there matching seeds in `.planning/seeds/` that could enhance the plan?
3. **Prior phase patterns**: What patterns from prior phases (from SUMMARY.md `patterns` fields) should the imported plan follow?

#### Output format (MANDATORY — do not deviate)

Present ALL findings in a single report using this EXACT plain-text format. NEVER use markdown tables. NEVER change the labels. NEVER skip a section even if it has 0 findings:

```
## Conflict Detection Report

### BLOCKERS ({count})

[BLOCKER] {Short title}
  Found: {what the imported plan says or does}
  Expected: {what the project context requires}
  → {Specific action to resolve}

[BLOCKER] {Short title}
  Found: ...
  Expected: ...
  → ...

### WARNINGS ({count})

[WARNING] {Short title}
  Found: {what was detected}
  Impact: {what could go wrong if not addressed}
  → {Suggested action}

### INFO ({count})

[INFO] {Short title}
  Note: {relevant information or suggestion}
```

#### After presenting the report

**IMPORTANT: Always present ALL findings (blockers + warnings + info) together in one report before taking any action.**

- If any BLOCKERS exist: after the report, ask user to resolve EACH blocker via AskUserQuestion. Do not proceed to Step 5 until all blockers are resolved or the user explicitly chooses to override.
- If only WARNINGS and INFO: after the report, ask user: "Acknowledge these findings and continue with conversion?" via AskUserQuestion. If yes, continue. If no, discuss adjustments.
- If no findings: "No conflicts detected. Proceeding with conversion."

---

### Step 5: Convert to PLAN.md Format (inline)

Using the imported document (adjusted for any blocker resolutions from Step 4) and the loaded project context, generate PLAN.md content.

**YAML frontmatter — ALL required fields:**
```yaml
---
phase: "{NN}-{slug}"
plan: "{phase}-{plan_num}"
type: "{task type: feature, refactor, config, test, docs}"
wave: {wave number — 1 for independent plans, 2+ for dependent plans}
depends_on: [{list of plan IDs this plan depends on}]
files_modified: [{list of files this plan creates or modifies}]
autonomous: {true if no checkpoints needed, false if human input required}
discovery:
  approach: "{brief description of what this plan accomplishes}"
  open_questions: [{any unresolved questions from the import}]
must_haves:
  truths: [{core invariants this plan must satisfy}]
  artifacts: [{files that must exist after execution}]
  key_links: [{connections to other parts of the system}]
provides: [{what downstream plans can depend on from this plan}]
gap_closure: {false for standard plans, true if closing gaps}
---
```

**Task XML — for each task in the plan:**
```xml
<task id="{plan_id}-T{N}">
  <name>{Imperative task name}</name>
  <files>{comma-separated list of files this task touches}</files>
  <action>
    {Step-by-step implementation instructions — specific enough for an executor agent to follow mechanically.}
    {Include exact file paths, function signatures, import statements.}
  </action>
  <verify>
    {Concrete verification commands: test commands, grep checks, build commands.}
    {Each verify step must be runnable from the command line.}
  </verify>
  <done>{One-sentence definition of done for this task.}</done>
</task>
```

**Scope rules:**
- 2-3 tasks per plan, 5-8 files per plan maximum
- If the imported document is too large for a single plan: split by subsystem into multiple plans with wave ordering
- If the imported document is vague on specifics: fill in details from the codebase (function signatures, file paths, import patterns) and flag inferences with HTML comments: `<!-- inferred from codebase: ... -->`

**Wave assignment:**
- Plans with no inter-dependencies: wave 1 (can run in parallel)
- Plans that depend on wave 1 outputs: wave 2
- Continue numbering for deeper dependency chains

---

### Step 6: Plan Checker (delegated, unless --skip-checker)

**Skip this step if:**
- `--skip-checker` flag is set
- `features.plan_checking` is `false` in config

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

**Checker Prompt Template:**
```
You are the plan-checker agent.

<files_to_read>
CRITICAL: Read these files BEFORE any other action:
1. .planning/CONTEXT.md — locked decisions and constraints (if exists)
2. .planning/STATE.md — current project state and progress
3. .planning/ROADMAP.md — phase structure, goals, and dependencies
</files_to_read>

<plans_to_check>
{For each generated PLAN.md:}
--- Plan File: {filename} ---
[Inline the FULL content of each plan file]
--- End Plan File ---
</plans_to_check>

<phase_context>
Phase goal: {goal from roadmap}
Phase requirements: {REQ-IDs}
</phase_context>

<context>
{Inline .planning/CONTEXT.md if it exists — project-level locked decisions}
{Inline .planning/phases/{NN}-{slug}/CONTEXT.md if it exists — phase-level locked decisions}
</context>

<import_note>
These plans were imported from an external document, not generated by the standard planner.
Pay extra attention to:
- Consistency with project conventions
- Completeness of verify steps
- Accuracy of files_modified lists
- Whether task actions are specific enough for mechanical execution
</import_note>

Run all verification dimensions on these plans. Return your structured report.
Do NOT write any files. Return your findings as your response text.
```

**Process checker results — completion marker check:**

After the plan-checker completes, check for completion markers in the Task() output:

- If `## CHECK PASSED` is present: skip the revision loop entirely and proceed to Step 7.
- If `## ISSUES FOUND` is present: enter the revision loop below.
- If neither marker is found: treat as issues found and enter the revision loop.

**Revision loop:**

Reference: `skills/shared/revision-loop.md` for the full Check-Revise-Escalate pattern (max 3 iterations).

Follow the revision loop with:
- **Producer**: orchestrator (inline plan revision)
- **Checker**: plan-checker (re-run Step 6)
- **Escalation**: present issues to user, offer "Proceed anyway" or "Adjust approach" (re-enter Step 5)

---

### Step 7: Write PLAN.md Files (inline)

Write each plan to `.planning/phases/{NN}-{slug}/PLAN-{plan_num}.md`.

If existing plans are being replaced (user confirmed in Step 1):
- Delete existing `*-PLAN.md` files in the phase directory before writing new ones

---

**Step 7b — Spot-check artifacts:**

After writing plan files, verify they landed on disk:

1. Glob `.planning/phases/{NN}-{slug}/PLAN-*.md` to confirm files exist
2. Count matches — must equal the number of plans generated in Step 5
3. If any are missing: re-attempt the write. If still missing, display an error listing the missing files.

---

### Step 8: Update All State (inline)

Perform all state updates in this order:

**8a. Update ROADMAP.md Progress table** (REQUIRED — do this BEFORE updating STATE.md):
1. Open `.planning/ROADMAP.md`
2. Find the `## Progress` table
3. Locate the row matching this phase number
4. Update the `Plans Complete` column to `0/{N}` where N = number of plan files created
5. Update the `Status` column to `planned`
6. Save the file — do NOT skip this step

**CRITICAL -- DO NOT SKIP: Update STATE.md frontmatter AND body with import status.**

**8b. Update STATE.md:**
- Set current phase plan status to "planned"
- Note source: "imported from {filepath}" or "imported from user input"
- Update plan count

**8c. Generate dependency fingerprints:**
For each dependency phase (phases that this phase depends on, per ROADMAP.md):
1. Find all SUMMARY.md files in the dependency phase directory
2. Compute a fingerprint for each: file byte length + last-modified timestamp
3. Add a `dependency_fingerprints` field to each plan's YAML frontmatter:
   ```yaml
   dependency_fingerprints:
     "01-01": "len:4856-mod:2025-02-08T09:40"
     "01-02": "len:4375-mod:2025-02-08T09:43"
   ```

**8d. Update CONTEXT.md (conditional):**
If the import process surfaced new locked decisions (from blocker resolutions in Step 4), append them to `.planning/CONTEXT.md` under the Decisions section.

**8e. Emit workflow event (conditional):**
If the event-logger script is available:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js event workflow plan-import --phase {N} --plans {count} --source {filepath_or_user_input}
```
Falls back silently if the command is not available.

---

### Step 9: Commit (if planning.commit_docs: true in config)

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

Stage the new PLAN.md files and any updated state files:
```
docs({phase}): import plans for phase {N} ({count} plans, {wave_count} waves)
```

---

### Step 10: Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

### Step 11: Confirm (inline)

Present a summary of the import using the branded banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► IMPORT COMPLETE ✓                          ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {name}** — {plan_count} plans imported

Source: {filepath or "user input"}
Conflicts resolved: {count of blockers resolved in Step 4}
Warnings acknowledged: {count}

Plans:
  {phase}-01: {plan name} (Wave {W}, {task_count} tasks)
  {phase}-02: {plan name} (Wave {W}, {task_count} tasks)

Wave execution order:
  Wave 1: Plan 01, Plan 02 (parallel)
  Wave 2: Plan 03 (depends on 01, 02)

Must-haves coverage: {count} truths across {plan_count} plans
Requirements traced: {count}/{total} REQ-IDs covered



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Build Phase {N}** — execute these imported plans

`/pbr:execute-phase {N}`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:plan-phase {N}` — re-plan from scratch if import needs rework
- `/pbr:discuss-phase {N}` — talk through details before building


```

---

## Error Handling

**IMPORTANT:** On ALL error exits below, delete `.planning/.active-skill` if it exists before displaying the error message.

### Phase not found
If the specified phase does not exist in ROADMAP.md, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} not found.

**To fix:** Run `/pbr:progress` to see available phases.
```

### Missing prerequisites
If REQUIREMENTS.md or ROADMAP.md do not exist, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Project not initialized.

**To fix:** Run `/pbr:new-project` first.
```

### Import file not found
If `--from <filepath>` points to a nonexistent file, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

File not found: {filepath}

**To fix:** Check the path and try again.
```

### PRD file too short
If the PRD file is < 100 characters:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

PRD file appears empty or too short to extract meaningful content.

**To fix:** Provide a more complete PRD document (minimum ~100 characters).
```

### PRD import cancelled
If user selects "Abort" at the confirmation gate (Step D):
Display: "PRD import cancelled." and delete `.planning/.active-skill`.

### Import document too vague
If the imported document contains no actionable tasks, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

The imported document is too vague to convert into plans. No specific tasks, files, or implementation steps found.

**To fix:** Provide a more detailed document, or use `/pbr:plan-phase {N}` to generate plans from scratch.
```

### Checker loops without resolution
After 3 revision iterations without passing, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Import plan checker failed to pass after 3 revision iterations.

**To fix:** Review the remaining issues below and decide whether to proceed or revise manually.
```

Present remaining issues and ask user to decide: proceed or intervene.

---

## Files Created/Modified by /pbr:import

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/{NN}-{MM}-PLAN.md` | Imported plan files | Step 7 |
| `.planning/ROADMAP.md` | Plans Complete + Status updated to `planned` | Step 8a |
| `.planning/STATE.md` | Updated with plan status and import source | Step 8b |
| `.planning/CONTEXT.md` | Updated if blockers surfaced new locked decisions | Step 8d |
| `.planning/PROJECT.md` | Generated from PRD | Step E (PRD flow) |
| `.planning/REQUIREMENTS.md` | Generated from PRD | Step E (PRD flow) |
| `.planning/CONTEXT.md` | Generated from PRD | Step E (PRD flow) |
| `.planning/ROADMAP.md` | Generated by planner subagent | Step F (PRD flow) |
