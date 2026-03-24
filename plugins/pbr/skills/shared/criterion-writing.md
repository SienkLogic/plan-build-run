## Criterion Writing Guidance

> Loaded by: planner agent, plan-checker agent

Must-have criteria steer executor behavior. Wording that is vague or subjective produces vague implementations. Every criterion should be verifiable by a shell command returning 0/non-0.

### Vague-to-Concrete Examples

**Bad:** "User authentication should work properly"
**Good:** "POST /api/auth/login returns 200 with {token} on valid credentials and 401 on invalid"

**Bad:** "Error handling should be robust"
**Good:** "Every async function in src/api/ has a try-catch that logs to structured logger and returns appropriate HTTP status"

**Bad:** "The UI should be responsive"
**Good:** "All pages pass Lighthouse accessibility audit at mobile viewport (375px)"

**Bad:** "Code should be well-structured"
**Good:** "No file exceeds 300 lines; no function exceeds 40 lines; all exports have JSDoc"

**Bad:** "The system should be performant"
**Good:** "API endpoints respond in <200ms at p95 under 100 concurrent requests"

**Bad:** "Security should be handled properly"
**Good:** "All user input sanitized via DOMPurify before render; no raw SQL queries outside query builder"

### Vague Pattern Reference

| Pattern | Problem | Fix |
|---------|---------|-----|
| "should be good/nice/clean/proper" | Subjective quality | Add observable threshold |
| "properly handles/manages/processes" | Undefined "properly" | Specify behavior for each case |
| "clean code" | Aesthetic judgment | Measurable constraint (line count, lint rules) |
| "well-tested/structured/organized" | No coverage target | Numeric threshold or structural rule |
| "responsive" (no px) | No viewport threshold | Specify exact breakpoints |
| "performant" (no number) | No baseline | Add latency/throughput target |
| "robust" (no mechanism) | No resilience spec | Name retry/fallback/timeout strategy |
| "secure" (no mechanism) | Too broad | Name specific sanitization/auth mechanism |

### Self-Check Before Committing Criteria

For each must-have truth, ask:

1. Can I write a `grep`, `test`, or `curl` command that returns 0 when this is true?
2. Would two different executors produce observably similar results from this wording?
3. Does this describe a user-observable outcome, not an implementation aesthetic?

If any answer is "no", rewrite the criterion with a specific threshold or observable.

### Why This Matters

Vague criteria create a feedback loop:
- Planner writes "should work properly"
- Executor interprets loosely, implements minimal path
- Verifier cannot objectively evaluate "properly"
- Review flags gaps, triggering rework

Concrete criteria break this loop by giving executor and verifier the same objective target.
