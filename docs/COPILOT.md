# GitHub Copilot Integration

PBR can be installed for GitHub Copilot's coding agent. Copilot runs PBR in **degraded mode** — lightweight skills work fully, but advanced workflow skills that require subagent spawning are not available.

## Install

```bash
# Install to current project (.github/ directory)
npx @sienklogic/plan-build-run --copilot --local

# Install globally (~/.copilot/ directory)
npx @sienklogic/plan-build-run --copilot --global

# Preview what would be installed
npx @sienklogic/plan-build-run --copilot --local --dry-run

# Remove previously installed PBR files
npx @sienklogic/plan-build-run --copilot --local --clean
```

## What Gets Installed

```
.github/
├── copilot-instructions.md          # Bootstrap: tells Copilot where PBR resources are
├── agents/
│   └── pbr-*.agent.md               # 18 agent definitions
├── skills/
│   └── pbr-*/SKILL.md               # 46 skill prompts
├── commands/
│   └── *.md                         # 71 command registrations
├── references/
│   └── *.md                         # 31 reference documents
└── hooks/
    ├── hooks.json                   # Minimal preToolUse configuration
    └── scripts/
        ├── pbr-guard.sh             # Bash hook guard
        └── pbr-guard.ps1            # PowerShell hook guard
```

## Skill Availability

### Tier 1 — Fully Functional

These skills work without subagent spawning and are fully supported in Copilot:

| Skill | Description |
|-------|-------------|
| `pbr-status` | Show current project status and suggest next action |
| `pbr-todo` | Manage file-based persistent todos (add, list, complete) |
| `pbr-note` | Capture ideas and notes to `.planning/notes/` |
| `pbr-health` | Check planning directory integrity |
| `pbr-help` | Command reference and workflow guide |
| `pbr-progress` | Check project progress and route to next action |
| `pbr-config` | Configure PBR workflow settings |
| `pbr-explore` | Explore ideas and think through approaches |
| `pbr-stats` | Display project statistics |
| `pbr-fast` | Execute a trivial task inline and commit |
| `pbr-quick` | Execute an ad-hoc task with atomic commits |

### Tier 2 — Degraded

These skills normally delegate heavy work to subagents for context isolation. In Copilot they run inline, which means quality may degrade on large tasks:

| Skill | Limitation |
|-------|------------|
| `pbr-debug` | Runs in main context instead of isolated debug agent |
| `pbr-scan` | Codebase analysis without parallel mapper agents |

### Tier 3 — Not Available

These skills require `Task()` subagent spawning, which Copilot does not support:

| Skill | Why |
|-------|-----|
| `pbr-plan` | Spawns planner + researcher agents |
| `pbr-build` | Spawns parallel executor agents |
| `pbr-review` | Spawns verifier agent |
| `pbr-discuss` | Spawns researcher for gray-area decisions |
| `pbr-begin` | Spawns multiple research + planning agents |
| `pbr-autonomous` | Chains plan/build/review with subagents |
| `pbr-test` | Spawns nyquist-auditor agent |
| `pbr-validate-phase` | Spawns verification agents |

For full PBR workflow capabilities, use [Claude Code](https://claude.ai/code).

## Hook Support

Copilot's hook system is limited compared to Claude Code:

| Capability | Claude Code | Copilot |
|------------|------------|---------|
| PreToolUse blocking | 28 hook scripts | 1 guard script (preToolUse only) |
| PostToolUse feedback | Injects warnings/context | Output ignored |
| Lifecycle events | 17+ events | 6 events (5 logging-only) |
| Tool interception | 10+ tool types | 4 tools (bash, edit, view, create) |
| Result modification | No | No |
| Arg modification | No | No |

The installed `pbr-guard` hook provides:

- **Commit format validation** — blocks `git commit` with non-conventional messages
- **Dangerous command blocking** — blocks `rm -rf .planning`, `git reset --hard`, force-push to main/master, `git clean -fd`

## How It Works

The installer reads PBR's canonical source files from `plugins/pbr/` and applies transforms:

| Transform | What Changes |
|-----------|-------------|
| Agent rename | `executor.md` → `pbr-executor.agent.md` |
| Frontmatter strip | Removes `tools`, `memory`, `isolation`, `color`, `permissionMode` |
| Plugin root token | `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}` |
| Command prefix | `/pbr:plan` → `pbr-plan` |
| Terminology | `subagents` → `agents` (whole word) |

This is a **one-way install** — changes to the generated `.github/` files are overwritten on next install. Edit the canonical source in `plugins/pbr/` instead.

## Updating

Re-run the install command to update to the latest version:

```bash
npx @sienklogic/plan-build-run@latest --copilot --local
```

Or clean and reinstall:

```bash
npx @sienklogic/plan-build-run --copilot --local --clean
npx @sienklogic/plan-build-run --copilot --local
```

## Project State

PBR stores all project state in `.planning/` — this works identically across Claude Code and Copilot since it's just files on disk. You can start a project in Claude Code (with full workflow) and continue lightweight tasks in Copilot, or vice versa.

```
.planning/
├── STATE.md          # Current position
├── ROADMAP.md        # Phase structure
├── config.json       # Settings
├── phases/           # Per-phase plans and summaries
├── todos/            # Task tracking
└── notes/            # Project notes
```

## Limitations

1. **No subagent spawning** — Copilot has no `Task()` equivalent. PBR's core context-isolation architecture cannot work, which means Tier 3 skills are unavailable.
2. **No PostToolUse feedback** — Copilot ignores hook output for all events except `preToolUse` deny. PBR can't warn about plan format issues, state drift, or context budget.
3. **No context budget tracking** — No PreCompact/PostCompact events. PBR can't detect or warn about context exhaustion.
4. **Only 4 interceptable tools** — `bash`, `edit`, `view`, `create`. PBR hooks that intercept Glob, Grep, Task, or Read have no Copilot equivalent.

These limitations may be resolved as GitHub expands Copilot's extension capabilities.
