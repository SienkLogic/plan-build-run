# Plan-Build-Run for Codex CLI

Plan-Build-Run (PBR) is a structured development workflow plugin for Codex CLI that prevents
quality degradation on complex projects. It enforces a disciplined Plan → Build → Review cycle
using file-based state tracking in a `.planning/` directory — ensuring that every meaningful
change is planned before it's coded, committed atomically, and verified against concrete
success criteria.

---

## Installation

### 1. Copy skills to your project

Copy (or symlink) the `skills/` directory into your project's agent skills folder:

```bash
# Copy
cp -r plugins/codex-pbr/skills/ /path/to/your-project/.agents/skills/

# Or symlink (for active development)
ln -s /path/to/plan-build-run/plugins/codex-pbr/skills /path/to/your-project/.agents/skills
```

### 2. Copy AGENTS.md to your project root

```bash
cp plugins/codex-pbr/AGENTS.md /path/to/your-project/AGENTS.md
```

Codex reads `AGENTS.md` from the repository root automatically. This file teaches Codex
the PBR workflow rules, file formats, and enforcement gates.

### 3. (Optional) Copy sample config

```bash
cp plugins/codex-pbr/.codex/config.toml /path/to/your-project/.codex/config.toml
```

Edit the config to customize model selection per agent role and sandbox permissions.
All settings are commented out by default — uncomment only what you need.

---

## Skill Reference

Invoke skills using `$pbr-{name}` syntax in your Codex session.

| Skill | Command | Description |
|-------|---------|-------------|
| begin | `$pbr-begin` | Onboard PBR to a new or existing project |
| plan | `$pbr-plan` | Plan the next phase with must-haves and tasks |
| build | `$pbr-build` | Execute the current PLAN.md with atomic commits |
| review | `$pbr-review` | Verify a completed build against plan criteria |
| status | `$pbr-status` | Show current workflow position and phase state |
| quick | `$pbr-quick` | Run a lightweight task outside the full cycle |
| continue | `$pbr-continue` | Resume from a checkpoint or interrupted session |
| pause | `$pbr-pause` | Pause with context preservation to .continue-here.md |
| resume | `$pbr-resume` | Resume a previously paused session |
| debug | `$pbr-debug` | Start or continue a hypothesis-driven debug session |
| explore | `$pbr-explore` | Research a domain, library, or problem space |
| discuss | `$pbr-discuss` | Think through a design decision interactively |
| do | `$pbr-do` | Execute a one-off instruction under PBR rules |
| scan | `$pbr-scan` | Audit the codebase for issues and tech debt |
| health | `$pbr-health` | Check overall project health and workflow hygiene |
| milestone | `$pbr-milestone` | Manage versioned milestone releases |
| todo | `$pbr-todo` | Manage the cross-session task backlog |
| note | `$pbr-note` | Capture a decision, observation, or idea |
| import | `$pbr-import` | Import existing work into PBR phase structure |
| config | `$pbr-config` | View or update workflow configuration |
| setup | `$pbr-setup` | Configure or reconfigure PBR for this project |
| audit | `$pbr-audit` | Analyze Codex sessions for workflow compliance |
| help | `$pbr-help` | Show available skills and usage |
| statusline | `$pbr-statusline` | Output a compact one-line status summary |
| undo | `$pbr-undo` | Roll back the last plan or build step |

---

## File Structure Notes

### Auto-generated files

The following are generated from the main `plugins/pbr/` source and should not be edited
manually. Re-run the generator script to update them:

- `skills/` — all 25 skill prompts
- `agents/` — all 11 agent definitions
- `references/` — all reference documents
- `templates/` — all EJS-style output templates
- `commands/` — command registration files

To regenerate:

```bash
node scripts/generate-derivatives.js codex
```

### Manual files

These files cannot be auto-generated and must be maintained by hand:

| File | Purpose |
|------|---------|
| `AGENTS.md` | PBR workflow guide read by Codex at session start |
| `.codex/config.toml` | Sample Codex config with PBR agent profiles |
| `README.md` | This file |

---

## More Information

- Main PBR repository: [plan-build-run](https://github.com/SienkLogic/plan-build-run)
- Codex CLI documentation: [openai/codex](https://github.com/openai/codex)
- Claude Code plugin (`plugins/pbr/`) — the canonical source for all skills and agents
- Cursor plugin (`plugins/cursor-pbr/`) — Cursor IDE derivative
- Copilot plugin (`plugins/copilot-pbr/`) — GitHub Copilot derivative
