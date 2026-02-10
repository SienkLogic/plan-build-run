---
title: "Add iterative retrieval protocol to researcher agent"
status: pending
priority: P2
source: ecc-review
created: 2026-02-10
theme: agents
---

## Goal

Formalize an iterative retrieval pattern in the `towline-researcher` agent so it progressively refines its context gathering instead of doing single-pass exploration.

## Context

ECC documents a 4-phase loop: DISPATCH (broad search) -> EVALUATE (score relevance 0-1) -> REFINE (update criteria based on gaps) -> LOOP (max 3 cycles). This directly addresses the subagent context problem — subagents spawned with limited context may miss critical files.

## Scope

- Update `agents/towline-researcher.md` prompt to include the DISPATCH/EVALUATE/REFINE/LOOP protocol
- Add explicit gap tracking: after each cycle, the researcher lists what's still unknown
- Max 3 cycles to prevent infinite loops
- Relevance scoring (0-1) for discovered files
- Progressive terminology learning (learn codebase naming conventions in cycle 1, use them in cycle 2)

## Acceptance Criteria

- [ ] Researcher agent prompt includes iterative retrieval instructions
- [ ] Protocol limits to max 3 cycles
- [ ] Research output includes relevance scores for key files
- [ ] Gap tracking is visible in RESEARCH.md output
