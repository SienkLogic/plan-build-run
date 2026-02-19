<!-- canonical: ../../pbr/references/reading-verification.md -->
# Reading Verification Reports

A user-friendly guide to understanding verification results. For agent-facing patterns, see `verification-patterns.md`.

---

## What Verification Checks

After building a phase, Plan-Build-Run runs automated verification to check whether the code actually delivers what was planned. It checks every "must-have" from the plan through three layers:

### Layer 1: Existence

**Question**: Does the file/function/route exist at all?

This is the most basic check. If the plan said "create `src/auth.ts`" — does that file exist on disk? If it said "add a `/login` route" — can we find it in the codebase?

**Common failures**: File was planned but never created, renamed to a different path, or deleted by a later task.

### Layer 2: Substantiveness

**Question**: Is the code real, or just a stub/placeholder?

A file can exist but contain nothing useful — an empty function, a `throw new Error('Not implemented')`, or a component that just renders its own name. This layer catches those cases.

**Common failures**: Function body is empty, returns hardcoded test data, or only has a TODO comment.

### Layer 3: Wiring

**Question**: Are the pieces connected to each other?

Code can exist and be real, but if nothing imports it or calls it, it's dead code. This layer checks that modules are imported where needed, middleware is applied to routes, and components are rendered in the right places.

**Common failures**: Module created but never imported, route handler exists but not registered in the router, component built but not used in any page.

---

## Reading the Verification Report

A `VERIFICATION.md` file looks like this:

```
Status: passed (or gaps_found)
Must-haves checked: 8
Passed: 7
Gaps: 1
```

### When status is "passed"

All must-haves passed all three layers. The phase is complete and you can move on.

### When status is "gaps_found"

One or more must-haves failed verification. Each gap includes:

- **Must-have**: What was expected (from the plan)
- **Failed layer**: Which check failed (existence, substantiveness, or wiring)
- **Evidence**: The specific command output or file content that shows the failure
- **Suggested fix**: What to do about it

---

## Common Gap Types and What They Mean

### "File not found"
**Layer**: Existence
**Meaning**: A planned file was never created or was created at a different path.
**Fix**: Usually a simple oversight — the executor may have created it with a slightly different name. Check the phase directory for similar files.

### "Function is a stub"
**Layer**: Substantiveness
**Meaning**: The file exists but the implementation is incomplete. Common indicators: empty function bodies, `TODO` comments, placeholder return values.
**Fix**: The executor may have run out of context before finishing. Re-running the build usually resolves this.

### "Module not imported"
**Layer**: Wiring
**Meaning**: The code was written correctly but nothing uses it. The import statement is missing from the consuming file.
**Fix**: Usually a one-line fix — add the import statement to the right file.

### "Test has no assertions"
**Layer**: Substantiveness
**Meaning**: A test file exists but doesn't actually test anything — empty `it()` blocks or `expect(true).toBe(true)`.
**Fix**: Real test assertions need to be written. This usually happens when TDD mode is off and the executor generates placeholder tests.

### "Route not registered"
**Layer**: Wiring
**Meaning**: A route handler function was created but never mounted on the Express/Fastify/etc. router.
**Fix**: Add the route registration (usually `app.use()` or `router.get()`) to the main app file.

---

## How to Close Gaps

You have several options:

### Option 1: Re-run the build (most common)
```
/pbr:build <N>
```
The executor will detect what's already complete and only fix what's missing.

### Option 2: Create a gap-closure plan
```
/pbr:plan <N> --gaps
```
This creates a focused plan that targets only the specific gaps found during verification.

### Option 3: Manual fix
For small gaps (like a missing import), you can fix the code yourself and then re-run verification:
```
/pbr:review <N>
```

### Option 4: Override (for false positives)
If verification flagged something that's actually correct (e.g., a function intentionally returns an empty array), you can override the gap during review. The override is recorded in the verification report.

---

## Understanding Verification Attempts

The verification report tracks `attempt` count. If a phase has been verified multiple times:

- **Attempt 1**: Normal first verification
- **Attempt 2**: Gaps were found and fixed, re-verifying
- **Attempt 3+**: Escalation — Plan-Build-Run will offer additional options like accepting with gaps, switching to debug mode, or re-planning the phase

Multiple attempts don't mean something is wrong — complex phases often need a round of gap-closure before passing.
