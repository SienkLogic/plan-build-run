# Model Profiles Reference

How Plan-Build-Run maps agents to models and how to configure model selection.

---

## Session Model (Orchestrator)

The orchestrator is your main Claude Code session -- it reads skills, manages state, and routes work to agents. Its model is whatever you selected in Claude Code (not controlled by PBR's `config.json`).

**Cost impact:** The orchestrator accounts for roughly 40% of total session cost. Agents set to `inherit` (planner, executor, debugger, general in the `balanced` profile) also use this model. Switching your session from Opus to Sonnet reduces cost for both the orchestrator and all `inherit` agents.

**Recommendations:**

| Goal | Session Model | Config Adjustment |
|------|---------------|-------------------|
| Maximum quality | Opus | None needed -- `inherit` agents get Opus |
| Balanced cost/quality | Sonnet | None needed -- `inherit` agents get Sonnet, which handles most tasks well |
| Cheap orchestration, Opus agents | Sonnet | Set `planner: "opus"`, `executor: "opus"`, `debugger: "opus"` to override inherit |

Sonnet 4.6 handles orchestration tasks (state reading, routing decisions, context assembly) effectively. Reserve Opus for agents doing complex reasoning, architecture, or novel code generation.

---

## Agent-to-Model Mapping

Each Plan-Build-Run agent's model is controlled by `config.json models.*`. When no config entry exists for an agent, the agent inherits the session model.

The `model:` frontmatter field has been removed from PBR agent definitions — `config.json` is now the sole source of truth for agent model assignment.

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
| `audit` | `inherit` | Session log analysis inherits session model |
| `dev-sync` | `inherit` | Cross-plugin sync is mechanical; inherits session model |

The `inherit` value means the agent uses whatever model the parent session is running (typically the user's configured Claude model). Defaults listed above are the effective values from the `balanced` profile in `config.json`.

---

## Model Profile Presets

The `/pbr:settings model-profile {preset}` command sets all agent models at once using a preset:

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

### context_window_tokens per Profile

| Profile | context_window_tokens |
|---------|----------------------|
| `quality` | `1000000` |
| `balanced` | `200000` |
| `budget` | `200000` |
| `adaptive` | `200000` |

The `quality` profile targets Claude models with 1M context windows (e.g., Claude Opus with extended context). All other profiles default to 200000, matching Claude Sonnet and Haiku context windows. Adjust manually via `/pbr:settings` or by editing `config.json` if your model has a different context window size.

### 1M Context Feature Defaults per Profile

When using `/pbr:settings model-profile {preset}`, these feature defaults are also applied:

| Feature | quality | balanced | budget | adaptive |
|---------|---------|----------|--------|----------|
| `workflow.inline_execution` | `true` | `false` | `false` | `false` |
| `features.inline_verify` | `true` | `false` | `false` | `false` |
| `features.extended_context` | `true` | `false` | `false` | `false` |
| `workflow.phase_boundary_clear` | `"recommend"` | `"off"` | `"off"` | `"off"` |
| `workflow.autonomous` | `false` | `false` | `false` | `false` |
| `workflow.speculative_planning` | `false` | `false` | `false` | `false` |
| `workflow.phase_replay` | `false` | `false` | `false` | `false` |
| `planning.multi_phase` | `false` | `false` | `false` | `false` |
| `intel.enabled` | `false` | `false` | `false` | `false` |
| `intel.auto_update` | `false` | `false` | `false` | `false` |
| `intel.inject_on_start` | `false` | `false` | `false` | `false` |
| `context_ledger.enabled` | `true` | `false` | `false` | `false` |
| `context_ledger.stale_after_minutes` | `60` | `60` | `60` | `60` |
| `learnings.enabled` | `true` | `false` | `false` | `false` |
| `learnings.read_depth` | `5` | `3` | `3` | `3` |
| `context_budget.threshold_curve` | `"adaptive"` | `"linear"` | `"linear"` | `"linear"` |
| `verification.confidence_gate` | `false` | `false` | `false` | `false` |
| `verification.confidence_threshold` | `1.0` | `1.0` | `1.0` | `1.0` |
| `gates.checkpoint_auto_resolve` | `"none"` | `"none"` | `"none"` | `"none"` |

**Quality profile rationale:** Enables safe 1M-native features (learnings, inline execution, adaptive thresholds, context ledger, phase boundary recommendations). Keeps experimental features disabled (intel, autonomous, speculative planning, confidence gate, multi-phase planning) -- these require explicit opt-in via `/pbr:settings` or config.json.

---

## Configuring Models

### Per-Agent Configuration

Set an individual agent's model via `/pbr:settings`:

```
/pbr:settings model executor sonnet
/pbr:settings model verifier opus
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

## Custom Profiles

The `model_profiles` key in `config.json` lets you define named profiles beyond the four built-in presets. Each profile is a partial map of agent names to model strings — omitted agents fall back to the active profile defaults.

```json
{
  "model_profiles": {
    "my-profile": {
      "executor": "opus",
      "planner": "opus",
      "synthesizer": "sonnet"
    }
  }
}
```

Activate a custom profile with `/pbr:settings model-profile my-profile`. The profile merges with the `balanced` preset: any agent not listed in your custom profile uses its `balanced` default.

Partial profiles are allowed — you can override just the agents you care about. This is useful for temporarily upgrading a single agent without specifying the rest.

---

## Model Selection in Skill Orchestration

Skills that spawn subagents use the `model` parameter in `Task()` calls. Some skills hardcode a lighter model for specific tasks:

- **Build skill**: Spawns inline verifiers with `model: "haiku"` for quick spot-checks
- **Build skill**: Spawns codebase mapper updates with `model: "haiku"` for incremental map refreshes
- **Plan skill**: Uses the configured `planner` model for main planning work

The `subagent_type` parameter automatically loads the agent definition, and the model from `config.json` takes precedence over any agent-level model setting.
