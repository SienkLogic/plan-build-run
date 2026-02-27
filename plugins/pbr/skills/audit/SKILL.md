---
name: audit
description: "Review past Claude Code sessions for PBR workflow compliance and UX quality."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "[--from DATE] [--to DATE] [--today] [--mode compliance|ux|full]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SESSION AUDIT                              ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:audit — Session Compliance & UX Review

You are running the **audit** skill. Your job is to analyze past Claude Code session logs for this project, checking PBR workflow compliance (STATE.md updates, hook firing, commit format, skill usage) and user experience quality (flow choice, friction, unmet expectations). You produce a comprehensive report document.

This skill uses **parallel Task() delegation** to analyze multiple sessions simultaneously, keeping main context lean.

---

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Delegate ALL session analysis** to audit subagents — do NOT read JSONL files in main context
- Main context handles: argument parsing, session discovery, agent orchestration, report synthesis
- Target: main context stays under 20% utilization

---

## Step 1 — Parse Arguments

Parse `$ARGUMENTS` for:

| Argument | Default | Description |
|----------|---------|-------------|
| `--from DATE` | Start of today | Start of audit window (ISO date or natural language) |
| `--to DATE` | Now | End of audit window |
| `--today` | false | Shorthand for `--from` start of today `--to` now |
| `--mode MODE` | `full` | `compliance` = workflow only, `ux` = user experience only, `full` = both |

**Natural language parsing**: Accept formats like:
- `--today` or just `today`
- `--from 2026-02-21` or `--from "yesterday"`
- `--from "3 days ago"` or `--from "last monday"`
- A bare date like `02/21` implies `--from 02/21 --to 02/21` (full day)
- A bare `3` implies last 3 days

If no arguments provided, default to `--today --mode full`.

Display the parsed time range to the user:

```
Audit window: {from} → {to}
Mode: {mode}
```

---

## Step 2 — Discover Session Logs

Session JSONL files live at:
```
~/.claude/projects/{encoded-project-path}/*.jsonl
```

Where `{encoded-project-path}` encodes the project directory path (e.g., `D:\Repos\plan-build-run` → `D--Repos-plan-build-run`).

**CRITICAL**: Determine the correct encoded path for the current project by listing `~/.claude/projects/` and finding the directory that matches.

Use Bash to find sessions in the audit window:

```bash
find ~/.claude/projects/{encoded-path}/ -name "*.jsonl" -maxdepth 1 \
  -newermt "{from_datetime}" ! -newermt "{to_datetime}" | sort
```

For each session file found, also check for subagent logs:
```bash
ls ~/.claude/projects/{encoded-path}/{session-id}/subagents/*.jsonl 2>/dev/null
```

Display discovery results:

```
Found {N} sessions in audit window:
  {session-id-1} ({size}, {date})
  {session-id-2} ({size}, {date})
  ...
```

If no sessions found, display an error and exit:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No session logs found between {from} and {to}.
Check: ~/.claude/projects/{encoded-path}/
```

---

## Step 3 — Discover Git Activity

In parallel with session analysis (Step 4), gather git commit data for the audit window:

```bash
git log --since="{from_iso}" --until="{to_iso}" --format="%h %s %an %ai" --all
```

Check for:
- Conventional commit format violations
- Forbidden `Co-Authored-By` lines
- Release-please automated commits

This data feeds into the final report synthesis.

---

## Step 4 — Spawn Audit Agents

**CRITICAL**: Spawn one `pbr:audit` agent per session, ALL in parallel. Do NOT analyze sessions sequentially.

For each session:

```
Task({
  subagent_type: "pbr:audit",
  prompt: "<files_to_read>
    CRITICAL: Read these files BEFORE any other action:
    1. {absolute_path_to_session.jsonl} — session log to analyze
    2. {subagent log paths, if any} — subagent session logs
  </files_to_read>
  <audit_assignment>
    Session JSONL: {absolute_path_to_session.jsonl}
    Subagent logs: {list of subagent jsonl paths, or 'none'}
    Audit mode: {mode}
    Output path: DO NOT write to disk — return findings inline.

    Analyze this session for PBR workflow compliance and/or UX quality
    per your audit checklists. Return your full findings as structured
    markdown in your response.
  </audit_assignment>"
})
```

Also spawn a git analysis agent (can use a Bash agent or general-purpose):

```
Task({
  subagent_type: "Bash",
  model: "haiku",
  prompt: "Run these git commands in {project_dir}:
    1. git log --since='{from}' --until='{to}' --format='%h|%s|%an|%ai' --all
    2. git log --since='{from}' --until='{to}' --all --format='%B' | grep -i 'co-authored-by' || echo 'None found'
    Report: all commits, any format violations against pattern {type}({scope}): {desc}, any co-author lines."
})
```

Display progress:

```
◐ Analyzing {N} sessions in parallel...
```

---

## Step 5 — Collect and Synthesize

As agents complete, check each audit agent's Task() output for `## AUDIT COMPLETE`. If the marker is absent, mark that session as "analysis failed" in the synthesis and skip its findings — do not treat incomplete output as valid analysis. Log: `⚠ Session {id}: audit agent did not return completion marker — skipping.`

