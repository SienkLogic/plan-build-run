# PBR Documentation

User-facing documentation for Plan-Build-Run, a Claude Code plugin for structured development workflows.

---

## Guides

| Document | Description |
|----------|-------------|
| [User Guide](USER-GUIDE.md) | Workflow diagrams, usage examples, troubleshooting |
| [PBR Style Guide](PBR-STYLE.md) | Commit format, scope conventions, naming rules |

## Reference

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | System overview, component architecture, data flow, design principles |
| [Features](FEATURES.md) | All PBR capabilities organized by category |
| [Commands](COMMANDS.md) | Complete command reference (70 commands across 44 skills) |
| [Agents](AGENTS.md) | All 17 agents with roles, models, and outputs |
| [Configuration](CONFIGURATION.md) | `config.json` schema: settings, features, models, gates |
| [CLI Tools](CLI-TOOLS.md) | `pbr-tools.js` subcommands for state and lifecycle management |

## Supplementary

| Document | Description |
|----------|-------------|
| [Context Monitor](context-monitor.md) | Context budget tracking and compaction |

---

## Quick Start

```bash
# Install the plugin
claude install plan-build-run

# Start a new project
/pbr:begin

# Or scan an existing codebase
/pbr:scan

# Check status anytime
/pbr:status

# Run the next logical step
/pbr:continue
```

## Key Concepts

- **Skills** -- Slash commands (`/pbr:*`) that orchestrate workflows
- **Agents** -- Subagents with fresh 200k context windows for heavy work
- **Hooks** -- Lifecycle scripts that enforce rules agents skip under load
- **Phases** -- Units of work tracked in ROADMAP.md
- **Plans** -- Executable task breakdowns within a phase
- **Must-haves** -- Verifiable success criteria checked by the verifier
- **Context rot** -- Quality degradation as the context window fills; PBR prevents this through subagent delegation
