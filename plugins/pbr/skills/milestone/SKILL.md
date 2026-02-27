---
name: milestone
description: "Manage milestones: new, complete, audit, gaps."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "new|complete|audit|gaps [version]"
---
<!-- markdownlint-disable MD012 MD046 -->

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► MILESTONE                                  ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:milestone — Milestone Management

You are running the **milestone** skill. Milestones represent significant project checkpoints — a set of phases that together deliver a cohesive chunk of functionality. This skill handles the full milestone lifecycle: creation, completion, auditing, and gap analysis.

This skill runs **inline** for most subcommands, but spawns agents for `audit`.

---

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Never** perform integration checks yourself — delegate to the integration-checker subagent
- **Minimize** reading audit and verification outputs — read only frontmatter and status fields
- **Delegate** all cross-phase integration analysis to the integration-checker subagent

---

## Core Principle

**Milestones are the rhythm of the project.** They force you to step back, verify everything works together, and create a clean snapshot before moving on. Never skip the audit — integration issues hide at milestone boundaries.

---

## Argument Parsing

Parse `$ARGUMENTS` for the subcommand and optional version:

```
$ARGUMENTS format: {subcommand} [{version/name}]

Examples:
  "new"              → subcommand=new, arg=none
  "new User Auth"    → subcommand=new, arg="User Auth"
  "complete v1.0"    → subcommand=complete, arg="v1.0"
  "complete 1.0"     → subcommand=complete, arg="v1.0" (auto-prefix v)
  "preview v1.0"     → subcommand=preview, arg="v1.0"
  "audit v1.0"       → subcommand=audit, arg="v1.0"
  "audit"            → subcommand=audit, arg=current milestone
  "gaps"             → subcommand=gaps, arg=most recent audit
```

**If no subcommand recognized:** Show usage:
```
Usage: /pbr:milestone <subcommand> [version]

Subcommands:
  new [name]       — Start a new milestone cycle
  complete [ver]   — Archive completed milestone
  preview [ver]    — Dry-run of complete (show what would happen)
  audit [ver]      — Verify milestone completion
  gaps             — Create phases to close audit gaps
```

---

## Subcommand: `new`

Start a new milestone cycle with new phases.

### Flow

1. **Read current state:**
   - Read ROADMAP.md to see existing phases
   - Read STATE.md for current position
   - Read PROJECT.md if it exists (milestone history)

2. **Get milestone details** via AskUserQuestion:
   - "What's the name/goal for this new milestone?"
   - "What are the major features or capabilities it should deliver?"
   - If the user provided a name in `$ARGUMENTS`, use it and skip the name question

3. **Determine phase numbering:**
   - Find the highest phase number in the current ROADMAP.md
   - New phases start at highest + 1
   - Example: if phases 1-5 exist, new milestone starts at phase 6

4. **Mini roadmap session:**
   Run a condensed version of the `/pbr:begin` questioning flow:

   a. Ask about major components needed (via AskUserQuestion):
      - "What are the 2-5 major areas of work for this milestone?"

   b. For each area, ask:
      - "Any specific requirements or constraints for {area}?"

   c. Generate phases from the areas:
      - Each major area becomes a phase
      - Order by dependency (foundations first)
      - Include brief description and success criteria

5. **Update ROADMAP.md:**
   Append new milestone section:

   ```markdown
   ---

   ## Milestone: {name}

   **Goal:** {goal statement}
   **Phases:** {start_num} - {end_num}

   ### Phase {N}: {name}
   **Goal:** {goal}
   **Requirements:** {list}
   **Success criteria:** {criteria}
   **Depends on:** {prior phases}

   ### Phase {N+1}: {name}
   ...
   ```

6. **Create phase directories:**
   For each new phase:
   ```
   .planning/phases/{NN}-{slug}/
   ```

7. **Update PROJECT.md** (create if needed):
   Add milestone to the active milestones list:

   ```markdown
   ## Active Milestones

   ### {name}
   - **Phases:** {start} - {end}
   - **Created:** {date}
   - **Status:** In progress
   ```

**CRITICAL -- DO NOT SKIP: Update STATE.md frontmatter AND body with new milestone info.**

8. **Update STATE.md:**
   - Set current phase to the first new phase
   - Update milestone info

9. **Commit** if `planning.commit_docs: true`:
   ```
   docs(planning): start milestone "{name}" (phases {start}-{end})
   ```

