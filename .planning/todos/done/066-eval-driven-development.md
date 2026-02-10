---
title: "Explore eval-driven development (EDD) concepts for verification"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: verification
---

## Goal

Investigate incorporating pass@k and pass^k metrics into Towline's verification system for measuring reliability.

## Research Findings

### Background: pass@k and pass^k

- **pass@k** ("at least 1 of k succeeds"): Measures capability. If you run a verification 5 times and it passes at least once, the system *can* do the thing. Useful for capability discovery and frontier testing.
- **pass^k** ("all k must succeed"): Measures consistency. If you run a verification 5 times and all 5 pass, the system *reliably* does the thing. Useful for production quality gates.

### How Towline's Verifier Works Today

The verifier runs **once** per phase verification. It performs a 10-step goal-backward analysis:
1. Reads the plan's must-haves (truths, artifacts, key_links)
2. Checks each against the real codebase (file existence, content inspection, wiring)
3. Produces a VERIFICATION.md with pass/fail per criterion
4. Reports an overall pass/fail with gap analysis

This is effectively pass@1 / pass^1 — a single verification run with a single verdict.

### Applying pass^k to Towline

**Theoretical benefit**: LLM-based verification is inherently non-deterministic. The same verifier prompt with the same codebase state could produce different results across runs. A pass^3 requirement (all 3 runs must agree on pass) would catch cases where verification "passes" due to LLM reasoning variance rather than genuine goal achievement.

**Practical assessment**:

1. **Cost**: Running the verifier 3x triples the cost of the verification gate. For a standard phase with 2-3 plans, that's 6-9 verifier agent spawns instead of 2-3. At ~$0.50-1.00 per verifier run (Sonnet), this adds $1-3 per phase.

2. **Value signal**: Towline's verifier already uses evidence-based verification (file paths, grep output, test results). This is closer to deterministic testing than pure LLM reasoning. The variance between runs is low for well-structured must-haves.

3. **Where variance actually matters**: Variance is highest for subjective criteria ("code quality is good", "architecture is clean"). Towline's must-haves are designed to be objectively verifiable (file exists, function exports X, test passes). This already mitigates the consistency problem.

4. **Implementation complexity**: Would require changes to the review skill orchestrator (run verifier N times, compare results, report consistency score) and the VERIFICATION.md template (add multi-run metadata).

### Applying pass@k for Capability

Less relevant to Towline's use case. pass@k is useful when testing whether a system CAN do something new — Towline's verifier checks whether a build DID produce the expected result. The build already happened; the question is whether it succeeded, not whether it's capable.

## Recommendation: DEFER

**Verdict**: The concept has merit but the cost/complexity ratio doesn't justify adoption today.

**Reasoning**:
- Towline's evidence-based verification (concrete file checks, test execution) already reduces LLM variance significantly
- The 3x cost increase per phase is non-trivial for users running many phases
- The value would be highest for subjective verification criteria, but Towline deliberately avoids those
- If verification flakiness becomes a reported issue in practice, this can be added later

**If reconsidered later**, the minimal implementation would be:
1. Add `verification_runs: 3` to config.json gates section
2. Modify the review skill to spawn the verifier N times
3. Compare VERIFICATION.md outputs for agreement
4. Add a "consistency: 3/3" line to the verification report
5. Only flag inconsistencies — don't block on them initially

## Acceptance Criteria

- [x] Research complete with recommendation (adopt/defer/reject) — DEFER recommended
- [x] If adopted: metrics integrated into VERIFICATION.md template — N/A (deferred)
