---
title: "Create progress display and error reporting shared fragments"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: quality
---

## Goal

Progress bars, phase tables, and error formats are inconsistent across skills. Some use `[████░░░░]`, some use `██████░░░░`, error boxes vary in format. Standardize into shared fragments.

## Changes

1. **`plugins/dev/skills/shared/progress-display.md`** — Standardize:
   - Progress bar format (20 chars wide: `[████████░░░░░░░░░░░░] 40%`)
   - Phase table format (Status, Plans, Progress columns)
   - Wave display format for build progress
   - Status indicators (✓ Complete, ◐ Building, ○ Pending)

2. **`plugins/dev/skills/shared/error-reporting.md`** — Standardize:
   - Recoverable error box format
   - Fatal error box format
   - Validation error format
   - "To fix:" section format

## Acceptance Criteria

- [ ] Progress display consistent across status, build, review, milestone
- [ ] Error format consistent across all skills
- [ ] Follows ui-formatting.md branding
