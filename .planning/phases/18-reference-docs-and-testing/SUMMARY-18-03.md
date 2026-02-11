---
phase: "18-reference-docs-and-testing"
plan: "18-03"
status: "complete"
subsystem: "tests"
tags:
  - "testing"
  - "AskUserQuestion"
  - "gate-prompts"
  - "validation"
requires:
  - "18-01: updated reference docs with AskUserQuestion patterns"
  - "18-02: updated reference docs with AskUserQuestion gate check examples"
provides:
  - "gate-prompts-validation.test.js: structural validation of all 21 gate prompt patterns"
  - "skill-askuserquestion-audit.test.js: skill-level AskUserQuestion consistency audit"
affects:
  - "tests/"
tech_stack:
  - "Jest"
  - "CommonJS"
key_files:
  - "tests/gate-prompts-validation.test.js: validates 21 gate prompt patterns for structure (unique names, header length, option count, multiSelect, question)"
  - "tests/skill-askuserquestion-audit.test.js: audits 21 skills for AskUserQuestion in allowed-tools, plain-text gate absence, pattern ref validity"
key_decisions:
  - "EXCLUDED_SKILLS expanded to 6: plan listed 4 (continue, health, help, pause) but note and todo also intentionally lack AskUserQuestion in allowed-tools"
  - "Pattern reference regex requires hyphen in slug: prevents false positives from generic words like 'Glob pattern' or 'logging patterns'"
patterns:
  - "data-driven test.each: used in gate-prompts-validation.test.js for per-pattern assertions"
  - "parsePatterns helper: splits gate-prompts.md on '## Pattern:' markers, extracts header/optionCount"
  - "parseAllowedTools helper: extracts allowed-tools from SKILL.md YAML frontmatter"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  tasks_total: 3
  commits: 2
  files_created: 2
  files_modified: 0
deferred:
  - "6 pre-existing ESLint errors in other files (suggest-compact.js, check-doc-sprawl.test.js, reference-integrity.test.js, schema-validation.test.js, status-line.test.js) — not related to this plan"
---

# Plan Summary: 18-03

## What Was Built

Two new test files that validate the AskUserQuestion gate prompt infrastructure. The first test file (`gate-prompts-validation.test.js`) parses `skills/shared/gate-prompts.md` and validates all 21 patterns for structural correctness: unique names, header max 12 characters, 2-4 options per pattern, `multiSelect: false`, and a question template. It generates 87 individual test assertions using Jest's `test.each`.

The second test file (`skill-askuserquestion-audit.test.js`) audits all 21 skill directories for AskUserQuestion consistency: verifying that 15 skills have AskUserQuestion in their allowed-tools, 6 excluded skills intentionally lack it, no unconverted plain-text gate patterns remain, and all pattern slug references in skill files point to actual patterns in gate-prompts.md.

The full test suite runs clean at 632 tests across 33 suites with no regressions. Plugin validation passes.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 18-03-T1: Create gate-prompts-validation.test.js | done | 0cfd29f | 1 | passed (87 tests) |
| 18-03-T2: Create skill-askuserquestion-audit.test.js | done | 4defd25 | 1 | passed (5 tests) |
| 18-03-T3: Run full test suite to confirm no regressions | done | (verify-only) | 0 | passed (632 tests, lint clean for new files, validate clean) |

## Key Implementation Details

**gate-prompts-validation.test.js**: Uses a `parsePatterns()` helper that splits file content on `## Pattern: ` markers, extracts each pattern's name, header value (stripping quotes), and counts `- label:` lines for option count. Returns array of `{ name, content, header, optionCount }` objects. Each structural property is validated with `test.each` for all 21 patterns.

**skill-askuserquestion-audit.test.js**: The EXCLUDED_SKILLS list was expanded from the plan's 4 to 6 — adding `note` and `todo` which also intentionally lack AskUserQuestion in their allowed-tools. The pattern reference regex requires at least one hyphen in the slug (`[\w-]+-[\w-]+`) to avoid false positives from generic phrases like "Glob pattern" or "logging patterns" that appear in skill files.

The plain-text gate detection uses context-aware matching: if a potential unconverted gate pattern (e.g., `Type "approved"`) appears within 3 lines of "do NOT", "freeform", "example", or "Anti-Pattern", it's treated as intentional documentation, not a violation.

## Known Issues

- 6 pre-existing ESLint errors exist in files unrelated to this plan. None of the new test files have lint issues.

## Dependencies Provided

- `tests/gate-prompts-validation.test.js` — can be used to catch structural regressions when editing gate-prompts.md
- `tests/skill-askuserquestion-audit.test.js` — will flag skills that add/remove AskUserQuestion without updating the EXCLUDED_SKILLS list, and catch stale pattern references