10. **Confirm** with branded output:
    ```
    ╔══════════════════════════════════════════════════════════════╗
    ║  PLAN-BUILD-RUN ► MILESTONE CREATED ✓                        ║
    ╚══════════════════════════════════════════════════════════════╝

    **Milestone: {name}** — {count} phases

    Phases:
    {N}. {name}
    {N+1}. {name}
    ...



    ╔══════════════════════════════════════════════════════════════╗
    ║  ▶ NEXT UP                                                   ║
    ╚══════════════════════════════════════════════════════════════╝

    **Phase {N}: {name}** — start with discussion or planning

    `/pbr:discuss {N}`

    <sub>`/clear` first → fresh context window</sub>



    **Also available:**
    - `/pbr:plan {N}` — skip discussion, plan directly
    - `/pbr:status` — see project status


    ```

---

## Subcommand: `preview`

Dry-run of milestone completion — shows what would happen without making any changes.

### Flow

1. **Determine version:**
   - Same logic as `complete`: use `$ARGUMENTS` or ask via AskUserQuestion

2. **Identify milestone phases:**
   - Read ROADMAP.md to find phases belonging to this milestone
   - List each phase with its current status (from STATE.md or VERIFICATION.md)

3. **Verification status check:**
   - For each milestone phase, check if VERIFICATION.md exists and its `result` frontmatter
   - Flag phases that are unverified or have stale verification (SUMMARY.md newer than VERIFICATION.md)

4. **Preview archive structure:**
   - Show what the archive directory would look like:
     ```
     .planning/milestones/v{version}/
     ├── ROADMAP.md (snapshot)
     ├── STATS.md (would be generated)
     ├── REQUIREMENTS.md (snapshot)
     └── phases/
         ├── {NN}-{slug}/ (moved from .planning/phases/)
         │   ├── PLAN-01.md
         │   ├── SUMMARY.md
         │   └── VERIFICATION.md
         └── ...
     ```

5. **Show what would change:**
   - Which phase directories would be moved
   - What ROADMAP.md section would be collapsed
   - What STATE.md updates would occur
   - What git tag would be created

