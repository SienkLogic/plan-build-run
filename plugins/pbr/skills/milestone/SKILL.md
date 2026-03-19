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

## References

- `references/questioning.md` — Questioning patterns for milestone review decisions
- `references/ui-brand.md` — Status symbols, banners, milestone celebration format

---

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Never** perform integration checks yourself — delegate to the integration-checker subagent
- **Minimize** reading audit and verification outputs — read only frontmatter and status fields
- **Delegate** all cross-phase integration analysis to the integration-checker subagent

---

## Multi-Session Sync

Before any phase-modifying operations (archiving phases, updating ROADMAP.md/STATE.md/PROJECT.md), acquire a claim:

```
acquireClaim(planningDir, sessionId)
```

If the claim fails (another session owns this project), display: "Another session owns this project. Use `/pbr:progress` to see active claims."

On completion or error (including all exit paths), release the claim:

```
releaseClaim(planningDir, sessionId)
```

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
   Run a condensed version of the `/pbr:new-project` questioning flow:

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
   **Requirements:** {REQ-IDs mapped to this phase}
   **Success Criteria:** {verifiable conditions for phase completion}
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

**CRITICAL (no hook) -- DO NOT SKIP: Update STATE.md frontmatter AND body with new milestone info.**

8. **Update STATE.md:**
   - Set current phase to the first new phase
   - Update milestone info

**CRITICAL (no hook) -- DO NOT SKIP: Generate root MILESTONE.md file.**

8b. **Generate root MILESTONE.md:**
   Read the current milestone section from ROADMAP.md (the `## Milestone:` section just created in Step 5) and STATE.md for current phase and status. Write `MILESTONE.md` at the project root with:

   ```markdown
   # Current Milestone: {name}
   **Version:** {version} | **Status:** In Progress | **Created:** {date}

   **Goal:** {goal}

   ## Phases
   | Phase | Goal | Status |
   |-------|------|--------|
   | {N}. {name} | {goal} | Pending |
   ...

   ---
   *Auto-generated by `/pbr:milestone new`. Updated by `/pbr:autonomous`.*
   ```

   - Read the phase list from the ROADMAP.md section just written in Step 5
   - Status column: "Pending" for all new phases

**Milestone branch creation (when git.branching is 'milestone'):**
When starting a new milestone and `git.branching` is `milestone`:
- Create branch: `git switch -c pbr/milestone-v{version}`
- All phase work happens on this branch
- Branch is merged when `/pbr:milestone complete` is run

9. **Commit** if `planning.commit_docs: true`:
   ```
   docs(planning): start milestone "{name}" (phases {start}-{end})
   ```

