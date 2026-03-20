# Verification Matrix

Which verification dimensions and gates run at each depth profile.

## Plan-Checker Dimensions by Depth

| Dimension | Quick | Standard | Comprehensive |
|-----------|-------|----------|---------------|
| D1: Requirement Coverage | Yes | Yes | Yes |
| D2: Task Completeness | Yes | Yes | Yes |
| D3: Dependency Correctness | Yes | Yes | Yes |
| D4: Key Links Planned | Yes | Yes | Yes |
| D5: Scope Sanity | Yes | Yes | Yes |
| D6: Must-Haves Derivation | Yes | Yes | Yes |
| D7: Context Compliance | Yes | Yes | Yes |
| D8: Nyquist Compliance | No | Yes | Yes |
| D9: Cross-Plan Data Contracts | No | Yes | Yes |
| **Total dimensions** | **7** | **9** | **9** |

## Verification Gates by Depth

| Gate | Quick | Standard | Comprehensive |
|------|-------|----------|---------------|
| Plan-checking (pre-build) | Advisory | Blocking | Blocking |
| Goal verification (post-build) | Advisory | Blocking | Blocking |
| Inline verify (per-task) | Off | Off | On |
| Requirements coverage | Advisory | Blocking | Blocking |

## Behavioral Notes

- **Quick**: Plan-checker runs 7 dimensions. Missing or failed `.plan-check.json` produces a warning, not a block. Goal verification runs but failures are advisory.
- **Standard**: Full 9-dimension plan-check. `.plan-check.json` must exist and pass before executor spawn. Goal verification failures block phase completion.
- **Comprehensive**: Same as standard plus inline_verify (planner self-validates before checker).
- **--audit flag**: Forces full 9-dimension checking regardless of depth profile.
