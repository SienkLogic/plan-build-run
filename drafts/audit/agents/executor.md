# Audit: pbr:executor

## Agent Overview
- Lines: 243 | Model: inherit | Tools: Read, Write, Edit, Bash, Glob, Grep
- Spawned by: `/pbr:build`, `/pbr:quick`
- Gate validation: `checkQuickExecutorGate`, `checkBuildExecutorGate`, `checkPlanExecutorGate`, `checkBuildDependencyGate`, `checkCheckpointManifest`
- Output validation: `check-subagent-output.js` checks for SUMMARY*.md in phase or quick dir; `checkSummaryCommits` validates commits field in frontmatter

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Execution Flow (10 steps) | High | Med | Long sequential list; steps 6-9 (post-execution) are highest skip risk |
| State Management / Progress Tracking | High | Low | Well-specified JSON format with crash recovery |
| Continuation Protocol | High | Low | Clear 3-step resume |
| Atomic Commits | High | Low | Clear format and staging rules |
| Deviation Rules | High | Low | Decision table is unambiguous |
| Checkpoint Handling | High | Med | "Automation-first" is subjective -- LLM may over-checkpoint or under-checkpoint |
| TDD Mode | High | Med | 3-commit requirement easy to collapse into 1 under cognitive load |
| SUMMARY.md generation | Med | **High** | Template reference but no CRITICAL marker; completeness checklist is a soft "before deleting" |
| Self-Check | Med | **High** | 3 verification steps at end of workflow -- classic "last steps skipped" pattern |
| Time Tracking | Low | **High** | `date +%s` is Unix-only; no Windows equivalent given; easily forgotten |
| USER-SETUP.md generation | Med | Med | Conditional generation ("if the plan introduced...") is vague -- who decides? |
| State Write Rules | High | Low | Clear "do NOT modify STATE.md" |

## Output Format Gaps
1. **SUMMARY.md filename**: Agent says `SUMMARY-{plan_id}.md` but `check-subagent-output.js` matches `/^SUMMARY.*\.md$/i` -- any SUMMARY prefix works, but planner/verifier agents reference `SUMMARY.md` (no plan_id suffix). **Fix**: Standardize naming across agents or document both are acceptable.
2. **Progress file path**: `.planning/phases/{phase_dir}/.PROGRESS-{plan_id}` -- the dotfile prefix means it won't show in normal `ls`. Intentional but undocumented rationale.
3. **Time tracking command**: `date +%s` fails on Windows (Git Bash may work, PowerShell won't). **Fix**: Use `node -e "console.log(Date.now())"` for cross-platform.

## Gate Coverage Gaps
1. **No gate for debugger spawning executor-like behavior**: The debugger has Write/Edit tools and can make code changes + commits. No gate prevents debugger from being spawned when executor should be used. Low risk since debugger has clear scope limits.
2. **Quick executor gate checks ANY quick dir**: `checkQuickExecutorGate` checks if any `{NNN}-*/PLAN.md` exists, not specifically the current task's dir. Could pass gate with a stale PLAN.md from a prior quick task. **Fix**: Check the highest-numbered quick dir specifically.
3. **No gate for executor spawned outside build/quick skills**: If executor is spawned from an unlisted skill (e.g., `continue`, `resume`), no gate fires because `.active-skill` won't match. The `checkActiveSkillIntegrity` advisory catches missing `.active-skill` but not mismatched skills.

## Cognitive Load Risks
1. **Post-execution steps (6-9)**: SUMMARY.md creation, completeness check, self-check, progress file deletion -- all happen after the "real work" is done. LLM attention is lowest here. **Mitigation**: Add CRITICAL markers before step 6; `check-subagent-output.js` partially catches missing SUMMARY.
2. **TDD 3-commit discipline**: Under pressure to finish, LLM will collapse RED+GREEN+REFACTOR into fewer commits. **Mitigation**: Could validate commit count in `check-subagent-output.js` for TDD tasks.
3. **Checkpoint completeness**: When returning a checkpoint response, the agent must include completed tasks table + remaining tasks list. Easy to forget partial fields. **Mitigation**: Template reference would help.

## Cross-Agent Handoff Issues
1. **SUMMARY.md naming mismatch with verifier**: Executor writes `SUMMARY-{plan_id}.md`, verifier reads SUMMARY.md frontmatter via `pbr-tools.js must-haves`. If pbr-tools expects `SUMMARY.md` not `SUMMARY-02-01.md`, the verifier won't find it. **Fix**: Verify pbr-tools handles both patterns.
2. **Executor writes SUMMARY.md, build skill reads it to update STATE.md**: The "State Write Rules" correctly say executor doesn't touch STATE.md, but if SUMMARY.md frontmatter is malformed, the build skill silently fails to update STATE.md. No validation layer between executor output and build skill consumption.
3. **Deviation Rule 4 checkpoint vs planner re-planning**: When executor stops with `CHECKPOINT: ARCHITECTURAL-DEVIATION`, the handoff back to planner is undefined. Who spawns the planner? The build skill? The user? Not documented.

## Priority Fixes
- [ ] P1: Add CRITICAL marker before SUMMARY.md creation (step 6) -- highest skip-risk step with hook enforcement
- [ ] P1: Fix `date +%s` cross-platform issue -- Windows CI will break
- [ ] P2: Standardize SUMMARY.md naming convention across executor/verifier/build-skill
- [ ] P2: Document architectural deviation handoff flow (executor -> ??? -> planner)
- [ ] P3: Tighten quick executor gate to check highest-numbered dir only
- [ ] P3: Add checkpoint response template reference
