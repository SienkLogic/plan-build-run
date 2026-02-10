---
name: milestone
description: "Manage milestones: new, complete, audit, gaps."
allowed-tools: Read, Write, Bash, Glob, Grep, Task
argument-hint: "new|complete|audit|gaps [version]"
---

# /dev:milestone — Milestone Management

You are running the **milestone** skill. Milestones represent significant project checkpoints — a set of phases that together deliver a cohesive chunk of functionality. This skill handles the full milestone lifecycle: creation, completion, auditing, and gap analysis.

This skill runs **inline** for most subcommands, but spawns agents for `audit`.

---

## Context Budget

Keep the orchestrator lean. Follow these rules:
- **Never** read agent definitions (agents/*.md) — subagent_type auto-loads them
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
  "audit v1.0"       → subcommand=audit, arg="v1.0"
  "audit"            → subcommand=audit, arg=current milestone
  "gaps"             → subcommand=gaps, arg=most recent audit
```

**If no subcommand recognized:** Show usage:
```
Usage: /dev:milestone <subcommand> [version]

Subcommands:
  new [name]       — Start a new milestone cycle
  complete [ver]   — Archive completed milestone
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
   Run a condensed version of the `/dev:begin` questioning flow:

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

8. **Update STATE.md:**
   - Set current phase to the first new phase
   - Update milestone info

9. **Commit** if `planning.commit_docs: true`:
   ```
   docs(planning): start milestone "{name}" (phases {start}-{end})
   ```

10. **Confirm:**
    ```
    Milestone "{name}" created with {count} phases.

    Phases:
    {N}. {name}
    {N+1}. {name}
    ...

    Next: /dev:discuss {N} or /dev:plan {N}
    ```

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
     ```
     Warning: Phase {N} ({name}) hasn't been verified.
     Run `/dev:review {N}` first.

     Unverified phases:
     - Phase {N}: {name}
     - Phase {M}: {name}

     Continue anyway? (not recommended)
     ```
   - Use AskUserQuestion to let user decide
   - If user says no: stop and suggest the review commands
   - If user says yes: proceed with warning noted

   **Timestamp freshness check:**
   For each phase that has a VERIFICATION.md, compare its `checked_at` frontmatter timestamp against the most recent SUMMARY.md file modification date in that phase directory (use `ls -t` or file stats).
   If any SUMMARY.md is newer than its VERIFICATION.md `checked_at`:
   - Warn: "Phase {N} ({name}) was modified after verification. The VERIFICATION.md may not reflect the current code state."
   - List affected phases
   - Use AskUserQuestion: "Re-run `/dev:review` for affected phases, or proceed anyway?"
   - If user chooses to re-run: suggest the review commands and stop
   - If user chooses to proceed: continue with warning noted

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

   Copy/create archive files:
   - `.planning/milestones/{version}-ROADMAP.md` — snapshot of ROADMAP.md at completion
   - `.planning/milestones/{version}-REQUIREMENTS.md` — snapshot of REQUIREMENTS.md
   - `.planning/milestones/{version}-STATS.md` — milestone statistics

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

7. **Collapse completed phases in ROADMAP.md:**
   Replace detailed phase entries with collapsed summaries:

   ```markdown
   ## Milestone: {name} ({version}) -- COMPLETED

   Phases {start}-{end} completed on {date}. See `.planning/milestones/{version}-ROADMAP.md` for details.

   | Phase | Status |
   |-------|--------|
   | {N}. {name} | Completed |
   | {N+1}. {name} | Completed |
   ```

8. **Git tag:**
   ```bash
   git tag -a {version} -m "Milestone: {name}"
   ```

9. **Commit:**
   ```bash
   git add .planning/milestones/ .planning/ROADMAP.md .planning/PROJECT.md .planning/STATE.md
   git commit -m "docs(planning): complete milestone {version}"
   ```

10. **Confirm** using the "Milestone Complete" banner from `references/ui-formatting.md`:

    Include stats in the banner body:
    ```
    Stats:
    - {count} phases, {count} plans
    - {count} commits, {lines} lines of code
    - {duration} days

    Archived to: .planning/milestones/{version}-*
    Git tag: {version}
    ```

    Use the "Next Up" block with: `/dev:milestone new` — start the next milestone

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

   Spawn `Task(subagent_type: "dev:towline-integration-checker")` with:

   ```
   You are towline-integration-checker. Perform cross-phase integration verification.

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

4. **Check requirements coverage:**
   - Read REQUIREMENTS.md
   - For each requirement tagged for this milestone:
     - Search VERIFICATION.md files for coverage
     - Search SUMMARY.md `provides` fields
     - Flag uncovered requirements

5. **Write audit report:**

   Create `.planning/{version}-MILESTONE-AUDIT.md` using the template:

   Read `skills/milestone/templates/audit-report.md.tmpl` for the audit report format. Fill in all `{variable}` placeholders with actual data from the audit.

6. **Report to user:**

   ```
   Milestone Audit: {version}
   Status: {PASSED / GAPS FOUND / TECH DEBT}

   {If PASSED:}
   All phases verified, integration checks passed, requirements covered.
   Ready for /dev:milestone complete {version}

   {If GAPS FOUND:}
   Found {count} gaps:
   - {gap 1}
   - {gap 2}
   Run /dev:milestone gaps to create fix phases.

   {If TECH DEBT:}
   Milestone functional but has {count} tech debt items.
   Consider /dev:milestone gaps for cleanup or proceed with /dev:milestone complete.
   ```

---

## Subcommand: `gaps`

Create phases to close gaps found during an audit.

### Flow

1. **Find most recent audit:**
   - Search for `*-MILESTONE-AUDIT.md` in `.planning/`
   - If multiple, use the most recent
   - If none: "No audit found. Run `/dev:milestone audit` first."

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

   Which gaps should we address?
   1. All must-fix gaps
   2. Must-fix + should-fix
   3. Everything
   4. Let me pick specific ones
   ```

   Use AskUserQuestion for selection.

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

9. **Confirm:**
   ```
   Created {count} gap-closure phase(s):
   - Phase {N}: {name}
   - Phase {N+1}: {name}

   Next: /dev:plan {N} to plan the first gap-closure phase.
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
- For others: "No roadmap found. Run `/dev:begin` or `/dev:milestone new` first."

### Milestone has no phases
- For `complete`: "No phases found for this milestone. Nothing to complete."
- For `audit`: "No phases to audit."

### Audit finds no gaps
- Status: PASSED
- Skip the recommendations section
- Suggest proceeding to complete

### Version already exists (tag collision)
- For `complete`: "Tag {version} already exists. Use a different version number."
- Ask for alternative via AskUserQuestion

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