6. **Display summary:**
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  PLAN-BUILD-RUN ► MILESTONE PREVIEW — v{version}             ║
   ╚══════════════════════════════════════════════════════════════╝

   Phases to archive: {count}
   ✓ Verified: {verified_count}
   ⚠ Unverified: {unverified_count}
   ⚠ Stale verification: {stale_count}

   Archive location: .planning/milestones/v{version}/
   Git tag: v{version}

   Ready to complete? Run: /pbr:milestone complete v{version}
   ```

**CRITICAL**: This subcommand is READ-ONLY. Do not create directories, move files, modify STATE.md, modify ROADMAP.md, or create git tags. Only read and display.

---

## Subcommand: `complete`

Archive a completed milestone and prepare for the next one.

### Flow

1. **Determine version:**
   - If provided in `$ARGUMENTS`: use it (auto-prefix `v` if missing)
   - If not provided: ask via AskUserQuestion: "What version number for this milestone? (e.g., v1.0)"

2. **Verify all phases are complete:**
   - Read ROADMAP.md to find milestone phases
   - For each phase, check for VERIFICATION.md
   - If any phase lacks VERIFICATION.md:

     Present the warning context:
       Unverified phases:
       - Phase {N}: {name}
       - Phase {M}: {name}

     Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
       question: "{count} phases haven't been verified. Continue with milestone completion?"
       header: "Unverified"
       options:
         - label: "Continue anyway"  description: "Proceed despite unverified phases (not recommended)"
         - label: "Stop and review"  description: "Run /pbr:review for unverified phases first"
     - If "Stop and review" or "Other": stop and suggest the review commands for each unverified phase
     - If "Continue anyway": proceed with warning noted

   **Timestamp freshness check:**
   For each phase that has a VERIFICATION.md, compare its `checked_at` frontmatter timestamp against the most recent SUMMARY.md file modification date in that phase directory (use `ls -t` or file stats).
   If any SUMMARY.md is newer than its VERIFICATION.md `checked_at`:
   - Warn: "Phase {N} ({name}) was modified after verification. The VERIFICATION.md may not reflect the current code state."
   - List affected phases with their freshness details

   Use AskUserQuestion (pattern: stale-continue from `skills/shared/gate-prompts.md`):
     question: "{count} phases were modified after verification. Re-verify or continue?"
     header: "Stale"
     options:
       - label: "Re-verify"        description: "Run /pbr:review for affected phases (recommended)"
       - label: "Continue anyway"   description: "Proceed with potentially outdated verification"
   - If "Re-verify" or "Other": suggest the review commands for affected phases and stop
   - If "Continue anyway": proceed with warning noted

3. **Gather milestone stats:**

   ```bash
   # Get commit range for this milestone's phases
   git log --oneline --since="{milestone start date}" --until="now"

   # Count files changed
   git diff --stat {first_milestone_commit}..HEAD
   ```

   Collect:
   - Total commits in milestone
   - Total files changed
   - Lines added / removed
   - Duration (start date to now)
   - Number of phases completed
   - Number of plans executed
   - Number of quick tasks

4. **Extract accomplishments:**
   Read all SUMMARY.md files for milestone phases:
   - Collect `provides` fields (what was built)
   - Collect `key_decisions` fields
   - Collect `patterns` fields
   - Collect `tech_stack` union

5. **Archive milestone documents:**

   **CRITICAL: Pre-flight safety checks BEFORE archiving. Do NOT skip this step.**

   Before creating or moving anything, verify the destination is safe:
   - Check if `.planning/milestones/{version}/` already exists
   - If it exists AND contains files (phases/, STATS.md, etc.), STOP and display:
     ```
     ╔══════════════════════════════════════════════════════════════╗
     ║  ERROR                                                       ║
     ╚══════════════════════════════════════════════════════════════╝

     Archive destination `.planning/milestones/{version}/` already contains files.
     Completing this milestone would overwrite the existing archive.

     **To fix:** Run `/pbr:health` or manually inspect `.planning/milestones/{version}/`.
     Use a different version number (e.g., {version}.1) or remove the existing archive first.
     ```
     Ask the user via AskUserQuestion whether to use a different version or abort.
   - Verify each source phase directory exists before attempting to move it
   - If any source phase directory is missing, warn but continue with the phases that do exist

   **CRITICAL: Create the archive directory .planning/milestones/{version}/ NOW. Do NOT skip this step.**

   Create a versioned archive directory and move phase directories into it:
   - `.planning/milestones/{version}/ROADMAP.md` — snapshot of ROADMAP.md at completion
   - `.planning/milestones/{version}/REQUIREMENTS.md` — **CRITICAL: Copy REQUIREMENTS.md to archive NOW. Do NOT skip this step.** Snapshot of REQUIREMENTS.md
   - `.planning/milestones/{version}/STATS.md` — milestone statistics
   - `.planning/milestones/{version}/phases/{NN}-{slug}/` — move each milestone phase directory from `.planning/phases/` into the archive

   **CRITICAL: Move phase directories from .planning/phases/ to archive NOW. Do NOT skip this step.**

   **Move phases:** For each phase belonging to this milestone, move (not copy) its directory from `.planning/phases/{NN}-{slug}/` to `.planning/milestones/{version}/phases/{NN}-{slug}/`. This keeps the active phases directory clean for the next milestone.

   **CRITICAL: Write STATS.md to .planning/milestones/{version}/STATS.md NOW. Do NOT skip this step.**

   **Stats file content:**

   Read `skills/milestone/templates/stats-file.md.tmpl` for the stats file format. Fill in all `{variable}` placeholders with actual data gathered in Steps 3-4.

6. **Update PROJECT.md:**
   - Move milestone from "Active" to "Completed"
   - Add completion date and version tag

   ```markdown
   ## Completed Milestones

   ### {name} ({version})
   - **Completed:** {date}
   - **Phases:** {start} - {end}
   - **Key deliverables:** {summary}
   ```

   - Move validated requirements from active to completed section

**CRITICAL: Update ROADMAP.md with collapsed milestone section NOW. Do NOT skip this step.**

7. **Collapse completed phases in ROADMAP.md:**
   Replace detailed phase entries with collapsed summaries:

   ```markdown
   ## Milestone: {name} ({version}) -- COMPLETED

   Phases {start}-{end} completed on {date}. See `.planning/milestones/{version}/ROADMAP.md` for details.

   | Phase | Status |
   |-------|--------|
   | {N}. {name} | Completed |
   | {N+1}. {name} | Completed |
   ```

**CRITICAL: Update STATE.md to mark milestone as complete NOW. Do NOT skip this step.**

7b. **Update STATE.md:**
   - Update `.planning/STATE.md` to mark the milestone as complete
   - Clear the current milestone field or set status to "completed"
   - Update last activity timestamp
   - Record the milestone version in the history/completed section

7c. **Update HISTORY.md:**
   - Append a milestone completion entry to `.planning/HISTORY.md`:
     ```markdown
     ## {date} — Milestone {version} Completed

     - Milestone: {name}
     - Phases: {start} - {end}
     - Duration: {duration} days
     - Key deliverables: {summary from Step 4}
     ```

7d. **Aggregate learnings from milestone phases:**

**CRITICAL: Run learnings aggregation NOW. Do NOT skip this step.**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/milestone-learnings.js .planning/milestones/{version} --project {project-name-from-STATE.md}
```

