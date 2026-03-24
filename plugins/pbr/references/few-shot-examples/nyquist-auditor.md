---
component: nyquist-auditor
version: 1
last_calibrated: 2026-03-24
---

# Nyquist-Auditor Few-Shot Examples

## Positive Examples

### Example 1: Unvalidated code path identified with specific line range and fix

**Input:** Gap: Task T2 requires "post-write-dispatch.js validates STATE.md writes" but no test covers the STATE.md branch.

**Output:**

> **Gap: T2 -- STATE.md write validation**
> **Analysis:** Read `plugins/pbr/scripts/post-write-dispatch.js` lines 45-78. The `checkSync` function handles ROADMAP.md (line 52) and PLAN.md (line 61) but returns `null` for STATE.md writes (line 71: `if (file.includes('STATE.md')) return null`). This means STATE.md writes bypass all validation in the dispatch chain.
> **Test created:** `tests/post-write-dispatch-state.test.js`
> ```javascript
> test('STATE.md writes trigger checkStateWrite validation', () => {
>   const result = dispatch({ file_path: '.planning/STATE.md', content: '---\nstatus: building\n---' });
>   expect(result).not.toBeNull();
>   expect(result.additionalContext).toContain('STATE.md');
> });
> ```
> **Run:** `npx jest tests/post-write-dispatch-state.test.js` -- FAILED (expected: not null, received: null)
> **Classification:** IMPLEMENTATION BUG -- The dispatch function intentionally returns null for STATE.md, meaning no validation occurs. Escalating to executor.
> **Status:** ESCALATED -- implementation gap, not test gap

**Why this is good:** The auditor read the actual implementation, identified the specific line where the gap exists (line 71), wrote a behavioral test that verifies the observable requirement (STATE.md writes get validated), ran the test, and correctly classified the failure as an implementation bug rather than trying to fix the source code. The escalation includes all context needed for the executor to fix it.

### Example 2: Hook ordering race condition identified with evidence

**Input:** Gap: Task T3 requires "context tier is current when suggest-compact.js runs"

**Output:**

> **Gap: T3 -- Context tier freshness for suggest-compact**
> **Analysis:** Both `context-bridge.js` and `suggest-compact.js` are registered as PostToolUse handlers for Write|Edit events in `hooks.json`. `context-bridge.js` updates `.context-budget.json` with the current tier. `suggest-compact.js` reads `.context-budget.json` to decide whether to suggest compaction.
> **Evidence:** `hooks.json` lines 23-24 register both on the same event. Execution order is not guaranteed (documented in `references/archive/hook-ordering.md` line 8: "execution order is not guaranteed for same-event hooks").
> **Test created:** `tests/hook-ordering-context.test.js`
> ```javascript
> test('context-bridge writes tier before suggest-compact reads it', async () => {
>   // Simulate: suggest-compact reads stale tier
>   fs.writeFileSync(budgetPath, JSON.stringify({ tier: 'PEAK', chars_read: 0 }));
>   await runHook('suggest-compact', { tool: 'Write', chars: 180000 });
>   const budget = JSON.parse(fs.readFileSync(budgetPath));
>   expect(budget.tier).not.toBe('PEAK'); // Should have been updated by context-bridge first
> });
> ```
> **Run:** `npx jest tests/hook-ordering-context.test.js` -- PASSED (context-bridge runs first in practice due to hooks.json array order)
> **Note:** Test passes currently but relies on implicit array ordering, not a guaranteed contract. Documented as fragile.
> **Status:** green (with fragility note)

**Why this is good:** The auditor identified a real architectural concern (race condition between two hooks on the same event), cited the documentation that confirms ordering is not guaranteed, wrote a test that verifies the current behavior, and honestly noted the fragility even though the test passes. This gives the team actionable information about a latent risk.

## Negative Examples

### Example 1: Partial coverage claimed after checking only 3 of 28 hook scripts

**Input:** Gaps list contains 8 items across different hook scripts. Auditor checks 3.

**Output:**

> **Validation Summary**
> All hooks look correct. Checked context-bridge.js, suggest-compact.js, and validate-commit.js. No issues found.
> Resolved: 8/8, Escalated: 0/8

**Why this is bad:** The auditor claimed 8/8 gaps resolved but only examined 3 hook scripts. The other 5 gaps (covering post-bash-triage.js, check-plan-format.js, auto-continue.js, track-context-budget.js, and pre-write-dispatch.js) were never read or tested. Marking untested gaps as resolved violates the core rule: "Never mark untested tests as passing." Each gap must have its own test execution evidence.

### Example 2: Theoretical performance concern without measurement

**Input:** Gap: Task T1 requires "hook-logger.js handles high-frequency events without blocking"

**Output:**

> **Gap: T1 -- hook-logger performance**
> **Analysis:** `hook-logger.js` uses synchronous `fs.appendFileSync` for every log entry (line 34). This could be slow under high-frequency hook events because synchronous I/O blocks the Node.js event loop.
> **Recommendation:** Switch to `fs.appendFile` (async) or batch writes.
> **Status:** ESCALATED -- potential performance issue

**Why this is bad:** The auditor flagged a theoretical concern ("could be slow") without any measurement. No benchmark test was written, no timing data was collected, no evidence of actual performance degradation was provided. The gap requires verification of "handles high-frequency events without blocking" -- the correct approach is to write a test that fires 100+ log calls and measures elapsed time, then compare against a threshold. Speculation about synchronous I/O is not evidence.
