---
name: scan
description: "Analyze an existing codebase. Maps structure, architecture, conventions, and concerns."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► SCANNING CODEBASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

# /pbr:scan — Codebase Analysis

You are running the **scan** skill. Your job is to analyze an existing codebase and produce a comprehensive map of its structure, architecture, conventions, and concerns. This is the entry point for brownfield projects — codebases that already have code before Plan-Build-Run is introduced.

This skill **spawns 4 parallel Task(subagent_type: "pbr:codebase-mapper")** agents for analysis.

---

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Never** analyze the codebase yourself — delegate ALL analysis to the 4 parallel codebase-mapper subagents
- **Minimize** reading mapper outputs — read only frontmatter or first 20 lines of each output document
- **Delegate** all file reading, pattern analysis, and architecture mapping to the codebase-mapper subagents

---

## Core Principle

**Understand before you change.** Scanning a codebase is about building a mental model of what exists. Every file produced by this skill becomes context that the planner and executor use to make informed decisions. Accuracy matters more than speed.

---

## Flow

### Step 1: Check for Existing Analysis

Check if `.planning/codebase/` directory exists:

**If it exists and has files:**
- Present to user via AskUserQuestion:
  ```
  A codebase analysis already exists (from {date based on file modification}).

  Files found:
  - {list of .md files in the directory}

  Options:
  1. Refresh the full analysis (overwrites existing)
  2. Refresh a specific area (available areas depend on depth profile: quick mode only offers tech/arch)
  3. Keep existing analysis
  ```
- If user chooses "Keep": display a summary of existing analysis and stop
- If user chooses "Refresh specific": only spawn that agent (Step 3)
- If user chooses "Refresh all": proceed with full scan

**If it doesn't exist:**
- Create `.planning/codebase/` directory
- Also create `.planning/` if it doesn't exist (scan can be run before begin)
- Proceed with full scan

### Step 2: Initial Reconnaissance

Reference: `skills/shared/context-loader-task.md` (Scan Reconnaissance variation) for the underlying pattern.

Before spawning agents, do a quick scan to identify what we're working with. This gives agents better context.

1. **Detect project type** — check for language-specific config files (package.json, requirements.txt, go.mod, Cargo.toml, etc.)
2. **Detect project scale** — count source files (exclude node_modules, venv, .git, build, dist). Categories: Small (<50), Medium (50-200), Large (200-1000), Very Large (1000+)
3. **Detect key directories** — identify src, test, docs, config, scripts, public, migrations directories
4. **Read existing docs** — README.md, architecture docs, .env.example
5. **Write `.planning/codebase/RECON.md`** with project type, scale, key directories, entry points, and quick stats

Refer to the "Reconnaissance Detection Reference" section of `skills/scan/templates/mapper-prompt.md.tmpl` for the full detection checklists.

### Step 3: Spawn Analysis Agents

**Resolve mapper configuration:** Before spawning, resolve the depth profile:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth
```

Read `profile["scan.mapper_count"]` and `profile["scan.mapper_areas"]` to determine how many mappers to spawn and which focus areas to cover.

**Default mappings by depth:**
- `quick` (budget): 2 mappers -- `tech` and `arch` only. Produces STACK.md, INTEGRATIONS.md, ARCHITECTURE.md, STRUCTURE.md. Skips quality and concerns analysis.
- `standard` (balanced): 4 mappers -- all areas. Full analysis.
- `comprehensive` (thorough): 4 mappers -- all areas. Full analysis.

Display to the user:
```
◐ Spawning {mapper_count} codebase mapper(s) in parallel...
  → Technology stack analysis
  → Architecture patterns
  → Code quality assessment
  → Concerns & risks