- If the script outputs an error, log it but do NOT abort milestone completion — learnings aggregation is advisory.
- Display the aggregation summary line to the user (e.g., "Learnings aggregated: 12 new, 3 updated, 0 errors").
- After aggregation, check for triggered deferral thresholds:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js learnings check-thresholds
```

If any thresholds are triggered, display each as a notification:

```
Note: Learnings threshold met — {key}: {trigger}. Consider implementing the deferred feature.
```

8. **Git tag:**
   ```bash
   git tag -a {version} -m "Milestone: {name}"
   ```

9. **Commit:**
   ```bash
   git add .planning/milestones/ .planning/phases/ .planning/ROADMAP.md .planning/PROJECT.md .planning/STATE.md .planning/HISTORY.md
   git commit -m "docs(planning): complete milestone {version}"
   ```

### Post-Completion Smoke Test

If `config.deployment.smoke_test_command` is set and non-empty:

1. Run the command via Bash
2. If exit code 0: display "Smoke test passed" with command output
3. If exit code non-zero: display advisory warning:

   ```
   ⚠ Smoke test failed (exit code {N})
   Command: {smoke_test_command}
   Output: {first 20 lines of output}
   ```

   This is advisory only — the milestone is already archived. Surface it as a potential issue for the user to investigate.

10. **Confirm** with branded output:
    ```
    ╔══════════════════════════════════════════════════════════════╗
    ║  PLAN-BUILD-RUN ► MILESTONE COMPLETE 🎉                      ║
    ╚══════════════════════════════════════════════════════════════╝

    **{version}**

    Stats:
    - {count} phases, {count} plans
    - {count} commits, {lines} lines of code
    - {duration} days

    Archived to: .planning/milestones/{version}/
    Git tag: {version}



    ╔══════════════════════════════════════════════════════════════╗
    ║  ▶ NEXT UP                                                   ║
    ╚══════════════════════════════════════════════════════════════╝

    **Start the next milestone** — plan new features

    `/pbr:milestone new`

    <sub>`/clear` first → fresh context window</sub>



    **Also available:**
    - `/pbr:status` — see project status
    - `/pbr:help` — see all commands


    ```

---

## Subcommand: `audit`

Verify milestone completion with cross-phase integration checks.

### Flow

1. **Determine target:**
   - If version provided: audit that specific milestone
   - If no version: audit the current milestone (most recent active)

2. **Read all VERIFICATION.md files** for milestone phases:
   - Collect verification results
   - Note any `gaps_found` statuses
   - Note any phases without verification

3. **Spawn integration checker:**

   Display to the user: `◐ Spawning integration checker...`

   Spawn `Task(subagent_type: "pbr:integration-checker")` with:

   ```
   You are integration-checker. Perform cross-phase integration verification.

   <files_to_read>
   CRITICAL: Read these files BEFORE any other action:
   1. .planning/ROADMAP.md — phase structure, goals, and dependencies
   2. .planning/phases/{NN}-{slug}/SUMMARY.md — for each milestone phase (read all)
   </files_to_read>

   Milestone: {version or "current"}
   Phases to check: {list of phase directories}

   Instructions:
   1. Read all SUMMARY.md files for the milestone phases
   2. Build a dependency graph from provides/affects/requires fields
   3. Verify integration points:
      a. Every "requires" in a later phase is "provided" by an earlier phase
      b. Every "affects" target still exists and hasn't been broken
      c. No circular dependencies
      d. No orphaned provides (things built but never consumed)
   4. Check for:
      - Broken imports/references between phases
      - API contract mismatches
      - Missing error handling at integration points
      - Configuration inconsistencies
   5. Return findings as a structured report
   ```

4. **Check integration-checker completion:**

   After the integration-checker completes, check for `## INTEGRATION CHECK COMPLETE` in the Task() output. If the marker is absent, warn: `⚠ Integration checker did not return completion marker — results may be incomplete.` Proceed with whatever findings were returned but note the incomplete status in the audit report.

