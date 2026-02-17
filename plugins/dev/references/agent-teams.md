# Agent Teams Reference

Agent Teams enable parallel specialist perspectives for critical phases. Teams are off by default.

## Activation

- **Global**: Set `parallelization.use_teams: true` in `.planning/config.json`
- **Per-invocation**: Use `--teams` flag on `/dev:plan`, `/dev:review`, or `/dev:build --team`
- Per-invocation flag takes precedence over global config

## Planning Teams

When `/dev:plan <N> --teams` is invoked, three specialist agents run in parallel:

| Role | Agent | Focus | Output File |
|------|-------|-------|-------------|
| Architect | towline-planner | Structure, dependencies, wave ordering, file boundaries | `.planning/phases/{NN}/team/architect-PLAN.md` |
| Security Reviewer | towline-planner | Auth, input validation, secrets handling, permission checks | `.planning/phases/{NN}/team/security-PLAN.md` |
| Test Designer | towline-planner | Test strategy, coverage targets, edge cases, TDD candidates | `.planning/phases/{NN}/team/test-PLAN.md` |

All three use the `towline-planner` agent with different prompts. The orchestrator includes the role and focus in the Task() spawn prompt.

After all three complete, the synthesizer agent reads all team outputs and produces the final unified PLAN.md files.

## Review Teams

When `/dev:review <N>` runs with teams enabled, three review agents run in parallel:

| Role | Agent | Focus | Output File |
|------|-------|-------|-------------|
| Functional Reviewer | towline-verifier | Must-haves met, code correctness, completeness | `.planning/phases/{NN}/team/functional-VERIFY.md` |
| Security Auditor | towline-verifier | Vulnerabilities, auth bypass, injection, secrets exposure | `.planning/phases/{NN}/team/security-VERIFY.md` |
| Performance Analyst | towline-verifier | N+1 queries, memory leaks, bundle size, unnecessary re-renders | `.planning/phases/{NN}/team/performance-VERIFY.md` |

All three use the `towline-verifier` agent with different prompts. The synthesizer combines them into a unified VERIFICATION.md.

## File-Based Coordination

Team members write to separate files in a `team/` subdirectory. This avoids file conflicts:
```
.planning/phases/{NN}-{slug}/
  team/
    architect-PLAN.md
    security-PLAN.md
    test-PLAN.md
```

The synthesizer reads all files in `team/` and produces the final artifact. The `team/` directory is kept for audit purposes but is not read by subsequent skills.

## When to Use Teams

- **Recommended**: Security-critical phases, architectural phases, public API design
- **Not recommended**: Simple refactors, documentation, configuration changes
- **Cost consideration**: Teams triple the agent spawns. Use only when the additional perspectives justify the cost.
