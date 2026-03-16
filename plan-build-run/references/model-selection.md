# Runtime Model Selection

Models are resolved at runtime through a priority chain. The highest-priority source that provides a value wins.

## Resolution Chain (highest to lowest)

| Priority | Source | When Used |
|----------|--------|-----------|
| 1 | `--model <value>` flag | User passes flag to `/pbr:execute-phase` or `/pbr:plan-phase` |
| 2 | Task `model="..."` attribute | Planner specifies per-task model in PLAN.md |
| 3 | `config.models.executor` | Project-level override in `.planning/config.json` |
| 4 | Task `complexity` attribute | Adaptive selection via `config.models.complexity_map` |
| 5 | `config.model_overrides.{agent}` | Per-agent override in config.json |
| 6 | Profile table lookup | `config.model_profile` (quality/balanced/budget) |
| 7 | Default | `sonnet` |

## Complexity-Based Selection

When no explicit model is set, task complexity drives selection:

| Complexity | Default Model | Override Key |
|-----------|---------------|--------------|
| `simple` | haiku | `config.models.complexity_map.simple` |
| `medium` | sonnet | `config.models.complexity_map.medium` |
| `complex` | inherit | `config.models.complexity_map.complex` |

If a plan has multiple tasks, the build skill uses the most capable model among them.

## What "inherit" Means

`inherit` tells the Task() spawn to use whatever model the current session is running. This avoids hardcoding a specific model version (e.g., `claude-sonnet-4-20250514`) that may be blocked or deprecated. The session model is determined by the user's Claude Code configuration.

## Per-Agent Assignment

Set in `.planning/config.json`:

```json
{
  "model_profile": "balanced",
  "model_overrides": {
    "pbr-executor": "opus",
    "pbr-verifier": "haiku"
  }
}
```

Overrides take precedence over profile table lookups. See `references/model-profiles.md` for the full profile table.

## Valid Model Values

`sonnet`, `opus`, `haiku`, `inherit`

The `--model` flag accepts the same values. Invalid values produce an error listing valid options.