10. **Confirm** with branded output — read `${CLAUDE_SKILL_DIR}/templates/new-output.md.tmpl` and fill in `{name}` (milestone name), `{count}` (phase count), `{N}` (first phase number).

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

   Ready to complete? Run: /pbr:complete-milestone v{version}
   ```

**CRITICAL (no hook)**: This subcommand is READ-ONLY. Do not create directories, move files, modify STATE.md, modify ROADMAP.md, or create git tags. Only read and display.

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
         - label: "Stop and review"  description: "Run /pbr:verify-work for unverified phases first"
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
       - label: "Re-verify"        description: "Run /pbr:verify-work for affected phases (recommended)"
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

**Milestone branching (config-gated):**
Read `git.branching` from config.
- If `milestone`:
  a. Check if milestone branch exists: `git branch --list pbr/milestone-v{version}`
  b. If branch exists:
    - Use AskUserQuestion:
      question: "Milestone v{version} complete. Merge branch `pbr/milestone-v{version}` to main?"
      header: "Merge milestone branch?"
      options:
        - label: "Yes, merge"   description: "Merge milestone branch to main and delete it"
        - label: "No, keep"     description: "Keep the branch for manual review"
    - If "Yes, merge":
      1. `git switch main`
      2. `git merge --no-ff pbr/milestone-v{version}` (no-ff to preserve milestone history)
      3. `git branch -d pbr/milestone-v{version}`
      4. Log: "Milestone branch merged and deleted"
    - If "No, keep": leave branch as-is
  c. If branch does not exist: no action (phases were on main or individual phase branches)
- If `none`, `phase`, or `disabled`: no milestone branch operations

5. **Archive milestone documents:**

   **CRITICAL (no hook): Pre-flight safety checks BEFORE archiving. Do NOT skip this step.**

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

   **CRITICAL (no hook): Back up ROADMAP.md BEFORE any destructive operations. Do NOT skip this step.**

   Copy `.planning/ROADMAP.md` into the milestone archive directory as a safety backup. This preserves the full roadmap state at the time of milestone completion, before any phase directories are moved or ROADMAP.md sections are collapsed:

   ```bash
   mkdir -p .planning/milestones/{version}
   cp .planning/ROADMAP.md .planning/milestones/{version}/ROADMAP.md
   ```

   This backup MUST happen before any of the following: creating archive subdirectories, moving phase directories, collapsing ROADMAP.md sections, or updating STATE.md.

   **CRITICAL (no hook): Create the archive directory .planning/milestones/{version}/ NOW. Do NOT skip this step.**

   Create a versioned archive directory and move phase directories into it (ROADMAP.md is already copied by the backup step above):
   - `.planning/milestones/{version}/REQUIREMENTS.md` — **CRITICAL (no hook): Copy REQUIREMENTS.md to archive NOW. Do NOT skip this step.** Snapshot of REQUIREMENTS.md
   - `.planning/milestones/{version}/STATS.md` — milestone statistics
   - `.planning/milestones/{version}/phases/{NN}-{slug}/` — move each milestone phase directory from `.planning/phases/` into the archive

   **CRITICAL (no hook): Move phase directories from .planning/phases/ to archive NOW. Do NOT skip this step.**

   **Move phases:** For each phase belonging to this milestone, move (not copy) its directory from `.planning/phases/{NN}-{slug}/` to `.planning/milestones/{version}/phases/{NN}-{slug}/`. This keeps the active phases directory clean for the next milestone.

   **CRITICAL (no hook): Write STATS.md to .planning/milestones/{version}/STATS.md NOW. Do NOT skip this step.**

   **Stats file content:**

   Read `${CLAUDE_SKILL_DIR}/templates/stats-file.md.tmpl` for the stats file format. Fill in all `{variable}` placeholders with actual data gathered in Steps 3-4.

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

**CRITICAL (no hook): Run PROJECT.md evolution review NOW. Do NOT skip this step.**

6b. **PROJECT.md Evolution Review:**
   After moving the milestone to completed status, review and evolve the project definition:

   1. **Move completed Active Requirements to Validated** — Any requirement from the completed milestone that was satisfied (per VERIFICATION.md) should move from Active to Validated section
   2. **Review Out of Scope** — Check if any previously out-of-scope items are now unblocked by the completed milestone's deliverables. If so, note them for the user's consideration (do not move them automatically)
   3. **Annotate Key Decisions with outcomes** — For each Key Decision in PROJECT.md that relates to the completed milestone, add an Outcome column value: `Good` (decision worked well), `Revisit` (decision caused issues), or `Pending` (outcome not yet clear)
   4. **Update Constraints** — Remove or update any constraints that changed during the milestone (e.g., a technology constraint that was relaxed)
   5. **Refresh Core Value** — If the project direction shifted meaningfully during the milestone, suggest an updated Core Value statement to the user via AskUserQuestion

**CRITICAL (no hook): Update ROADMAP.md with collapsed milestone section NOW. Do NOT skip this step.**

7. **Collapse completed phases in ROADMAP.md:**
   Replace detailed phase entries with a `<details>` collapsed summary (backward compat: also recognized by `-- COMPLETED` text):

   ```markdown
   <details>
   <summary>## Milestone: {name} ({version}) — SHIPPED {date}</summary>

   | Phase | Status |
   |-------|--------|
   | {N}. {name} | Completed |
   | {N+1}. {name} | Completed |

   Completed: {date} | Archive: `.planning/milestones/{version}/`

   </details>
   ```

7a. **Update milestone index:**
   After collapsing the milestone, update or create a `## Milestones` index section near the top of ROADMAP.md (after the title, before the first active milestone). Each entry is one line:

   ```markdown
   ## Milestones

   | Version | Name | Status | Date |
   |---------|------|--------|------|
   | {version} | {name} | SHIPPED | {date} |
   ```

   If the section already exists, append a row. If it does not exist, create it.

**CRITICAL (no hook): Update STATE.md to mark milestone as complete NOW. Do NOT skip this step.**

7b. **Update STATE.md:**
   - Update `.planning/STATE.md` frontmatter to reset to idle state:
     - `current_phase: null`
     - `phase_slug: null`
     - `phase_name: null`
     - `phases_total: 0`
     - `status: "idle"`
     - `progress_percent: 0`
     - `plans_total: 0`
     - `plans_complete: 0`
     - `last_activity: "{date} Milestone {version} complete"`
   - Update the body section to reflect idle state (no active phase)

7c. **Record milestone completion in STATE.md frontmatter:**
   - Update STATE.md frontmatter with milestone completion data:
     - Set `last_milestone_version: "{version}"`
     - Set `last_milestone_completed: "{ISO datetime}"`
   - **Do NOT write to a ## History section in STATE.md** — History has been removed from STATE.md to keep it lean. Milestone completion records are preserved in the archive's STATS.md and ROADMAP.md snapshot.
   - If a ## History section exists in STATE.md (from a prior version), remove it during milestone completion to enforce the new format.

