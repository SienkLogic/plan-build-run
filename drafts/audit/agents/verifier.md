# Audit: pbr:verifier

## Agent Overview
- Lines: 198 | Model: sonnet | Tools: Read, Bash, Glob, Grep (NO Write/Edit)
- Spawned by: `/pbr:review`, auto-verification via `event-handler.js`
- Gate validation: `checkReviewVerifierGate` (review skill requires SUMMARY.md)
- Output validation: `check-subagent-output.js` checks for VERIFICATION.md in phase dir

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| 10-Step Verification Process | High | Med | 10 steps is long; steps 8-9 (anti-patterns, human needs) are skip candidates |
| Step 1: Check Previous Verification | High | Low | Clear re-verification vs full mode |
| Step 2: Load Context | High | Low | pbr-tools CLI commands are explicit |
| Step 3: Establish Must-Haves | High | Low | Clear derivation from plan frontmatter |
| Step 4: Verify Observable Truths | High | Low | 4 classification statuses |
| Step 5: Verify Artifacts (3 levels) | High | Med | 3-level verification is thorough but Level 2+3 may be skipped for speed |
| Step 6: Verify Key Links | High | Med | Requires grep + call-chain analysis -- complex work |
| Step 7: Requirements Coverage | High | Low | Table format is clear |
| Step 8: Anti-Pattern Scan | Med | **High** | "Full Verification Only" tag means it's skippable; "blockers only" is subjective |
| Step 9: Human Verification Needs | Med | **High** | Lowest priority, "Full Verification Only" |
| Step 10: Determine Overall Status | High | Low | Decision table is unambiguous |
| Re-Verification Mode | High | Low | Selective depth is well-specified |
| Budget Management | High | Low | Clear priority order for context-limited scenarios |

## Output Format Gaps
1. **VERIFICATION.md is written by a read-only agent**: The verifier has NO Write tool but is expected to produce VERIFICATION.md. **This appears to be a bug** -- either the verifier needs Write tool, or the output is returned as text for the orchestrator to write. Checking the tool list: `Read, Bash, Glob, Grep` -- no Write. **However**, looking at the description: "Write to `.planning/phases/{phase_dir}/VERIFICATION.md`." This is contradictory. **Fix**: Either add Write to tools list or clarify that output is returned to orchestrator for writing.
2. **Template reference**: References `templates/VERIFICATION-DETAIL.md.tmpl` -- good delegation but the agent can't write the file without Write tool.
3. **Override handling**: Must-haves in `overrides` list marked `PASSED (override)` -- this status string isn't in the decision table. Minor inconsistency.

## Gate Coverage Gaps
1. **Auto-verification has no gate in validate-task.js**: `event-handler.js` writes `.auto-verify` signal file, but the actual verifier spawn happens in the review/build skill, not via a gated Task() call. If the orchestrator spawns verifier directly, only `checkReviewVerifierGate` fires (requires active skill = "review").
2. **No gate preventing verifier spawn without plans**: Verifier needs plan must-haves to verify against. If no PLAN*.md exists, verifier would have nothing to derive must-haves from (Step 3 fallback: derive from ROADMAP.md, which is less precise).
3. **Event-handler only triggers on `building` status**: If STATE.md status is anything other than "building", auto-verification is skipped. This is intentional but means manual `/pbr:review` is the only path for re-verification after gap closure.

## Cognitive Load Risks
1. **Level 2+3 artifact verification**: Checking for stubs (TODO/FIXME, empty bodies) and wiring (import chains) across potentially many artifacts is context-heavy. LLM may shortcut to Level 1 only. **Mitigation**: Anti-pattern #5 "DO NOT skip Level 2 or Level 3" is explicit but prompt-only.
2. **Steps 8-9 are "Full Verification Only"**: Marking steps as optional creates a natural skip target. **Mitigation**: Budget Management section explicitly says "Skip anti-pattern scan if needed" -- this is the intended escape valve.
3. **Re-verification regression detection**: Comparing current vs previous results requires holding both in context simultaneously. High memory pressure.

## Cross-Agent Handoff Issues
1. **CRITICAL: Write tool missing**: Verifier is described as producing VERIFICATION.md but lacks the Write tool. The orchestrator (review skill) must handle the file write, OR the tool list is wrong. Need to check the review skill to confirm handoff.
2. **Verifier -> Planner gap closure**: Verifier produces gaps; planner creates gap-closure plans. The format of gaps in VERIFICATION.md must match what the planner expects to parse. Both reference templates, so the template is the contract. Appears sound.
3. **pbr-tools CLI dependency**: Steps 2 uses `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js` -- if this fails (path issue, Node error), the verifier has no fallback. The instruction says "Stop and report error" which is correct.

## Priority Fixes
- [ ] P1: **Resolve Write tool contradiction** -- either add Write to tools list or document that orchestrator writes VERIFICATION.md from verifier output
- [ ] P2: Add gate preventing verifier spawn when no PLAN*.md exists in phase dir
- [ ] P3: Clarify "PASSED (override)" status in the outcome decision table
- [ ] P3: Consider adding Level 2/3 verification as hook-enforced requirement
