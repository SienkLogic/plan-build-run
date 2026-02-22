# Audit: pbr:plan-checker

## Agent Overview
- Lines: 203 | Model: sonnet | Tools: Read, Bash, Glob, Grep (NO Write/Edit)
- Spawned by: `/pbr:plan` (after planner produces plans)
- Gate validation: None specific -- no gate function in validate-task.js targets plan-checker
- Output validation: `check-subagent-output.js` marks as `noFileExpected: true` -- advisory output only

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| 9 Verification Dimensions | High | Low | Each dimension has clear severity table |
| D1: Requirement Coverage | High | Low | BLOCKER/WARNING levels explicit |
| D2: Task Completeness | High | Low | 5-element check is mechanical |
| D3: Dependency Correctness | High | Low | Circular dep detection is clear |
| D4: Key Links Planned | High | Low | "Island" task detection is useful |
| D5: Scope Sanity | High | Low | Hard limits (>3 tasks = BLOCKER) |
| D6: Verification Derivation | High | Med | "Non-executable verify command" requires judgment |
| D7: Context Compliance | High | Low | Clear skip condition |
| D8: Dependency Coverage | High | Low | Provides/consumes mechanical check |
| D9: Requirement Traceability | High | Low | Bidirectional coverage |
| Verification Process | High | Low | 6 clear steps |
| Output Format | High | Low | Two format variants (PASSED / ISSUES FOUND) |
| Edge Cases | High | Low | 5 edge cases covered |

## Output Format Gaps
1. **Output is text, not file**: Plan-checker returns its report as console/text output, not a file. `check-subagent-output.js` correctly marks `noFileExpected: true`. The orchestrator (plan skill) must capture this output. If the plan-checker's text output is too long, it may be truncated. **Fix**: Consider having plan-checker write to a temp file for large reports.
2. **No structured machine-readable format**: Output is markdown text. If the plan skill needs to programmatically determine "are there blockers?", it must parse the text. **Fix**: Add a one-line structured prefix like `RESULT: {blockers: N, warnings: N}` before the markdown.

## Gate Coverage Gaps
1. **No gate at all**: Plan-checker has no gate function in validate-task.js. It can be spawned from any skill context. Low risk since it's read-only, but could waste tokens if spawned without plans to check.
2. **No validation that plans exist before spawning**: If plan-checker is spawned before the planner has written plans, it will find nothing and report "0 plans found" -- not harmful but wastes a subagent context window.

## Cognitive Load Risks
1. **9 dimensions is a lot**: The agent must evaluate ALL 9 dimensions per plan. With 3 plans x 9 dimensions = 27 checks. Context pressure may cause later dimensions (D7-D9) to be rushed. **Mitigation**: The dimensions are well-structured; the severity tables make each check mechanical.
2. **Cross-plan checks (Step 5)**: After individual plan checks, must do cross-plan file conflict analysis. This is an additional pass that may be skipped. **Mitigation**: Step 5 is explicitly listed in the process.

## Cross-Agent Handoff Issues
1. **Plan-checker -> Planner revision**: Plan-checker output becomes planner input in Revision Mode. The output format uses `[{plan_id}] D{N} {severity} (Task {id}): {description}` which the planner must parse. If plan-checker deviates from this format, planner's Revision Mode step 1 ("Parse all issues") may fail.
2. **Scope limits differ from planner**: Plan-checker enforces >3 tasks = BLOCKER, >8 files = BLOCKER. Planner says "2-3 per plan" and "8 files total". These are consistent but plan-checker is stricter (BLOCKER vs planner's soft limit).

## Priority Fixes
- [ ] P2: Add structured result prefix to output for machine parsing
- [ ] P3: Add advisory gate checking that PLAN*.md exists before spawning
- [ ] P3: Consider writing report to temp file for large multi-plan checks