**Run state reconcile after archival** to reset phases_total and current_phase to reflect the next milestone's phases:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state reconcile
```

This command re-derives phase counts from ROADMAP.md and reports any phantom phase rows (progress table rows with no corresponding directory on disk). Review and remove phantom rows manually if no longer needed.

7d. **Aggregate learnings into KNOWLEDGE.md from milestone phases:**

**CRITICAL (no hook): Run learnings aggregation NOW. Do NOT skip this step.**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/milestone-learnings.js .planning/milestones/{version} --project {project-name-from-STATE.md}
```

This script aggregates SUMMARY.md patterns, decisions, and deferred items into the project-scoped `.planning/KNOWLEDGE.md` (table format with K/P/L-prefixed IDs). It also writes to the global `~/.claude/learnings.jsonl` for cross-project use.

- If the script outputs an error, log it but do NOT abort milestone completion — learnings aggregation is advisory.
- Display the aggregation summary line to the user (e.g., "KNOWLEDGE.md: 5 new entries, 2 duplicates skipped").
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

9. **Generate RETROSPECTIVE.md:**

   The CLI (`pbr-tools.js milestone complete`) auto-generates a RETROSPECTIVE.md entry. Verify it exists at `.planning/RETROSPECTIVE.md`. If the CLI was not used (manual completion), create the entry using `${CLAUDE_PLUGIN_ROOT}/templates/RETROSPECTIVE.md.tmpl` as the format reference. Fill in `{version}`, `{name}`, `{date}`, and the "What Was Built" section from MILESTONES.md accomplishments. Leave other sections as placeholders for the user to fill.

9aa. **Insights integration:**

   Check for a recent /insights HTML report:

   ```bash
   find ~/.claude/insights/ -name "*.html" -mtime -7 2>/dev/null | head -1
   ```

   **If a recent report exists (modified within 7 days):**
   1. Read the HTML file and extract key workflow findings (friction patterns, efficiency suggestions, recurring issues)
   2. Append a "## Workflow Insights" section to `.planning/RETROSPECTIVE.md` with 3-5 bullet points summarizing the most relevant insights for this milestone's work
   3. Add the RETROSPECTIVE.md to the git staging area

   **If no recent report exists:**
   Display this suggestion after the RETROSPECTIVE.md is generated:

   ```
   Tip: Run /insights to capture workflow patterns from this milestone's sessions.
        Insights feed into future audits and help the planner avoid repeated friction.
   ```

9a. **Commit:**
   ```bash
   git add .planning/milestones/ .planning/phases/ .planning/ROADMAP.md .planning/PROJECT.md .planning/STATE.md .planning/RETROSPECTIVE.md
   git commit -m "docs(planning): complete milestone {version}"
   ```

**CRITICAL (no hook): Generate changelog entry NOW. Do NOT skip this step.**

9b. **Generate changelog entry:**

   Generate a user-facing changelog entry for this milestone. Read all SUMMARY.md files from the milestone phases (now in `.planning/milestones/{version}/phases/`) and categorize deliverables into Keep a Changelog sections:

   - **Added** — New features, commands, capabilities (from SUMMARY.md `provides` fields)
   - **Changed** — Modifications to existing behavior, UI updates, performance improvements
   - **Fixed** — Bug fixes, error corrections (from commits with `fix:` type)

   Format each entry with a **bolded feature name** followed by an em-dash and description:
   ```markdown
   ### Added
   - **Feature name** — What it does and why it matters
   - **Another feature** — Description focusing on user impact
   ```

   Rules for good entries:
   - Lead with the user-visible impact, not the implementation detail
   - Group related commits into a single entry (e.g., 5 commits for "auth" become one "Authentication system" entry)
   - Use bold feature names, not commit scopes
   - No commit hashes — this is prose, not a git log
   - No internal scopes (phase-plan numbers, TDD markers)
   - End with install line: `Install/upgrade: \`npx @sienklogic/plan-build-run@latest\``

   Draft the full entry and present it to the user for review:

   Use AskUserQuestion:
   ```
   question: "Here's the draft changelog for {version}. Want to edit it before writing?"
   header: "Changelog"
   options:
     - label: "Looks good"        description: "Write this to CHANGELOG.md as-is"
     - label: "Edit"              description: "I'll provide corrections"
     - label: "Skip changelog"    description: "Don't update the changelog for this release"
   ```

   - If "Looks good": write the entry to CHANGELOG.md (insert after the header, before any existing version entries)
   - If "Edit" or "Other": apply the user's corrections, then present again for final confirmation
   - If "Skip changelog": proceed without changelog update

   If writing to CHANGELOG.md:
   ```bash
   git add CHANGELOG.md
   git commit -m "docs: update changelog for {version}"
   ```

