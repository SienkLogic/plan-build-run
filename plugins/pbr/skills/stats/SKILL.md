---
name: stats
description: "Display project statistics — phases, plans, requirements, git metrics, and timeline."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "[--json]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:stats — Project Statistics

Display comprehensive project metrics: phase/plan completion, requirement coverage, git activity, and timeline. Runs inline — no subagent needed.

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► STATS                                      ║
╚══════════════════════════════════════════════════════════════╝
```

## Step 1 — Gather Data

```bash
# Phase counts
PHASE_DIRS=$(ls -d .planning/phases/*/ 2>/dev/null | wc -l)
PLANS=$(ls .planning/phases/*/PLAN-*.md 2>/dev/null | wc -l)
SUMMARIES=$(ls .planning/phases/*/SUMMARY-*.md 2>/dev/null | wc -l)
VERIFICATIONS=$(ls .planning/phases/*/VERIFICATION*.md 2>/dev/null | wc -l)

# Quick task counts
QUICK_TOTAL=$(ls -d .planning/quick/*/ 2>/dev/null | wc -l)

# Git metrics
TOTAL_COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo 0)
RECENT_COMMITS=$(git log --oneline --since="7 days ago" 2>/dev/null | wc -l)
FILES_CHANGED=$(git diff --stat HEAD~10 2>/dev/null | tail -1)

# Todo counts
PENDING_TODOS=$(ls .planning/todos/pending/*.md 2>/dev/null | wc -l)
DONE_TODOS=$(ls .planning/todos/done/*.md 2>/dev/null | wc -l)

# Milestone info from STATE.md
MILESTONE=$(grep "^Active:" .planning/STATE.md 2>/dev/null | head -1)
```

Also read ROADMAP.md for milestone history count and REQUIREMENTS.md for coverage.

## Step 1b — Cost & Duration Data

```bash
pbr-tools benchmarks summary --json
```

Parse the JSON result. If `totals.count > 0`, include a "Cost & Duration" section in the output showing:
- Total agent spawns and cumulative duration
- Top 3 phases by total duration
- Top 3 agent types by spawn count

If no data or `totals.count === 0`, skip this section silently.

Also run:

```bash
pbr-tools benchmarks agents --json
```

Use the agents result for the "Top 3 agent types" breakdown.

Display format (append after Timeline section):

```
Cost & Duration:
  Total Spawns: {count} agents, {duration}
  Top Phases:   {phase1} ({duration1}), {phase2} ({duration2}), {phase3} ({duration3})
  Top Agents:   {type1} ({count1}x), {type2} ({count2}x), {type3} ({count3}x)
```

## Step 2 — Display

```
Project Statistics
══════════════════════════════════════════

Milestone:  {active milestone name}
Phases:     {completed}/{total} ({percent}%)
Plans:      {total plans} written, {summaries} completed
Verified:   {verifications}/{completed phases}

Quick Tasks: {total} ({percent}% success rate)
Todos:       {pending} pending, {done} completed

Git Activity (7 days):
  Commits:  {recent_commits}
  Total:    {total_commits} all-time
  Changed:  {files_changed}

Timeline:
  Started:  {first commit date}
  Latest:   {last commit date}
  Duration: {days} days
```

If `--json` flag: output raw JSON instead of formatted text.

## Anti-Patterns

1. DO NOT spawn subagents — stats is inline only
2. DO NOT modify any files — read-only
3. DO NOT count files that don't exist — use proper error handling
