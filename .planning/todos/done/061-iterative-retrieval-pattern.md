---
title: "Add iterative retrieval protocol to researcher agent"
status: done
priority: P2
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: agents
---

## Goal

Formalize an iterative retrieval pattern in the `towline-researcher` agent so it progressively refines its context gathering instead of doing single-pass exploration.

## What Was Done

1. Replaced Step 3 (Conduct Research) with iterative DISPATCH/EVALUATE/REFINE/LOOP protocol:
   - **DISPATCH**: Broad search in Cycle 1 (S0 → S2 → S3 → S4/S5), targeted gap-filling in Cycle 2+
   - **EVALUATE**: Score findings as CRITICAL/USEFUL/PERIPHERAL, assess coverage as COMPLETE/PARTIAL/INSUFFICIENT, identify terminology gaps
   - **REFINE**: Update search terms with discovered naming conventions, focus on CRITICAL gaps, try alternative source types
   - **LOOP**: Max 3 cycles hard limit, stop early if COMPLETE or context budget exceeded
2. Added Coverage Assessment section to both output formats (Project Research and Phase Research):
   - Table with question/status/confidence/cycle columns
   - Overall coverage rating + explicit gap listing
3. Updated output headers with `Coverage:` and `Retrieval cycles:` metadata
4. Added per-cycle context budget guidance (25%/10%/5% + remaining for output)
5. Updated Quality Check (Step 5) to include coverage gap documentation
6. Updated "When to Stop/Continue Searching" to reference cycle-based criteria

## Design Decisions

- 3-cycle hard limit prevents runaway research that consumes the entire context window
- Progressive terminology learning: Cycle 1 discovers naming conventions, Cycle 2+ uses them for better search results
- Coverage assessment uses simple COMPLETE/PARTIAL/INSUFFICIENT rather than numeric scores — easier for LLMs to self-evaluate
- Per-cycle budgets are advisory (not enforced by code) — the agent self-manages based on these guidelines
- No code changes needed — this is purely prompt engineering in the agent definition

## Acceptance Criteria

- [x] Researcher agent prompt includes iterative retrieval instructions
- [x] Protocol limits to max 3 cycles
- [x] Research output includes relevance scores for key files
- [x] Gap tracking is visible in research output (Coverage Assessment section)
