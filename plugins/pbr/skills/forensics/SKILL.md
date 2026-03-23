---
name: forensics
description: "Post-mortem investigation for failed or stuck workflows. Analyzes git history and planning artifacts."
allowed-tools: Read, Bash, Glob, Grep, Write, AskUserQuestion
argument-hint: "[description of what went wrong]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:forensics — Post-Mortem Investigation

Read-only investigation for failed or stuck workflows. Analyzes git history, `.planning/` artifacts, and file system state to detect anomalies. Writes a diagnostic report. Does NOT modify project files.

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► FORENSICS                                  ║
╚══════════════════════════════════════════════════════════════╝
```

## Step 1 — Get Problem Description

If `$ARGUMENTS` is empty, ask: "What went wrong? Describe the issue — e.g., 'autonomous mode got stuck on phase 3', 'execute-phase failed silently', 'commits seem wrong'."

## Step 2 — Gather Evidence

Collect data from all available sources. Missing sources are fine — adapt.

### 2a. Git History

```bash
git log --oneline -30
git log --format="%H %ai %s" -30
git log --name-only --format="" -20 | sort | uniq -c | sort -rn | head -20
git status --short
git diff --stat
```

Record: commit timeline, most-edited files, uncommitted changes.

### 2b. Planning State

Read if they exist: STATE.md, ROADMAP.md, config.json. Extract current phase, last session, blockers.

### 2c. Phase Artifacts

For each phase in `.planning/phases/*/`, check which artifacts exist vs expected (PLAN, SUMMARY, VERIFICATION, CONTEXT, RESEARCH).

### 2d. Worktree State

```bash
git worktree list
```

Check for orphaned worktrees from crashed agents.

## Step 3 — Detect Anomalies

### Stuck Loop Detection
Same file in 3+ consecutive commits within a short time window. HIGH confidence if commit messages are similar.

### Missing Artifact Detection
Phase appears complete (has commits, past in roadmap) but lacks PLAN, SUMMARY, or VERIFICATION.

### Abandoned Work Detection
Large gap between last commit and now, with STATE.md showing mid-execution.

### Crash/Interruption Detection
Uncommitted changes + STATE.md active + orphaned worktrees.

### Scope Drift Detection
Recent commits touch files outside current phase's expected scope (from PLAN.md).

### Test Regression Detection
Commit messages containing "fix test", "revert", or re-commits of test files.

## Step 4 — Generate Report

```bash
mkdir -p .planning/forensics
```

Write to `.planning/forensics/report-{YYYYMMDD-HHMMSS}.md`:

```markdown
# Forensic Report

**Generated:** {ISO timestamp}
**Problem:** {user's description}

## Evidence Summary

### Git Activity
- **Last commit:** {date} — "{message}"
- **Commits (last 30):** {count}
- **Uncommitted changes:** {yes/no}
- **Active worktrees:** {count}

### Planning State
- **Current phase:** {N} — {name} ({status})
- **Last session:** {date}
- **Blockers:** {list or "none"}

### Artifact Completeness
| Phase | PLAN | SUMMARY | VERIFICATION | Status |
|-------|------|---------|-------------|--------|
| {N} | {Y/N} | {Y/N} | {Y/N} | {complete/incomplete} |

## Anomalies Detected

### {Anomaly Name}
**Confidence:** {HIGH/MEDIUM/LOW}
**Evidence:** {specific data points}
**Impact:** {what this caused}
**Recommendation:** {what to do}

## Recommendations

1. {Prioritized action items}
```

## Step 5 — Present Findings

Display a summary of findings inline, point to the full report on disk:

```
Report: .planning/forensics/report-{timestamp}.md

Anomalies found: {count}
  - {anomaly 1}: {brief}
  - {anomaly 2}: {brief}

Recommended: {top action item}
```

Optionally offer to create a GitHub issue with the findings.

## Anti-Patterns

1. DO NOT modify project files — forensics is read-only
2. DO NOT spawn subagents — run everything inline
3. DO NOT guess — base all findings on evidence
4. DO NOT report anomalies without evidence and confidence levels
