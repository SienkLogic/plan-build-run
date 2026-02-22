# PBR Enforcement Audit — Master Summary

**Date**: 2026-02-20
**Scope**: All 24 skills, 10 agents, 32 hook scripts, 14 shared fragments
**Plugins**: PBR + Cursor + Copilot (same pass)

---

## Executive Summary

The audit found **17 of 24 skills have no substantive enforcement markers** (only the boilerplate header STOP). The known lesson from `/pbr:quick` — that prompt-only instructions get skipped under cognitive load — applies broadly. The most critical systemic gap is that **begin, plan, and review skills don't write `.active-skill`**, silently disabling all 9 gate functions in `validate-task.js` for those skills.

### By the Numbers

| Category | Total | With Enforcement | Gap |
|----------|-------|-----------------|-----|
| Skills | 24 | 7 (29%) | 17 skills have header-only STOP |
| Agents | 10 | 4 gated (40%) | 6 agents have no spawn gates |
| Hook entries | 18 | — | 9 unprotected workflow paths identified |
| P1 fixes | **14** | — | Must fix before next release |
| P2 fixes | **28** | — | Should fix soon |
| P3 fixes | **19** | — | Nice to have |

---

## P1 — Critical Fixes (14)

### Systemic: `.active-skill` Not Written (3 skills)

The **single most impactful fix** — enables all existing gates without writing new hook code.

| # | Skill | Issue | Fix |
|---|-------|-------|-----|
| 1 | begin | No `.active-skill` → all 9 gates disabled | Add `.active-skill` write in Step 1 |
| 2 | plan | No `.active-skill` → plan executor gate disabled | Add `.active-skill` write in Step 1 |
| 3 | review | No `.active-skill` → verifier gate disabled | Add `.active-skill` write in Step 1 |

### Systemic: Missing CRITICAL Markers on File Creation

| # | Skill | Step | What Gets Skipped | Fix |
|---|-------|------|-------------------|-----|
| 4 | begin | Steps 7e, 9a-9e | REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json | Add CRITICAL before each file write |
| 5 | build | Steps 5b, 6f, 8a | SUMMARY.md aggregation, verification, STATE.md update | Add CRITICAL markers |
| 6 | milestone | complete Steps 5-8 | Archive moves, ROADMAP update, STATE update, git tag | Add CRITICAL + rollback safety |
| 7 | setup | Steps 3-6 | .planning/ dirs, config.json, STATE.md, ROADMAP.md | Add CRITICAL markers |
| 8 | pause | Step 3 | .continue-here.md (breaks /pbr:resume) | Add CRITICAL marker |

### Agent-Level P1s

| # | Agent | Issue | Fix |
|---|-------|-------|-----|
| 9 | verifier | No Write tool but instructions say write VERIFICATION.md | Add Write to tool list OR document orchestrator handoff |
| 10 | integration-checker | `noFileExpected: true` contradicts report-writing instructions | Resolve contradiction |
| 11 | planner | Produces `{phase}-{NN}-PLAN.md` but gate requires `PLAN-{NN}.md` | Fix naming in agent definition |
| 12 | executor | `date +%s` fails on Windows | Use `node -e` for cross-platform time |

### Hook-Level P1s

| # | Script | Issue | Fix |
|---|--------|-------|-----|
| 13 | import skill | No `.active-skill` → validate-task.js gates don't apply | Add `.active-skill` registration |
| 14 | statusline | settings.json write with no backup → can corrupt Claude Code config | Add backup + restore on failure |

---

## P2 — Important Fixes (28)

### Missing CRITICAL Markers (10)

| Skill | Steps at Risk |
|-------|--------------|
| resume | Auto-reconcile STATE.md step |
| discuss | CONTEXT.md write + STATE.md pointer update |
| health | 10 sequential checks (LLM runs 3-5 and skips) |
| import | Step 8a ROADMAP.md update |
| scan | Codebase-mapper output directory creation |
| todo | `done` subcommand: verify done/ write before deleting pending/ |
| explore | Artifact creation gate (user must approve first) |
| debug | Debug file creation + round counter persistence |
| note | Note filename creation + `.planning/notes/` directory |
| config | config.json schema validation |

### Missing Hook Guards (8)

| Area | Gap | Recommended Hook |
|------|-----|-----------------|
| note/todo/debug | Not in `check-skill-workflow.js` | Add skill registration |
| scan | codebase-mapper not in `check-subagent-output.js` | Add mapper validation |
| milestone complete | Destructive phase moves with no rollback check | Add pre-move verification |
| health | No enforcement that all 10 checks run | Add completion checklist |
| pause | `.continue-here.md` not validated | Add PostToolUse check |
| validate-task.js | Milestone gate checks file existence not `status: passed` | Strengthen gate |
| researcher/synthesizer | Pre-existing files satisfy output check (no recency) | Add mtime check |
| debugger | Full Write/Edit/Bash access with no gate | Add advisory gate |

### Agent Improvements (10)

| Agent | Issue |
|-------|-------|
| All 7 template-dependent | No fallback format when `.tmpl` missing |
| All 10 | Post-execution steps (summaries, validation) are highest skip risk |
| researcher→synthesizer | Implicit contract: confidence levels + source tags |
| synthesizer→planner | `[NEEDS DECISION]` flag handling undocumented |
| executor→verifier | SUMMARY.md frontmatter schema implicit |
| general | No SUMMARY.md format reference for quick tasks |
| plan-checker | References planner output format but no validation |
| debug | File schema mismatch: 3 status values in skill vs 5 in agent |
| explore | Note filename format conflicts with note skill |
| codebase-mapper | No focus parameter validation |

