---
name: milestone-summary
description: "Generate comprehensive milestone summary from archived artifacts. For team onboarding and stakeholder review."
allowed-tools: Read, Write, Bash, Glob, Grep
argument-hint: "[version]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it.**

# /pbr:milestone-summary — Milestone Summary for Onboarding

Generate a comprehensive, navigable summary document from milestone artifacts. Useful for team onboarding and stakeholder review.

## Step 0 — Banner

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► MILESTONE SUMMARY                          ║
╚══════════════════════════════════════════════════════════════╝
```

## Step 1 — Determine Milestone

If `$ARGUMENTS` has a version: use it (auto-prefix `v` if missing).
If empty: use the most recent completed milestone from ROADMAP.md.

## Step 2 — Locate Archive

Check both formats:
- Directory: `.planning/milestones/v{X}/` (preferred)
- Flat files: `.planning/milestones/v{X}-*.md` (legacy)

If not found, check if it's the current active milestone (not yet archived) — scan `.planning/phases/` for the milestone's phase range.

## Step 3 — Aggregate Artifacts

For each phase in the milestone:
1. Read PLAN.md frontmatter: objectives, must_haves, implements
2. Read SUMMARY.md: what was built, key decisions, deviations
3. Read VERIFICATION.md: pass/fail status, gaps
4. Compile into phase summary sections

## Step 4 — Write Summary

Write to `.planning/MILESTONE-SUMMARY.md` (or `.planning/milestones/v{X}/SUMMARY.md` if archived):

```markdown
# Milestone {version}: {name}

**Shipped:** {date}
**Phases:** {count}
**Commits:** {count}

## Overview
{2-3 sentence summary of what this milestone delivered}

## Phase Summaries

### Phase {N}: {name}
**Goal:** {from ROADMAP}
**Status:** {verified/partial}
**Key files:** {from SUMMARY key_files}
**Decisions:** {from SUMMARY key_decisions}

{repeat for each phase}

## Requirements Coverage
| REQ | Status | Phase |
|-----|--------|-------|

## Architecture Impact
{What changed in the system architecture across this milestone}

## Known Issues
{Deferred items, verification gaps, tech debt from this milestone}
```

## Step 5 — Report

Display: `Summary written to {path} — {phase_count} phases, {commit_count} commits`

## Anti-Patterns

1. DO NOT read full file bodies when frontmatter suffices
2. DO NOT include raw PLAN.md task content — summarize
3. DO NOT generate if milestone doesn't exist — error with available milestones
