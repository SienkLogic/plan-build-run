---
component: verifier
version: 1
last_calibrated: 2026-03-24
---

# Verifier Few-Shot Examples

## Positive Examples

### Example 1: Thorough multi-level artifact verification with real gap discovery

**Input:** Must-have artifact: `plugins/pbr/scripts/context-bridge.js: >50 lines`

**Output:**

> **L1 (Existence):** EXISTS -- `plugins/pbr/scripts/context-bridge.js` found, 187 lines.
> **L2 (Substantive):** SUBSTANTIVE -- No TODO/FIXME markers, 4 exported functions (`updateContextTier`, `getContextBudget`, `injectContextWarning`, `resetTierState`), non-trivial logic with config reads and threshold calculations.
> **L3 (Wired):** WIRED -- Imported by `plugins/pbr/hooks/hooks.json` as PostToolUse handler (line 47). Called by `post-write-dispatch.js` at line 23 via `require('./context-bridge')`. Arguments verified: receives `(toolName, data, planningDir)` matching the function signature.
> **Status: PASSED**

**Why this is good:** The verifier checked all three levels independently with specific evidence at each level -- file path, line count, exported symbols, import location, and argument verification. It did not stop at "file exists" but traced wiring through to actual usage with correct arguments.

### Example 2: Correct FAILED classification with grep evidence

**Input:** Must-have truth: `validate-commit.js rejects commits missing scope parentheses`

**Output:**

> **Method:** Ran `grep -n "scope" plugins/pbr/scripts/validate-commit.js` to locate scope validation logic.
> **Evidence:** Lines 34-41 show regex `/^(feat|fix|refactor|test|docs|chore|wip)\(/` which requires opening paren after type. However, no test for MISSING closing paren exists -- the regex accepts `feat(: description` (missing scope content and closing paren).
> **Ran:** `echo "feat(: test" | node plugins/pbr/scripts/validate-commit.js` -- exit code 0 (accepted).
> **Status: FAILED** -- Commit messages with empty scope `feat(: desc)` are accepted. The truth "rejects commits missing scope parentheses" does not hold for empty-scope edge case.

**Why this is good:** The verifier did not trust the code's intent -- it ran an actual test with an edge case input and reported the specific failure. Evidence includes the regex, the test command, the exit code, and why the truth does not hold.

## Negative Examples

### Example 1: Blanket pass with no per-criterion evidence

**Input:** Must-haves: 5 truths, 3 artifacts, 2 key_links from plan frontmatter.

**Output:**

> All must-haves have been verified. The implementation matches the plan requirements. Files exist and are properly connected. Status: PASSED.
> must_haves_checked: 10, must_haves_passed: 10

**Why this is bad:** No individual must-have is listed or checked. No file paths, no line numbers, no grep output, no level-by-level breakdown. The verifier restated the must-haves as passing without showing any evidence. This would miss stubs, orphaned exports, and broken wiring.

### Example 2: File existence check without substance or wiring verification

**Input:** Must-have artifact: `plugins/pbr/scripts/audit-checks/index.js: >100 lines`

**Output:**

> **L1 (Existence):** EXISTS -- File found at `plugins/pbr/scripts/audit-checks/index.js`, 142 lines.
> **Status: PASSED**

**Why this is bad:** The verifier stopped at Level 1. The file has 142 lines but could contain `// TODO: implement all checks` with stub functions returning empty objects. Level 2 (substantive) and Level 3 (wired) were skipped entirely. A file that exists but is never imported or contains only placeholder code should not pass.
