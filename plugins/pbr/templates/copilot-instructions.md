# Plan-Build-Run (PBR)

PBR is a structured development workflow plugin. It manages project state, planning, and task tracking through file-based artifacts in `.planning/`.

## PBR Resources

| Resource | Location |
|----------|----------|
| Skills (slash commands) | `.github/skills/pbr-*/` |
| Custom agents | `.github/agents/pbr-*.agent.md` |
| Reference docs | `.github/references/` |
| Project state | `.planning/` |

## Project State (`.planning/`)

```
.planning/
  STATE.md              # Current project position and status
  ROADMAP.md            # Phase structure and goals
  config.json           # Workflow settings
  phases/{NN}-{slug}/   # Phase-specific plans and summaries
    PLAN.md             # Execution plan for this phase
    SUMMARY.md          # Build results after execution
  todos/
    pending/            # Open tasks (YAML frontmatter + markdown)
    done/               # Completed tasks
  notes/                # Project notes and ideas
```

Read `STATE.md` first to understand what phase the project is in and what happened recently.

## Available Skills

These PBR skills work without subagent spawning:

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
| `pbr-stats` | Display project statistics (phases, plans, git metrics) |
| `pbr-fast` | Execute a trivial task inline and commit |
| `pbr-quick` | Execute an ad-hoc task with atomic commits |

Advanced PBR skills (`pbr-plan`, `pbr-build`, `pbr-review`, `pbr-discuss`, `pbr-begin`, `pbr-autonomous`) require subagent spawning via `Task()`, which Copilot does not currently support. For the full PBR workflow, use Claude Code.

## Commit Format

All commits must follow conventional commit format:

```
{type}({scope}): {description}
```

**Valid types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `wip`, `revert`, `perf`, `ci`, `build`

**Scopes** should be descriptive component names (e.g., `auth`, `api`, `hooks`, `dashboard`).

Examples:
- `feat(auth): add OAuth2 login flow`
- `fix(api): handle null response from upstream`
- `docs(readme): update installation instructions`
