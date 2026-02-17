# Model Selection Reference

Towline uses adaptive model selection to balance cost and capability.

## How It Works

1. The planner annotates each task with `complexity="simple|medium|complex"`
2. The build skill maps complexity to a model via `config.models.complexity_map`
3. The executor agent is spawned with the selected model

## Default Mapping

| Complexity | Model | Rationale |
|-----------|-------|-----------|
| simple | haiku | Fast, cheap — sufficient for mechanical changes |
| medium | sonnet | Good balance for standard feature work |
| complex | inherit | Uses session model — typically Opus for critical work |

## Override Mechanisms

1. **Per-task override**: Add `model="sonnet"` attribute to task XML in PLAN.md
2. **Config override**: Set `models.complexity_map` in config.json to change defaults
3. **Agent-level override**: Set `models.executor` in config.json to force a single model for all executor spawns (disables adaptive selection)

## Heuristics

The planner uses these signals to determine complexity:
- File count and types
- Task name keywords
- Dependency count
- Whether the task introduces new patterns vs. follows established ones
