<!-- canonical: ../../pbr/references/deviation-rules.md -->
# Deviation Rules

When execution doesn't go exactly as planned, these 5 rules govern what the executor can do on its own versus what requires user approval.

---

## Rule 1: Bug Discovered

**Trigger**: Verify command fails due to a bug in the code just written.

**Action**: Auto-fix the bug, re-run verify. If it passes, commit as normal. Note the bug and fix in SUMMARY.md under "Deviations".

**Limit**: 3 fix attempts maximum. After 3 failures, STOP and return error with failing verify output.

**Approval needed**: No

---

## Rule 2: Missing Dependency

**Trigger**: Action or verify fails because a package/dependency is not installed.

**Action**: Auto-install the dependency using the project's package manager. Continue execution.

**Commit**: Include dependency installation in the task's commit (e.g., package.json, package-lock.json changes).

**Limit**: Only install dependencies directly referenced in the plan's `<action>` or clearly required by the code being written. Do NOT install "nice-to-have" packages.

**Approval needed**: No

---

## Rule 3: Critical Gap

**Trigger**: While implementing, a critical gap is noticed that would cause runtime errors — missing error handling, null checks, input validation for security.

**Action**: Add the minimal necessary code. Note it in SUMMARY.md under "Deviations".

**Limit**: This is for preventing crashes and security holes ONLY. Not for adding features, improving UX, or refactoring.

**Examples of valid critical gaps**:
- Missing null check that would cause runtime crash
- Unhandled promise rejection
- SQL injection vulnerability
- Missing input sanitization
- Missing error boundary

**Examples that are NOT critical gaps (use Rule 5 instead)**:
- Better error messages
- Input validation for UX (e.g., email format)
- Performance optimization
- Code organization improvements

**Approval needed**: No

---

## Rule 4: Architectural Change

**Trigger**: The plan's approach won't work as specified. The architecture needs to change. A fundamental assumption was wrong.

**Action**: STOP immediately. Return a checkpoint-style response describing:
- What the plan says to do
- Why it won't work
- What the alternative would be
- Which tasks are affected

**DO NOT** make architectural changes without approval. DO NOT try to "make it work" with hacks.

**Examples**:
- Plan says to use library X, but it doesn't support the required feature
- Plan assumes a REST API, but the service only has GraphQL
- Plan's database schema won't support the required queries
- Plan's authentication approach conflicts with the framework

**Approval needed**: YES — full stop, present to user

---

## Rule 5: Scope Creep

**Trigger**: While implementing, something is noticed that would be nice to have, could be improved, or is related but not in the plan.

**Action**: Log it in SUMMARY.md under "Deferred Ideas". DO NOT implement it. Continue with the plan as written.

**Examples**:
- "This could use caching" -> Deferred
- "The error messages could be better" -> Deferred
- "This should have pagination" -> Deferred
- "The existing code has a bug unrelated to this plan" -> Deferred (unless it blocks the plan)
- "This API should have rate limiting" -> Deferred
- "The UI could use loading states" -> Deferred

**Approval needed**: No (just log and continue)

---

## Decision Tree

```
Execution deviates from plan
  |
  ├─ Code bug? ──────────────── Rule 1: Auto-fix (3 attempts)
  |
  ├─ Missing package? ──────── Rule 2: Auto-install
  |
  ├─ Security/crash risk? ──── Rule 3: Minimal fix + note
  |
  ├─ Architecture wrong? ───── Rule 4: STOP + checkpoint
  |
  └─ Nice to have? ─────────── Rule 5: Log + continue
```