5. **Check requirements coverage:**
   - Read REQUIREMENTS.md
   - For each requirement tagged for this milestone:
     - Search VERIFICATION.md files for coverage
     - Search SUMMARY.md `provides` fields
     - Flag uncovered requirements

6. **Write audit report:**

   Create `.planning/{version}-MILESTONE-AUDIT.md` using the template:

   Read `skills/milestone/templates/audit-report.md.tmpl` for the audit report format. Fill in all `{variable}` placeholders with actual data from the audit.

   **Spot-check:** After writing, verify `.planning/{version}-MILESTONE-AUDIT.md` exists on disk using Glob. If missing, re-attempt the write. If still missing, display an error and include findings inline.

7. **Report to user** using branded banners:

   **If PASSED:**
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  PLAN-BUILD-RUN ► MILESTONE AUDIT PASSED ✓                   ║
   ╚══════════════════════════════════════════════════════════════╝

   All phases verified, integration checks passed, requirements covered.



   ╔══════════════════════════════════════════════════════════════╗
   ║  ▶ NEXT UP                                                   ║
   ╚══════════════════════════════════════════════════════════════╝

   **Complete the milestone** — archive and tag

   `/pbr:milestone complete {version}`

   <sub>`/clear` first → fresh context window</sub>



   **Also available:**
   - `/pbr:milestone gaps` — address any minor issues first
   - `/pbr:status` — see project status


   ```

   **If GAPS FOUND:**
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  PLAN-BUILD-RUN ► MILESTONE AUDIT — GAPS FOUND ⚠             ║
   ╚══════════════════════════════════════════════════════════════╝

   Found {count} gaps:
   - {gap 1}
   - {gap 2}



   ╔══════════════════════════════════════════════════════════════╗
   ║  ▶ NEXT UP                                                   ║
   ╚══════════════════════════════════════════════════════════════╝

   **Close the gaps** — create fix phases

   `/pbr:milestone gaps`

   <sub>`/clear` first → fresh context window</sub>



   **Also available:**
   - `/pbr:milestone complete` — proceed despite gaps
   - `/pbr:status` — see project status


   ```

   **If TECH DEBT:**
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  PLAN-BUILD-RUN ► MILESTONE AUDIT — TECH DEBT ⚠              ║
   ╚══════════════════════════════════════════════════════════════╝

   Milestone functional but has {count} tech debt items.



   ╔══════════════════════════════════════════════════════════════╗
   ║  ▶ NEXT UP                                                   ║
   ╚══════════════════════════════════════════════════════════════╝

   **Address tech debt or proceed**

   `/pbr:milestone gaps` — create cleanup phases
   `/pbr:milestone complete` — proceed as-is

   <sub>`/clear` first → fresh context window</sub>


   ```

---

## Subcommand: `gaps`

Create phases to close gaps found during an audit.

### Flow

1. **Find most recent audit:**
   - Search for `*-MILESTONE-AUDIT.md` in `.planning/`
   - If multiple, use the most recent
   - If none: "No audit found. Run `/pbr:milestone audit` first."

2. **Read audit report:**
   - Extract all gaps and tech debt items
   - Parse severity levels

3. **Prioritize gaps:**

   Group by priority:
   - **Must fix** (critical/high): Blocking issues, broken integration, uncovered requirements
   - **Should fix** (medium): Non-critical integration issues, important tech debt
   - **Nice to fix** (low): Minor tech debt, optimization opportunities

4. **Present to user:**

   ```
   Gaps from milestone audit:

   Must fix ({count}):
   - {gap}: {description}

   Should fix ({count}):
   - {gap}: {description}

   Nice to fix ({count}):
   - {gap}: {description}

   Use AskUserQuestion (pattern: multi-option-priority from `skills/shared/gate-prompts.md`):
     question: "Which gaps should we address? ({must_count} must-fix, {should_count} should-fix, {nice_count} nice-to-fix)"
     header: "Priority"
     options:
       - label: "Must-fix only"    description: "Address {must_count} critical/high gaps"
       - label: "Must + should"    description: "Address {must_count + should_count} critical through medium gaps"
       - label: "Everything"       description: "Address all {total_count} gaps including low priority"
       - label: "Let me pick"      description: "Choose specific gaps to address"
   - If "Must-fix only": filter to must-fix gaps for phase creation
   - If "Must + should": filter to must-fix + should-fix gaps
   - If "Everything": include all gaps
   - If "Let me pick" or "Other": present individual gaps for selection

