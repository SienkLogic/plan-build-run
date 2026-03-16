# Reading Verification Results

Reference card for interpreting VERIFICATION.md files produced by the verifier agent.

## Overall Status

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `passed` | All must-haves verified at all levels | Phase complete — proceed to next phase |
| `gaps_found` | One or more must-haves failed | Gap closure needed — run `/pbr:verify-work N --auto-fix` or fix manually |
| `human_needed` | Automated checks pass but items require manual verification | User must verify listed items, then re-run |

Priority: `gaps_found` > `human_needed` > `passed`. Any single failure forces `gaps_found`.

## Must-Have Categories

| Category | What It Checks | Example |
|----------|---------------|---------|
| **Truths** | Observable conditions — can this behavior be observed? | "Login redirects to dashboard" |
| **Artifacts** | Files/exports that must exist, be substantive, and not be stubs | "src/auth/middleware.ts" |
| **Key Links** | Connections wired between components | "Auth middleware applied to /api routes" |

## Verification Levels (Artifacts)

| Level | Check | Pass | Fail |
|-------|-------|------|------|
| L1 — Existence | File exists on disk | `EXISTS` | `MISSING` |
| L2 — Substantive | Not a stub or placeholder | `SUBSTANTIVE` | `STUB` / `PARTIAL` |
| L3 — Wired | Imported and used by other code | `WIRED` | `IMPORTED-UNUSED` / `ORPHANED` |
| L4 — Functional | Produces correct results when run | `FUNCTIONAL` | `RUNTIME_ERROR` / `LOGIC_ERROR` |

L4 is optional — only applied when automated tests or build commands exist. Items passing L1-L3 without L4 show `PASSED (L3 only)`.

## Truth Statuses

| Status | Meaning |
|--------|---------|
| `VERIFIED` | Truth holds, with evidence |
| `FAILED` | Truth does not hold |
| `PARTIAL` | Truth partially holds |
| `HUMAN_NEEDED` | Cannot verify programmatically |

## Key Link Statuses

| Status | Meaning |
|--------|---------|
| `WIRED` | Correct function called with correct arguments |
| `ARGS_WRONG` | Correct function called but arguments are incorrect or missing |
| `IMPORTED-UNUSED` | Symbol imported but never called |
| `ORPHANED` | No import exists |

## Gap Analysis

Each gap in the `gaps` frontmatter array contains:

- **must_have** — which must-have failed
- **level** — which verification level failed (existence, substantive, wired, functional)
- **evidence** — what the verifier found
- **recommendation** — suggested fix action

### Gap Annotations (Re-verification)

| Annotation | Meaning |
|------------|---------|
| `[PREVIOUSLY KNOWN]` | Gap existed in prior verification run |
| `[NEW]` | Gap appeared for the first time |
| `[REGRESSION]` | Previously passing item now fails — high priority |

## Acting on Results

| Result | Action |
|--------|--------|
| All passed | Run `/pbr:verify-work N` to complete UAT, then advance |
| Gaps found | Run `/pbr:verify-work N --auto-fix` for automated diagnosis and fix plans |
| Human needed | Verify listed items manually, then re-run verification |
| Override false positive | Use the override flow in `/pbr:verify-work` to accept specific gaps |
| Persistent gaps (3+ attempts) | Escalation options: accept gaps, re-plan, debug, or retry |

## Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall result: passed, gaps_found, human_needed |
| `checked_at` | ISO date | When verification ran |
| `attempt` | integer | Verification attempt number (increments on re-verification) |
| `must_haves_checked` | integer | Total must-haves evaluated |
| `must_haves_passed` | integer | Must-haves that passed all levels |
| `must_haves_failed` | integer | Must-haves that failed at any level |
| `gaps` | array | List of gap objects (must_have, level, evidence, recommendation) |
| `overrides` | array | Must-haves accepted as false positives by user |
| `satisfied` | array | REQ-IDs satisfied by this phase |
| `unsatisfied` | array | REQ-IDs not satisfied |
| `is_re_verification` | boolean | Whether this is a re-verification run |
