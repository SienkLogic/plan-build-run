---
title: "Research: instinct-based continuous learning system"
status: done
priority: P4
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: research
---

## Goal

Research whether an instinct-based learning system (inspired by ECC's continuous-learning-v2) would add value to Towline.

## Research Findings

### What ECC's Instinct System Does

ECC implements atomic "instincts" — learned behaviors with confidence scores (0.3-0.9) that increase with confirmation and decay when contradicted. Each instinct has trigger conditions, domain tags, and evidence trails. An evolution pipeline clusters related instincts into skills/commands/agents via `/evolve`. Hooks observe every tool call to build an observations log.

### What Towline Already Has

Towline has several existing mechanisms that partially overlap:
- **CLAUDE.md / MEMORY.md**: Project and user-level persistent knowledge (manual)
- **config.json**: Workflow preferences that persist across sessions
- **session-cleanup.js + sessions.jsonl**: Session history tracking
- **hook-logger.js**: All hook events logged to JSONL
- **Event logger**: Tool failures, commits, workflow events logged

### Cost-Benefit Analysis

**Potential benefits of instincts:**
1. Auto-learn project commit conventions from past commits
2. Learn which files are frequently modified together (co-change patterns)
3. Learn which test commands work for this project
4. Learn user preferences for verbosity, gates, model selection

**Costs:**
1. Significant implementation complexity (confidence scoring, decay, clustering)
2. Risk of learning bad patterns (a wrong instinct with high confidence causes repeated errors)
3. Debugging difficulty (why did the system do X? Because instinct Y with confidence 0.8)
4. Context overhead (instincts must be loaded into context to be useful)
5. Cold-start problem (no instincts until many sessions have been observed)

**Towline-specific constraints:**
- Towline already has CLAUDE.md for persistent knowledge — instincts would compete with this
- Towline's subagent delegation model means most work happens in fresh context windows that don't see instincts unless they're explicitly passed
- The hook system could log observations, but clustering/evolving requires a separate curation process

### Minimal Viable Instinct System

If implemented, the smallest useful version would be:
1. **observations.jsonl** — already exists (events.jsonl + hooks.jsonl provide this data)
2. **instincts.json** — a flat file with `{ pattern, confidence, domain, evidence_count }` entries
3. **SessionStart hook** — load top-10 high-confidence instincts into additionalContext
4. **Manual curation** — no automatic evolution; user reviews and promotes observations to instincts via `/dev:note promote`

This bypasses the complex evolution pipeline entirely and leverages existing infrastructure.

## Recommendation: DEFER

**Verdict**: Interesting concept but premature for Towline's current user base.

**Reasoning**:
- Towline is a single-developer tool — the manual CLAUDE.md/MEMORY.md approach is sufficient for 1 person
- The instinct system's value increases with team size and project diversity, neither of which Towline optimizes for yet
- The existing event/hook logging already captures the raw data; instinct extraction could be added later without architectural changes
- Risk of over-engineering: instincts add a learning system that must itself be debugged and maintained

**If reconsidered later**: Start with the minimal version (observations → manual curation → top-10 injection at SessionStart). Only add automatic evolution after the manual approach proves its value.

## Acceptance Criteria

- [x] Research document with recommendation — DEFER
- [x] If adopted: design doc for minimal viable instinct system — Minimal design included above (deferred)
