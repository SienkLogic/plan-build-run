<!-- canonical: ../../pbr/references/model-profiles.md -->
# Model Profiles Reference

How Plan-Build-Run maps agents to models and how to configure model selection.

---

## Agent-to-Model Mapping

Each Plan-Build-Run agent has a default model specified in its agent definition frontmatter (`model:` field). These defaults are overridden by the `models` section of `config.json`.

### Default Agent Models

| Agent | Default Model | Rationale |
|-------|---------------|-----------|
| `researcher` | `sonnet` | Research requires strong reasoning for source evaluation and synthesis |
| `planner` | `inherit` | Planning is complex; inherits the session's primary model |
| `executor` | `inherit` | Execution needs the full capability of the session model |
| `verifier` | `sonnet` | Verification needs solid reasoning but not the heaviest model |
| `integration-checker` | `sonnet` | Cross-phase analysis requires strong pattern matching |
| `plan-checker` | `sonnet` | Plan quality analysis needs good analytical capability |
| `debugger` | `inherit` | Debugging is complex; inherits session model |
| `codebase-mapper` | `sonnet` | Codebase analysis requires thorough reasoning |
| `synthesizer` | `haiku` | Synthesis is mechanical combination; speed over depth |
| `general` | `inherit` | Lightweight utility; inherits session model |

The `inherit` value means the agent uses whatever model the parent session is running (typically the user's configured Claude model).

---

## Model Profile Presets

The `/pbr:config model-profile {preset}` command sets all agent models at once using a preset:

| Profile | Researcher | Planner | Executor | Verifier | Int-Checker | Debugger | Mapper | Synthesizer |
|---------|-----------|---------|----------|----------|-------------|----------|--------|-------------|
| `quality` | opus | opus | opus | opus | sonnet | opus | sonnet | sonnet |
| `balanced` | sonnet | inherit | inherit | sonnet | sonnet | inherit | sonnet | haiku |
| `budget` | haiku | haiku | haiku | haiku | haiku | haiku | haiku | haiku |
| `adaptive` | sonnet | sonnet | inherit | sonnet | haiku | inherit | haiku | haiku |

### Preset Descriptions

- **quality**: Maximum capability across all agents. Best results but highest token cost. Use for critical projects or complex architectures.
- **balanced**: The default preset. Front-loads intelligence in research and verification, inherits session model for planning and execution. Good general-purpose choice.
- **budget**: All agents use haiku. Fastest and cheapest, but reduced quality for complex reasoning tasks. Suitable for well-defined, mechanical work.
- **adaptive**: Front-loads intelligence in research and planning (where decisions matter most), uses lighter models for mechanical execution and verification. Good cost-quality tradeoff.

---

## Configuring Models

### Per-Agent Configuration

Set an individual agent's model via `/pbr:config`:

```
/pbr:config model executor sonnet
/pbr:config model verifier opus
```

Or edit `config.json` directly:

```json
{
  "models": {
    "researcher": "sonnet",
    "planner": "inherit",
    "executor": "inherit",
    "verifier": "sonnet",
    "integration_checker": "sonnet",
    "debugger": "inherit",
    "mapper": "sonnet",
    "synthesizer": "haiku"
  }
}
```

### Valid Model Values

| Value | Meaning |
|-------|---------|
| `sonnet` | Claude Sonnet (4.5/4.6) -- balanced speed and capability |
| `opus` | Claude Opus (4.6) -- highest capability, slower |
| `haiku` | Claude Haiku (4.5) -- fastest, lower capability |
| `inherit` | Use the session's primary model (whatever the user is running) |

Note: Claude Code 2.1.45+ supports Sonnet 4.6. Model values are abstract names — Claude Code resolves them to the latest available version.

---

## Model Selection in Skill Orchestration

Skills that spawn subagents use the `model` parameter in `Task()` calls. Some skills hardcode a lighter model for specific tasks:

- **Build skill**: Spawns inline verifiers with `model: "haiku"` for quick spot-checks
- **Build skill**: Spawns codebase mapper updates with `model: "haiku"` for incremental map refreshes
- **Plan skill**: Uses the configured `planner` model for main planning work

The `subagent_type` parameter automatically loads the agent definition, and the model from `config.json` takes precedence over the agent's default `model:` frontmatter field.