Wait for all agents before proceeding.

Synthesize across all sessions:

### 5a. Executive Summary
- Total sessions, total commits, releases
- Overall compliance: how many sessions passed/failed
- Headline finding (the most important issue)

### 5b. Per-Session Summary Table
| Session | Duration | Commands | Compliance | UX Rating |
|---------|----------|----------|------------|-----------|

### 5c. Cross-Session Patterns
- Recurring issues (e.g., STATE.md never read across multiple sessions)
- Hook coverage gaps
- Common flow mistakes

### 5d. Consolidated Findings
Merge and deduplicate findings across sessions. Categorize by severity:
- **CRITICAL**: Workflow bypassed despite user requests, hooks not firing
- **HIGH**: State files not consulted, missing artifacts
- **MEDIUM**: Suboptimal flow choice, missing feedback
- **LOW**: Minor ceremony issues, informational

### 5e. Recommendations
Prioritize as:
- **Immediate**: Fix in next session
- **Short-term**: Fix in next sprint/milestone
- **Medium-term**: Architectural improvements

---

## Step 6 — Write Report

**CRITICAL**: Write the full report to disk. Do NOT just display it inline.

Write to: `.planning/audits/{YYYY-MM-DD}-session-audit.md`

Create `.planning/audits/` directory if it doesn't exist.

The report should follow this structure:

```markdown
# PBR Session Audit Report — {date range}

**Audit Period:** {from} – {to}
**Sessions Analyzed:** {N}
**Commits:** {N}
**Mode:** {mode}

---

## Executive Summary
{2-3 sentence overview}

## Session Summary
{per-session table}

## Detailed Session Analysis
{per-session findings}

## Git Activity
{commit summary, format compliance}

## Cross-Session Patterns
{recurring issues}

## Consolidated Findings
### Critical
### High
### Medium
### Low

## Recommendations
### Immediate
### Short-Term
### Medium-Term

---
*Generated by /pbr:audit on {date}*
```

---

## Step 6b — Spot-Check Artifacts

**Before displaying results, verify the report landed on disk:**

1. Glob `.planning/audits/{YYYY-MM-DD}-session-audit.md` to confirm the file exists
2. If missing: re-attempt the write (Step 6). If still missing, display an error and include findings inline instead.

---

## Step 7 — Display Summary

After writing the report, display inline (keep it concise — the full report is on disk):

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► AUDIT COMPLETE ✓                           ║
╚══════════════════════════════════════════════════════════════╝

{N} sessions analyzed, {N} commits reviewed

Compliance: {X}/{N} sessions passed
UX Rating:  {average or per-session ratings}

Top findings:
  1. {headline finding 1}
  2. {headline finding 2}
  3. {headline finding 3}

Full report: .planning/audits/{filename}


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

{Smart routing based on findings:}
- If critical issues found: **Fix workflow** → `/pbr:quick`
- If todos identified: **Create todos** → `/pbr:todo add "{description}"`
- Default: **See project status** → `/pbr:status`

<sub>`/clear` first → fresh context window</sub>
```

---

## Error Handling

### Agent fails to analyze a session
If an audit agent fails:
```
⚠ Failed to analyze session {id}: {error}
Continuing with remaining {N-1} sessions.
```

Include a note in the final report that session was skipped.

### No sessions found
Display error (Step 2) and exit gracefully.

### Very large session files (>5MB)
Warn the agent to sample rather than read the full log:
```
Note: Session {id} is {size}MB. Sampling key sections (first 200 lines, last 200 lines, user messages, hook events).
```

---

## Anti-Patterns

Reference: `skills/shared/universal-anti-patterns.md` for rules that apply to ALL skills.

Additionally for this skill:

1. **DO NOT** read JSONL files in main context — always delegate to audit agents
2. **DO NOT** display the full report inline — write to disk, show summary
3. **DO NOT** analyze sessions sequentially — spawn all agents in parallel
4. **DO NOT** report findings without evidence (line numbers, timestamps, quotes)
5. **DO NOT** judge explore sessions for missing STATE.md updates (explore is read-only)
6. **DO NOT** flag release-please/merge commits as format violations
7. **DO NOT** fabricate UX ratings — base them on concrete evidence (user repetitions, escalations, course-corrections)
8. **DO NOT** exceed 5 headline findings in the inline summary — full details go in the report file
