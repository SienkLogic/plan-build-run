# Audit: pbr:integration-checker

## Agent Overview
- Lines: 92 | Model: sonnet | Tools: Read, Bash, Glob, Grep (NO Write/Edit)
- Spawned by: `/pbr:milestone audit`, `/pbr:review`
- Gate validation: None specific in validate-task.js
- Output validation: `check-subagent-output.js` marks as `noFileExpected: true` -- advisory output only

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Scope: vs Verifier | High | Low | Comparison table is excellent disambiguation |
| Required Checks (5 categories) | High | Med | "skip only if zero items exist" -- LLM may over-skip |
| 6-Step Verification Process | High | Med | Steps 3-4 (API coverage, auth protection) require deep codebase knowledge |
| Output Format | Med | Med | References template but `noFileExpected: true` in check-subagent-output.js |
| When This Agent Is Spawned | High | Low | 3 contexts clearly listed |

## Output Format Gaps
1. **CRITICAL: noFileExpected contradicts agent instructions**: Agent says "Read `templates/INTEGRATION-REPORT.md.tmpl`" and the output section implies writing a file. But `check-subagent-output.js` marks this agent as `noFileExpected: true`. **Either**: the agent writes INTEGRATION-REPORT.md (and the output check is wrong), OR the agent returns text (and the instructions are misleading). **Fix**: Resolve the contradiction -- if it writes a file, update check-subagent-output.js; if text-only, remove file-writing language from agent.
2. **No Write tool**: Like verifier, integration-checker has no Write tool but instructions imply writing a report. Same issue as verifier. The orchestrator must capture and write the output.

## Gate Coverage Gaps
1. **No gate**: Can be spawned from any context. Since it's read-only, risk is low.
2. **No validation that multiple phases exist**: Integration-checker checks ACROSS phases. If only one phase exists, most checks (export/import wiring, cross-phase deps) are vacuous. **Fix**: Advisory warning if fewer than 2 completed phases.

## Cognitive Load Risks
1. **5 required check categories**: Each is substantial (export/import mapping, API route discovery, auth middleware analysis, E2E flow tracing, cross-phase deps). This is the most context-intensive agent after executor. **Mitigation**: "skip only if zero items" provides escape valves.
2. **E2E flow tracing**: Step 5 requires tracing "from UI through API to data layer and back" -- this is very deep analysis. May produce superficial results under context pressure.

## Cross-Agent Handoff Issues
1. **Integration-checker -> Planner**: If integration issues are found during milestone audit, who creates the fix plans? Not documented. Presumably the review skill would spawn planner, but integration-checker is spawned from milestone skill.
2. **SUMMARY.md provides/requires**: Integration-checker validates that `provides`/`requires` from SUMMARY.md match reality. If executor's SUMMARY.md has inaccurate provides/requires (see executor audit), integration-checker reports false issues.

## Priority Fixes
- [ ] P1: **Resolve noFileExpected vs report-writing contradiction** -- update check-subagent-output.js or agent instructions
- [ ] P2: Document fix flow when integration issues found (milestone audit -> ??? -> planner)
- [ ] P3: Add advisory warning for single-phase projects
