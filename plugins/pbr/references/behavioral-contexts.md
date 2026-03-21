# Behavioral Contexts

PBR supports 3 behavioral context profiles that adjust agent behavior based on the current activity.

## Context Profiles

| Context | Risk Tolerance | Verbosity | Focus | Use When |
|---------|---------------|-----------|-------|----------|
| `dev` | Medium | Low | Shipping code | Building features, executing plans |
| `research` | Low | High | Thoroughness | Researching approaches, exploring options |
| `review` | Very Low | Medium | Accuracy | Verifying work, reviewing code |

## How Contexts Affect Agents

### `dev` Context (default during execute-phase)
- Executor: Focused, concise output, 3-attempt bug fix limit
- Deviations: Log and continue for minor issues
- Verification: Standard must_have checking

### `research` Context (default during plan-phase, research-phase)
- Researcher: Exhaustive source checking, S0-S6 hierarchy enforced
- Planner: Extra validation passes, dependency verification
- Output: Detailed reasoning, cite sources

### `review` Context (default during verify-work)
- Verifier: Strict must_have checking, severity-level reporting
- Integration checker: Full CRUD flow verification
- Output: Structured findings with severity levels

## Configuration

Set in `.planning/config.json`:
```json
{
  "behavioral_context": "auto"
}
```

Or override per-command via pbr-tools:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js resolve-context --raw
# Returns: {"context": "dev", "risk_tolerance": "medium", "verbosity": "low"}
```

## Automatic Context Selection

When `behavioral_context` is not set or set to `"auto"` (default):
- `/pbr:execute-phase` -> `dev`
- `/pbr:plan-phase` -> `research`
- `/pbr:research-phase` -> `research`
- `/pbr:verify-work` -> `review`
- `/pbr:quick` -> `dev`
- All others -> `dev`
