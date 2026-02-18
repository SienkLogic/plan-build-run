# Creating Skills

A step-by-step guide for adding new skills (slash commands) to Plan-Build-Run.

## What Is a Skill?

A skill is a markdown file (`SKILL.md`) that defines a slash command. When a user types `/pbr:yourskill`, Claude Code loads the SKILL.md as a prompt for the orchestrator. The skill tells the orchestrator what to do — read state, interact with the user, spawn agents, and update files.

## File Structure

```
plugins/pbr/
├── skills/
│   └── yourskill/
│       └── SKILL.md         # The skill definition
├── commands/
│   └── yourskill.md         # Command registration (routes to the skill)
```

## Step 1: Create the SKILL.md

Create `plugins/pbr/skills/yourskill/SKILL.md` with YAML frontmatter:

```yaml
---
name: yourskill
description: "One-line description shown in /pbr:help"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--flag]"
---
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill name (matches directory name) |
| `description` | Yes | Shown in help and command listings |
| `allowed-tools` | Yes | Comma-separated list of tools the orchestrator may use |
| `argument-hint` | No | Shown after the command name in help text |

### Common Tool Lists

- **Read-only skills** (status, help): `Read, Glob, Grep`
- **Interactive skills** (plan, review): `Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion`
- **Execution skills** (build, quick): `Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion`

Include `AskUserQuestion` if the skill has any user decision points (gate checks). See `skills/shared/gate-prompts.md` for reusable gate patterns.

## Step 2: Write the Skill Body

After the frontmatter, write the prompt that guides the orchestrator. Key sections:

```markdown
# /pbr:yourskill — Title

You are the orchestrator for `/pbr:yourskill`. [One sentence about what this skill does.]

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

## Prerequisites

[What must exist before this skill runs — STATE.md, PLAN.md, etc.]

## Workflow

[Step-by-step instructions for the orchestrator]

## Error Handling

Reference: `skills/shared/error-reporting.md` for the universal error handling rules.
```

### Using Shared Fragments

14 shared fragments live in `skills/shared/`. Reference them instead of duplicating content:

| Fragment | Purpose |
|----------|---------|
| `context-budget.md` | Orchestrator context limits |
| `state-loading.md` | How to read STATE.md |
| `state-update.md` | How to update STATE.md |
| `config-loading.md` | How to read config.json |
| `gate-prompts.md` | Reusable AskUserQuestion patterns |
| `phase-argument-parsing.md` | Parse `$ARGUMENTS` for phase numbers |
| `commit-planning-docs.md` | Commit .planning/ changes |
| `error-reporting.md` | Standardized error handling |
| `context-loader-task.md` | Loading context via Task() |
| `universal-anti-patterns.md` | Things the orchestrator must never do |
| `revision-loop.md` | Iterative revision pattern |
| `digest-select.md` | Multi-item selection pattern |
| `progress-display.md` | Progress bar display |
| `domain-probes.md` | Domain-specific research probes |

Reference syntax: `Reference: \`skills/shared/context-budget.md\` for the universal orchestrator rules.`

## Step 3: Register the Command

Create `plugins/pbr/commands/yourskill.md`:

```yaml
---
description: "Same description as SKILL.md"
---

This command is provided by the `dev:yourskill` skill.
```

## Step 4: Add Tests

Create `tests/yourskill.test.js` if the skill has associated hook scripts or logic. At minimum, the existing structural tests (`validate-plugin.test.js`, `skill-askuserquestion-audit.test.js`) will automatically pick up your new skill.

If your skill should have `AskUserQuestion` in `allowed-tools`, it will be validated by the audit test. If it intentionally should NOT have it, add the skill name to the `EXCLUDED_SKILLS` array in `tests/skill-askuserquestion-audit.test.js`.

## Step 5: Validate

```bash
npm run validate    # Checks plugin structure
npm test            # Runs all tests including structural audits
```

## Worked Example: A "stats" Skill

```yaml
---
name: stats
description: "Show project statistics — files, commits, agent spawns"
allowed-tools: Read, Bash, Glob, Grep
---

# /pbr:stats — Project Statistics

You are the orchestrator for `/pbr:stats`. Show the user key statistics about their project.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

## Workflow

1. Read `.planning/STATE.md` for current position
2. Count files in the project (exclude node_modules, .git)
3. Count commits with `git log --oneline | wc -l`
4. Read `.planning/logs/sessions.jsonl` for agent spawn history
5. Display results in a formatted table
```

## Tips

- Keep skills lean — delegate heavy work to agents via `Task()`
- The orchestrator should stay under 15-20% context usage
- Use `$ARGUMENTS` to access user-provided arguments after the command name
- Gate checks (user approval points) should use patterns from `gate-prompts.md`
- Test on all three platforms (Windows, macOS, Linux) — path handling matters
