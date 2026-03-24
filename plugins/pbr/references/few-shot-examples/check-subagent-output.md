---
component: check-subagent-output
version: 1
last_calibrated: 2026-03-24
---

# check-subagent-output Few-Shot Examples

These examples document output sufficiency patterns. The hook checks file existence and structure, not content quality.

## Positive Examples

### Example 1: Executor produces SUMMARY.md with required fields and completion marker

**Scenario:** Build skill spawns `pbr:executor` for plan 42-01. Executor writes SUMMARY-01.md and returns completion marker.

**SUMMARY-01.md on disk:**

```yaml
---
phase: "42-auth-refactor"
plan: "42-01"
status: "complete"
provides:
  - "Encrypted session storage"
requires: []
key_files:
  - "src/auth/middleware.js: AES-256-GCM encryption"
deferred: []
---
```

```markdown
## Self-Check: PASSED

- [x] middleware.js has createCipheriv call
- [x] Tests pass with `npm test`
```

**Task tool_output contains:** `## PLAN COMPLETE`

**Hook result:** Verified. The hook finds SUMMARY-01.md in the phase directory (mtime within last 15 minutes), confirms the file exists, and sees the completion marker in `tool_output`. No warnings emitted. The build skill can route to the next step (verification or next plan).

### Example 2: Verifier produces VERIFICATION.md with status and per-criterion evidence

**Scenario:** Review skill spawns `pbr:verifier` for phase 42. Verifier writes VERIFICATION.md.

**VERIFICATION.md on disk:**

```yaml
---
phase: "42-auth-refactor"
status: "passed"
must_haves_checked: 3
must_haves_passed: 3
must_haves_total: 3
---
```

```markdown
## Must-Have Verification

### Truth 1: Session tokens are encrypted at rest
**L1 (Existence):** grep shows `createCipheriv` in middleware.js line 23.
**L2 (Substantive):** AES-256-GCM with 32-byte key, IV generation per write.
**L3 (Wired):** middleware.js required by server.js line 8, session.save() calls encrypt().
**Status: PASSED**

### Artifact 1: src/auth/middleware.js: >50 lines
**L1 (Existence):** File exists, 87 lines.
**L2 (Substantive):** 3 exported functions, no TODO/FIXME stubs.
**L3 (Wired):** Imported by server.js and tested in middleware.test.js.
**Status: PASSED**

### Key Link 1: middleware.js imported by server.js
**Evidence:** `grep -n "require.*middleware" src/server.js` shows line 8.
**Status: PASSED**
```

**Hook result:** Verified. The hook finds VERIFICATION.md in the phase directory. No warnings emitted. The `status: "passed"` frontmatter field and per-criterion evidence rows confirm the verifier did substantive work.

## Negative Examples

### Example 1: Executor completes but no SUMMARY.md exists on disk

**Scenario:** Build skill spawns `pbr:executor` for plan 42-01. The executor hits a tool error mid-run (e.g., a Bash command timeout) and returns without writing SUMMARY.md.

**Phase directory contents:** `PLAN-01.md` only. No `SUMMARY-01.md` or `SUMMARY.md`.

**Task tool_output contains:** (error trace or partial output, no completion marker)

**Hook result:** Warning emitted via `additionalContext`:

```
[WARN] Agent pbr:executor completed but no SUMMARY-{plan_id}.md (or SUMMARY.md) was found.
Likely causes: (1) agent hit an error mid-run, (2) wrong working directory.
To fix: re-run the parent skill -- the executor gate will block until the output is present.
Check the Task() output above for error details.
```

**Why this matters:** Without SUMMARY.md, the build skill has no artifact to pass to the verifier. The warning tells the orchestrator to re-run rather than proceeding to verification with missing data.

### Example 2: Executor produces SUMMARY.md but no completion marker in tool_output

**Scenario:** Build skill spawns `pbr:executor` for plan 42-01. The executor writes SUMMARY-01.md to disk but its final output text does not include `## PLAN COMPLETE`, `## PLAN FAILED`, or `## CHECKPOINT:`.

**SUMMARY-01.md on disk:** Exists with valid frontmatter.

**Task tool_output contains:** `"All tasks completed successfully."` (no structured marker)

**Hook result:** Skill-specific warning emitted:

```
Executor did not return a completion marker (expected ## PLAN COMPLETE, ## PLAN FAILED, or ## CHECKPOINT:).
Build skill may not route correctly.
```

**Why this matters:** The build skill pattern-matches on completion markers to decide the next action: advance to verification (`PLAN COMPLETE`), handle failure (`PLAN FAILED`), or checkpoint (`CHECKPOINT:`). Without a marker, the build skill cannot route and may stall or take the wrong branch. The SUMMARY.md file exists, so the generic "missing output" warning does not fire -- only this marker-specific warning catches the problem.