9c. **Push milestone to remote:**

Use AskUserQuestion to ask the user how they want to publish the milestone:

```
question: "How should this milestone be published to GitHub?"
header: "Publish"
options:
  - label: "Push tag + commits"    description: "Push the v{version} tag and any unpushed commits to origin"
  - label: "Skip for now"          description: "Keep everything local — push later manually"
```

- If "Push tag + commits": run `git push origin main --follow-tags` to push both commits and the annotated tag in one command. Display success or error.
- If "Skip for now": display reminder: "Tag v{version} is local only. Push when ready: `git push origin main --follow-tags`"
- If "Other": follow user instructions (e.g., create a PR, push to a different branch, etc.)

9d. **Automatic npm release:**

After pushing, automatically run the npm release to publish this milestone:

```bash
npm run release -- --minor
```

Display the output to the user. The `--minor` flag is used because milestone completions always represent new features.

- If the release succeeds: display the new version number and GitHub Release URL
- If the release fails: show the error as an advisory warning — the milestone is already archived. Suggest the user run `npm run release` manually after fixing the issue.

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

10. **Confirm** with branded output — read `${CLAUDE_SKILL_DIR}/templates/complete-output.md.tmpl` and fill in `{version}`, `{count}` (phases, plans, commits), `{lines}`, `{duration}`.

**NEXT UP block after milestone complete:**

After displaying the branded complete-output banner, always display a NEXT UP routing block:

```
╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Start the next milestone** — continue development with new phases

`/pbr:milestone new`

**Also available:**
- `/pbr:release` — tag and publish this milestone as a GitHub Release
- `/pbr:status` — review project state before continuing

<sub>`/clear` first → fresh context window</sub>
```

This ensures the milestone complete subcommand never ends in a routing dead end.

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

   Display to the user: `◆ Spawning integration checker...`

   Spawn `Task(subagent_type: "pbr:integration-checker")`. Read `${CLAUDE_SKILL_DIR}/templates/integration-checker-prompt.md.tmpl`, fill in `{version or "current"}`, `{list of phase directories}`, and `{phase SUMMARY.md paths}`, then use the filled template as the Task() prompt.

4. **Check integration-checker completion:**

   After the integration-checker completes, check for `## INTEGRATION CHECK COMPLETE` in the Task() output. If the marker is absent, warn: `⚠ Integration checker did not return completion marker — results may be incomplete.` Proceed with whatever findings were returned but note the incomplete status in the audit report.

5. **Check requirements coverage:**
   - Read REQUIREMENTS.md
   - For each requirement tagged for this milestone:
     - Search VERIFICATION.md files for coverage
     - Search SUMMARY.md `provides` fields
     - Flag uncovered requirements

6. **Write audit report:**

   Create `.planning/{version}-MILESTONE-AUDIT.md` using the structured template:

   Read `${CLAUDE_PLUGIN_ROOT}/templates/MILESTONE-AUDIT.md.tmpl` for the audit report format with YAML frontmatter scores. Fill in all `{variable}` placeholders with actual data from the audit. The YAML frontmatter MUST include `scores` (requirements, phases, integration, flows), `gaps` array, and `tech_debt` array.

   **Spot-check:** After writing, verify `.planning/{version}-MILESTONE-AUDIT.md` exists on disk using Glob. If missing, re-attempt the write. If still missing, display an error and include findings inline.

7. **Report to user** using branded banners — read `${CLAUDE_SKILL_DIR}/templates/audit-output.md.tmpl`. The template contains all 3 variants (PASSED, GAPS FOUND, TECH DEBT). Select the appropriate section based on audit result. Fill in `{version}`, `{count}`, `{gap 1}`, `{gap 2}` as applicable.

---

## Subcommand: `gaps`

Create phases to close gaps found during an audit.

### Flow

1. **Find most recent audit:**
   - Search for `*-MILESTONE-AUDIT.md` in `.planning/`
   - If multiple, use the most recent
   - If none: "No audit found. Run `/pbr:audit-milestone` first."

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

9. **Confirm** with branded output — read `${CLAUDE_SKILL_DIR}/templates/gaps-output.md.tmpl` and fill in `{count}` (gap-closure phases created), `{N}` (first gap phase number), `{name}` (phase name).

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

Reference: `skills/shared/error-reporting.md` for branded error output patterns.

## Edge Cases

For all edge case handling, see `${CLAUDE_SKILL_DIR}/templates/edge-cases.md`.
Key scenarios: no ROADMAP.md, no phases, no gaps found, version collision, partially verified, large milestone (8+ phases).

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
