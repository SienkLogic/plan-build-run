---
title: "Review GSD's gsd-tools.js for learnings to rebuild into Towline"
status: pending
priority: P2
source: user-request
created: 2026-02-10
---

## Goal

Review GSD's `gsd-tools.js` utility library to understand how they use it and what Towline can learn from it and rebuild.

## Research Source

- GSD tools: https://github.com/gsd-build/get-shit-done/blob/main/get-shit-done/bin/gsd-tools.js
- Towline's equivalent: `plugins/dev/scripts/towline-tools.js`

## Context

Towline already has `towline-tools.js` which provides shared utilities (stateLoad, configLoad, etc.) used by multiple hook scripts. This review should compare the two and identify capabilities GSD has that Towline lacks.

## Tasks

1. Read and catalog all functions/utilities in GSD's gsd-tools.js
2. Map each function to its Towline equivalent in towline-tools.js (if one exists)
3. Identify gaps — utilities GSD has that Towline lacks
4. For each gap, assess whether Towline would benefit from adding it
5. Note any architectural patterns or design decisions worth adopting
6. Check if any existing Towline utilities need upgrades based on GSD's approach

## Acceptance Criteria

- [ ] Complete function-by-function comparison of gsd-tools.js vs towline-tools.js
- [ ] Gap list with priority and rationale for each
- [ ] Recommendations for new utilities to add to towline-tools.js
- [ ] Notes on any design patterns worth adopting
