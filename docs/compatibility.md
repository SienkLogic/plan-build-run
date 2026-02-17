# Claude Code Compatibility Notes

Towline's minimum required version and notable upstream fixes that affect reliability.

## Minimum Version

**Claude Code 2.1.45+** (required)

Towline depends on features and bug fixes from this release:
- `spinnerTipsOverride` for custom spinner tips
- Subagent skill compaction fix (skills invoked by subagents no longer leak into main session context)
- Task tool crash fix for backgrounded agents
- Plugin commands/agents/hooks available immediately after installation (no restart required)

## Claude Code 2.1.45 — Key Fixes for Towline

### Skills no longer leak into main session after compaction

**Impact**: High — This was a major context pollution issue. When Towline subagents invoked skills, those skill prompts were being included in the orchestrator's compacted context, wasting tokens and degrading reasoning quality. Now fixed upstream.

### Task tool (backgrounded agents) no longer crash on completion

**Impact**: Medium — Affects Towline's parallel agent spawning in wave execution. Previously, background `Task()` calls could fail with a `ReferenceError` on completion. Now fixed.

### Plugin commands/agents/hooks available immediately

**Impact**: Low (onboarding) — Before this fix, users had to restart Claude Code after installing Towline for commands to become available. Now they work immediately.

### Agent Teams on Bedrock/Vertex/Foundry

**Impact**: Low — Improves reliability for Towline's `--team` mode when running on non-direct API providers.

### enabledPlugins from --add-dir directories

**Impact**: Low — Plugin discovery now works correctly for side-loaded plugins (e.g., `claude --plugin-dir .`).

## Model Support

| Model | Since Version | Notes |
|-------|--------------|-------|
| Sonnet 4.5 | 2.0.x | Default for most agents |
| Haiku 4.5 | 2.0.x | Used for synthesizer and budget profiles |
| Opus 4.6 | 2.1.x | Used for quality profile |
| Sonnet 4.6 | 2.1.45 | Available as `sonnet` — Claude Code resolves to latest |

## Feature Support

| Feature | Since Version | Towline Usage |
|---------|--------------|---------------|
| `spinnerTipsOverride` | 2.1.45 | Custom spinner tips via `spinner_tips` config |
| Plugin hooks | 1.0.x | All 10 hook event types |
| `subagent_type` | 1.0.x | Auto-loads agent definitions |
| Agent Teams | 2.1.x | Optional `--team` flag in build/review |
