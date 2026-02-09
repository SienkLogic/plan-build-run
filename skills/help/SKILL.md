---
name: help
description: "Command reference and workflow guide for Towline."
allowed-tools: Read
---

# /dev:help — Towline Command Reference

Display the following reference to the user:

---

## Towline Commands

### Core Workflow (the main loop)

| Command | Description | Cost |
|---------|-------------|------|
| `/dev:begin` | Start a new project. Deep questioning, research, requirements, roadmap. | High (4-6 agents) |
| `/dev:plan <N>` | Plan a phase. Research, create plans, verify before building. | Medium (2-3 agents) |
| `/dev:build <N>` | Build a phase. Execute plans in parallel waves, verify results. | High (2-4 agents) |
| `/dev:review <N>` | Review what was built. Automated verification + walkthrough with you. | Low (1 agent) |

### Planning & Discovery

| Command | Description |
|---------|-------------|
| `/dev:explore [topic]` | Explore ideas, think through approaches. No phase number needed. |
| `/dev:discuss <N>` | Talk through a phase before planning. Captures decisions. |
| `/dev:plan <N> --assumptions` | Surface Claude's assumptions before planning. Zero cost. |
| `/dev:plan <N> --skip-research` | Plan without research phase. Faster. |
| `/dev:plan <N> --gaps` | Create gap-closure plans from verification failures. |
| `/dev:plan add` | Append a new phase to the roadmap. |
| `/dev:plan insert <N>` | Insert a phase using decimal numbering. |
| `/dev:plan remove <N>` | Remove a future phase and renumber. |

### Execution

| Command | Description |
|---------|-------------|
| `/dev:build <N>` | Execute all plans in a phase. |
| `/dev:build <N> --gaps-only` | Execute only gap-closure plans. |
| `/dev:build <N> --team` | Use Agent Teams for complex inter-agent coordination. |
| `/dev:quick` | Quick ad-hoc task with atomic commit. Low cost. |
| `/dev:continue` | Execute the next logical step automatically. No prompts. |

### Verification & Debugging

| Command | Description |
|---------|-------------|
| `/dev:review <N>` | Verify phase + conversational UAT. |
| `/dev:review <N> --auto-fix` | Auto-diagnose and fix verification failures. |
| `/dev:debug` | Systematic debugging with hypothesis testing. |
| `/dev:scan` | Analyze existing codebase (brownfield). |

### Session Management

| Command | Description |
|---------|-------------|
| `/dev:status` | Where am I? Shows progress and suggests next action. |
| `/dev:health` | Check planning directory integrity. Find and fix corrupted state. |
| `/dev:pause` | Save session state for later. |
| `/dev:resume` | Pick up where you left off. |

### Project Management

| Command | Description |
|---------|-------------|
| `/dev:milestone new` | Start a new milestone cycle. |
| `/dev:milestone complete` | Archive completed milestone. |
| `/dev:milestone audit` | Verify milestone completion. |
| `/dev:milestone gaps` | Create phases to close audit gaps. |
| `/dev:todo add\|list\|done` | Persistent file-based todos. |
| `/dev:config` | Configure workflow settings. |

## Typical Workflow

```
/dev:begin              ← Start project, define requirements, create roadmap
/dev:discuss 1          ← (optional) Talk through phase details
/dev:plan 1             ← Plan the first phase
/dev:build 1            ← Build it
/dev:review 1           ← Verify it works
/dev:plan 2             ← Plan the next phase
...                     ← Repeat plan → build → review
/dev:milestone complete ← Archive when done
```

## Quick Reference

- **Context strategy**: `aggressive` (delegate everything) | `balanced` | `minimal` (run inline)
- **Depth**: `quick` (skip research, ~50% cheaper) | `standard` | `comprehensive` (~2x cost)
- **State files**: `.planning/STATE.md` (position), `.planning/ROADMAP.md` (phases), `.planning/config.json` (settings)
- **Configure**: `/dev:config` to change depth, models, gates, parallelization
- **Tip**: Use `/dev:quick` for creative/visual work where structured planning adds overhead without benefit.
- **PR hygiene**: When creating PRs from a Towline project, `.planning/` commits can be filtered using phase branching (`git.branching_strategy: phase`) which squash-merges code-only changes to main.
- **Seeds**: `/dev:explore` can create seed files (`.planning/seeds/`) with trigger conditions. Seeds auto-inject into planning when their trigger phase is reached.

## Getting Help

- GitHub Issues: https://github.com/SienkLogic/towline/issues
- README: https://github.com/SienkLogic/towline