```

(Only list the focus areas that will actually be spawned based on the depth profile.)

Spawn `{mapper_count}` parallel `Task(subagent_type: "pbr:codebase-mapper")` agents, one for each area in `scan.mapper_areas`. All should be spawned in a single response for maximum parallelism.

For each agent, read `skills/scan/templates/mapper-prompt.md.tmpl` and fill in the placeholders:
- `{focus_area}`: one of `tech`, `arch`, `quality`, `concerns`
- `{project_path}`: the working directory
- `{recon_data}`: contents of RECON.md
- `{scale}`: detected scale from Step 2
- `{output_path}`: `.planning/codebase/`

| Agent | Focus | Output Files | When |
|-------|-------|-------------|------|
| 1 | tech | STACK.md, INTEGRATIONS.md | Always |
| 2 | arch | ARCHITECTURE.md, STRUCTURE.md | Always |
| 3 | quality | CONVENTIONS.md, TESTING.md | standard + comprehensive |
| 4 | concerns | CONCERNS.md | standard + comprehensive |

### Step 4: Wait for Agents

All agents run in parallel. As each completes, display:
```
✓ Technology stack analysis complete
✓ Architecture patterns complete
✓ Code quality assessment complete
✓ Concerns & risks complete
```

(Only display lines for the focus areas that were actually spawned.)

### Step 5: Verify Output

After all agents complete, verify the expected files exist:

**Required files (always):**
- `.planning/codebase/RECON.md` (created in Step 2)
- `.planning/codebase/STACK.md` (tech mapper)
- `.planning/codebase/INTEGRATIONS.md` (tech mapper)
- `.planning/codebase/ARCHITECTURE.md` (arch mapper)
- `.planning/codebase/STRUCTURE.md` (arch mapper)

**Required files (standard + comprehensive only):**
- `.planning/codebase/CONVENTIONS.md` (quality mapper)
- `.planning/codebase/TESTING.md` (quality mapper)
- `.planning/codebase/CONCERNS.md` (concerns mapper)

Check only the files that correspond to the mapper areas that were actually spawned.

For any missing files, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Missing analysis output: {filename}
Agent that failed: {focus_area} mapper

**To fix:** Re-run with `/pbr:scan` and select "Refresh a specific area" → {focus_area}.
```

### Step 6: Present Summary

Read key findings from each file (frontmatter or first section) and display using the branded stage banner from `references/ui-formatting.md`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► SCAN COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project: {type} ({scale})
Stack: {primary language} + {framework}
Architecture: {style}

Key Stats:
- {file count} source files, {test count} test files
- {dependency count} dependencies
- {integration count} external integrations

Concerns: {critical} critical, {high} high, {medium} medium

Top concerns:
1. {most critical concern}
2. {second concern}
3. {third concern}

Full analysis: .planning/codebase/
```

Then use the "Next Up" routing block:
```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Start a project** — use the scan results to plan your work

`/pbr:begin`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/pbr:milestone new` — create a milestone to address concerns
- `/pbr:status` — see project status

───────────────────────────────────────────────────────────────
```

### Step 7: Git Integration

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

If `.planning/config.json` exists and `planning.commit_docs: true`:

```bash
git add .planning/codebase/
git commit -m "docs(planning): map existing codebase"
```

If no config exists yet (scan before begin), use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
  question: "Commit the codebase analysis to git?"
  header: "Commit?"
  options:
    - label: "Yes"  description: "Stage and commit .planning/codebase/ files"
    - label: "No"   description: "Skip commit — files are saved but not committed"
- If "Yes": run `git add .planning/codebase/ && git commit -m "docs(planning): map existing codebase"`
- If "No" or "Other": skip commit

---

## Edge Cases

### Monorepo with multiple projects
- Detect by multiple package.json, separate src directories, workspace config
- Ask user via AskUserQuestion: "This looks like a monorepo. Scan the whole repo or a specific project?"
- If specific: scope all agents to that subdirectory
- If whole: note the monorepo structure in ARCHITECTURE.md

### Empty or near-empty codebase
- If fewer than 5 source files: "This codebase is very small. A scan may not be necessary."
- Still allow it if user wants
- Output will be minimal

### No source code (config-only repo, docs repo)
- Detect: no recognized source file extensions
- Adapt: focus on documentation quality, config structure
- Skip code quality analysis

### Codebase has existing analysis
- Check for architectural docs, ADRs, design docs
- Reference them in the scan output
- Don't contradict existing docs without strong evidence

### Binary files, large assets
- Skip binary files in analysis
- Note their existence in STRUCTURE.md
- Flag large committed binaries as a concern

### Scan before /pbr:begin
- This is a valid and encouraged workflow
- Scan results become input for the begin skill
- Create `.planning/` and `.planning/codebase/` if needed
- Don't require config.json

---

## Anti-Patterns

Reference: `skills/shared/universal-anti-patterns.md` for rules that apply to ALL skills.

Additionally for this skill:

1. **DO NOT** modify any source code — scan is read-only analysis
2. **DO NOT** run the project (no `npm start`, `python app.py`, etc.) — analyze statically
3. **DO NOT** install dependencies — analyze package files, don't install
4. **DO NOT** generate concerns without evidence — every concern needs a file reference
5. **DO NOT** ignore positive observations — knowing what works well is valuable
6. **DO NOT** produce generic output — every finding should be specific to THIS codebase
7. **DO NOT** scan node_modules, venv, .git, or build output directories
8. **DO NOT** read every file in large codebases — sample and extrapolate
9. **DO NOT** skip the RECON step — agents need baseline context
10. **DO NOT** combine agents — the 4 agents must run in parallel with separate focuses