---

## P3 — Nice to Have (19)

- Universal anti-patterns duplicated 10x across agents (maintenance burden)
- `check-subagent-output.js` recency validation (mtime-based)
- Create `references/agent-contracts.md` for formal handoff schemas
- Context-budget tracking for subagents (currently orchestrator-only)
- Advisory warning for single-phase projects (integration-checker)
- Discuss skill: Step 5 deep-dive (12-16 questions) high skip risk
- Status skill: 7 special condition checks lack enforcement
- Continue skill: Complex `Skill()` routing logic has no validation
- Dashboard skill: No error handling for npm install failure
- Help skill: Static content risks going stale
- Do skill: No validation that routed skill exists
- Config skill: Partial config writes leave inconsistent state
- Researcher: No cycle-detection for recursive research spawns
- Plan-checker: No fallback when planner output is malformed
- Codebase-mapper: Missing file gracefully handled by researcher
- General: Self-escalation thresholds are self-assessed
- Setup: No idempotency check for re-running on existing project
- Import: 16 conflict detection checks with no structural enforcement on individual checks
- Import: PLAN.md naming convention conflict with build gate regex

---

## Workflow Gap Analysis (User Perspective)

### Critical User-Facing Gaps

1. **Partial setup leaves broken state**: If `/pbr:setup` is interrupted after creating `.planning/` but before writing config.json, the project is in an unrecoverable state. No health check detects this.

2. **Milestone complete is destructive with no undo**: Phase directories are MOVED (deleted from source) during archive. If the archive write fails mid-way, phases are lost. No backup or transaction semantics.

3. **Pause/resume fragile handoff**: If `/pbr:pause` skips writing `.continue-here.md`, `/pbr:resume` silently falls back to generic state, losing the user's exact position.

4. **Import naming clash**: Imported plans may not match the `PLAN-{NN}.md` naming convention, causing build gate failures that are confusing to diagnose.

5. **No visibility into gate failures**: When `validate-task.js` blocks an agent spawn, the error message references internal gate names. Users see cryptic messages about "checkBuildExecutorGate" with no guidance on how to fix.

### Recovery Path Gaps

| Scenario | Current Recovery | Recommended |
|----------|-----------------|-------------|
| Executor fails mid-build | Manual re-run | Add checkpoint/resume support |
| Verifier finds gaps | Re-spawn executor | Provide specific gap-fixing instructions |
| Plan-checker rejects plan | Revision loop | Show specific failing criteria |
| Health check finds corruption | Manual fix | Auto-fix for common issues |
| Config becomes invalid | Manual edit | Schema validation + rollback |

---

## Hook Coverage Map

```
Lifecycle:  SessionStart → [work] → Stop → SessionEnd
                ↓                      ↓         ↓
          progress-tracker    auto-continue  session-cleanup

PreToolUse Gates:
  Bash  → pre-bash-dispatch → validate-commit + check-dangerous + check-phase-boundary
  Write → pre-write-dispatch → check-skill-workflow (⚠️ 3 skills unregistered)
  Task  → validate-task.js   (⚠️ 6 agents ungated, 3 skills don't write .active-skill)
  Skill → validate-skill-args

PostToolUse Checks:
  Write → post-write-dispatch → check-plan-format + check-roadmap-sync + check-state-sync
  Write → post-write-quality  → check-doc-sprawl + check-skill-workflow
  Write → suggest-compact
  Read  → track-context-budget
  Task  → check-subagent-output (⚠️ researcher/synthesizer too loose)

SubagentStop → log-subagent + event-handler (auto-verify trigger)
```

---

## Recommended Implementation Order

### Wave 1: Maximum Impact, Minimum Code (est. ~20 changes)
1. Write `.active-skill` in begin, plan, review, import skills
2. Add CRITICAL markers to all file-creation steps in begin, build, milestone, setup, pause
3. Fix planner agent PLAN filename convention
4. Fix executor `date +%s` cross-platform issue

### Wave 2: Hook Hardening (~15 changes)
5. Register note/todo/debug in `check-skill-workflow.js`
6. Add codebase-mapper to `check-subagent-output.js`
7. Add mtime-based recency to researcher/synthesizer output checks
8. Resolve verifier/integration-checker Write tool contradiction
9. Add statusline settings.json backup

### Wave 3: Agent Strengthening (~15 changes)
10. Add inline fallback formats to all template-dependent agents
11. Add CRITICAL markers before post-execution artifact writes
12. Document agent contracts in `references/agent-contracts.md`
13. Fix debug file schema mismatch between skill and agent
14. Add `[NEEDS DECISION]` handling to planner

### Wave 4: Workflow Polish (~10 changes)
15. Add milestone complete rollback safety
16. Add setup idempotency check
17. Improve gate failure error messages
18. Add health auto-fix for common corruption patterns

---

## Deliverables Index

| Artifact | Location | Count |
|----------|----------|-------|
| Skill audit reports | `drafts/audit/skills/*.md` | 24 |
| Agent audit reports | `drafts/audit/agents/*.md` | 10 |
| Cross-agent summary | `drafts/audit/agents/CROSS-AGENT-SUMMARY.md` | 1 |
| Lifecycle flowchart | `drafts/audit/flowcharts/pbr-lifecycle.md` | 1 |
| Rendered diagrams | 3 Mermaid Chart renders (lifecycle, agent map, hook coverage) | 3 |
| This summary | `drafts/audit/MASTER-AUDIT-SUMMARY.md` | 1 |
| **Total** | | **40 documents** |