5. **Group into logical phases:**
   - Group related gaps together (same subsystem, same files)
   - Each group becomes a phase
   - Name phases descriptively: "{N+1}. Fix {area} integration" or "{N+1}. Address {component} gaps"

6. **Update ROADMAP.md:**
   Add gap-closure phases after the current milestone phases:

   ```markdown
   ### Phase {N}: Fix {area} (gap closure)
   **Goal:** Address gaps found in milestone audit
   **Gaps addressed:**
   - {gap 1}
   - {gap 2}
   **Success criteria:** All addressed gaps pass verification
   ```

7. **Create phase directories:**
   ```
   .planning/phases/{NN}-fix-{slug}/
   ```

8. **Commit:**
   ```
   docs(planning): add gap-closure phases from milestone audit
   ```

9. **Confirm** with branded output:
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  PLAN-BUILD-RUN ► GAP PHASES CREATED ✓                       ║
   ╚══════════════════════════════════════════════════════════════╝

   Created {count} gap-closure phase(s):
   - Phase {N}: {name}
   - Phase {N+1}: {name}



   ╔══════════════════════════════════════════════════════════════╗
   ║  ▶ NEXT UP                                                   ║
   ╚══════════════════════════════════════════════════════════════╝

   **Plan the first gap-closure phase**

   `/pbr:plan {N}`

   <sub>`/clear` first → fresh context window</sub>



   **Also available:**
   - `/pbr:status` — see project status


   ```

---

## State Integration

All subcommands update STATE.md:
- `new`: Sets current milestone, resets phase
- `complete`: Clears current milestone, updates history
- `audit`: Notes audit status and date
- `gaps`: Updates phase count and roadmap info

---

## Git Integration

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

All subcommands commit if `planning.commit_docs: true`:
- `new`: `docs(planning): start milestone "{name}" (phases {start}-{end})`
- `complete`: `docs(planning): complete milestone {version}`
- `audit`: `docs(planning): audit milestone {version} - {status}`
- `gaps`: `docs(planning): add gap-closure phases from milestone audit`

Tags (complete only):
- `git tag -a {version} -m "Milestone: {name}"`

---

## Edge Cases

### No ROADMAP.md exists
- For `new`: Create one from scratch (this is a fresh start)
- For others, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No roadmap found.

**To fix:** Run `/pbr:begin` or `/pbr:milestone new` first.
```

### Milestone has no phases
Display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No phases found for this milestone.

**To fix:**
- For `complete`: Nothing to complete — add phases first.
- For `audit`: Nothing to audit — build phases first.
```

### Audit finds no gaps
- Status: PASSED
- Skip the recommendations section
- Suggest proceeding to complete

### Version already exists (tag collision)
Display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Git tag {version} already exists.

**To fix:** Use a different version number (e.g., {version}.1).
```
Ask for alternative via AskUserQuestion.

### Partially verified milestone
- `complete` warns but allows proceeding with user confirmation
- `audit` treats unverified phases as gaps

### Large milestone (8+ phases)
- `audit` may take longer due to integration checking
- Warn: "This milestone has {count} phases. The audit may take a few minutes."

---

## Anti-Patterns

1. **DO NOT** skip the audit before completing — integration issues hide at boundaries
2. **DO NOT** auto-complete milestones without user confirmation
3. **DO NOT** create gap phases without user approval of priorities
4. **DO NOT** delete audit reports — they're historical records
5. **DO NOT** reuse version numbers — each milestone gets a unique version
6. **DO NOT** modify code during milestone operations — this is project management only
7. **DO NOT** collapse phases in ROADMAP.md before archiving — archive first, collapse second
8. **DO NOT** skip the git tag — tags make milestone boundaries findable
