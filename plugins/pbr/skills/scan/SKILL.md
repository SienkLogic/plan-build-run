---
name: scan
description: "Analyze an existing codebase. Maps structure, architecture, conventions, and concerns."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "[--focus tech|arch|quality|concerns]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SCANNING CODEBASE                          ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:map-codebase — Codebase Analysis

You are running the **scan** skill. Your job is to analyze an existing codebase and produce a comprehensive map of its structure, architecture, conventions, and concerns. This is the entry point for brownfield projects — codebases that already have code before Plan-Build-Run is introduced.

This skill **spawns 4 parallel Task(subagent_type: "pbr:codebase-mapper")** agents for analysis.

---

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Never** analyze the codebase yourself — delegate ALL analysis to the 4 parallel codebase-mapper subagents
- **Minimize** reading mapper outputs — read only frontmatter or first 20 lines of each output document
- **Delegate** all file reading, pattern analysis, and architecture mapping to the codebase-mapper subagents

---

## Core Principle

**Understand before you change.** Scanning a codebase is about building a mental model of what exists. Every file produced by this skill becomes context that the planner and executor use to make informed decisions. Accuracy matters more than speed.

---

## Flow

### Step 1: Load Init Context

Run the CLI to get scan metadata:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js init map-codebase
```

Extract from init JSON: `mapper_model`, `commit_docs`, `codebase_dir`, `existing_maps`, `has_maps`, `codebase_dir_exists`, `intel_enabled`, `has_intel_dir`, `depth_profile`.

If the CLI fails, display a branded ERROR box: "Failed to load scan context. Ensure pbr-tools.js is available." and stop.

### Step 2: Check for Existing Analysis

Use `has_maps` from init context.

**If `has_maps` is true:**

Present to user via AskUserQuestion:

  question: "A codebase analysis already exists. What would you like to do?"
  header: "Scan"
  options:
    - label: "Refresh all"       description: "Delete existing and remap codebase"
    - label: "Refresh specific"  description: "Re-scan only one area (tech, arch, quality, or concerns)"
    - label: "Keep existing"     description: "Use existing codebase map as-is"

- If user chooses "Keep existing": display a summary of existing analysis and stop
- If user chooses "Refresh specific": ask which area, then spawn only that agent in Step 4
- If user chooses "Refresh all": proceed with full scan

**If `has_maps` is false:**
**CRITICAL: Create the codebase directory NOW. Do not skip this step.**

- Create `.planning/codebase/` directory if needed:
  ```bash
  mkdir -p .planning/codebase
  ```
- Also create `.planning/` if it doesn't exist (scan can be run before begin)
- Proceed with full scan

### Step 3: Resolve Mapper Configuration

Use `depth_profile` from init context to determine how many mappers to spawn and which focus areas.

**Default mappings by depth:**
- `quick`: 2 mappers — `tech` and `arch` only. Produces STACK.md, INTEGRATIONS.md, ARCHITECTURE.md, STRUCTURE.md.
- `standard`: 4 mappers — all areas. Full analysis.
- `comprehensive`: 4 mappers — all areas. Full analysis.

**Extended context override:** If `features.extended_context` is `true` in `.planning/config.json`, always spawn 4 mappers regardless of depth profile.

### Step 4: Spawn Analysis Agents

Display to the user:
```
◐ Spawning {mapper_count} codebase mapper(s) in parallel...
  → Technology stack analysis
  → Architecture patterns
  → Code quality assessment
  → Concerns & risks
```

(Only list the focus areas that will actually be spawned.)

Spawn `{mapper_count}` parallel `Task(subagent_type: "pbr:codebase-mapper")` agents, one for each focus area. All should be spawned in a single response for maximum parallelism.

For each agent, read `${CLAUDE_SKILL_DIR}/templates/mapper-prompt.md.tmpl` and fill in the placeholders:
- `{focus_area}`: one of `tech`, `arch`, `quality`, `concerns`
- `{project_path}`: the working directory
- `{output_path}`: `.planning/codebase/`

| Agent | Focus | Output Files | When |
|-------|-------|-------------|------|
| 1 | tech | STACK.md, INTEGRATIONS.md | Always |
| 2 | arch | ARCHITECTURE.md, STRUCTURE.md | Always |
| 3 | quality | CONVENTIONS.md, TESTING.md | standard + comprehensive |
| 4 | concerns | CONCERNS.md | standard + comprehensive |

### Step 5: Collect Results

As each agent completes, check the Task() output for the `## MAPPING COMPLETE` marker:

- If `## MAPPING COMPLETE` is present: display `✓ {focus_area} analysis complete`
- If the marker is missing: warn:
  ```
  ⚠ Codebase mapper ({focus_area}) did not report MAPPING COMPLETE.
  Output may be incomplete — check .planning/codebase/ for partial results.
  ```

### Step 6: Verify Output

After all agents complete, verify the expected files exist:

```bash
ls -la .planning/codebase/
wc -l .planning/codebase/*.md
```

**Verification checklist:**
- All expected documents exist (7 for standard/comprehensive, 4 for quick)
- No empty documents (each should have >20 lines)

For any missing files, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Missing analysis output: {filename}
Agent that failed: {focus_area} mapper

**To fix:** Re-run with `/pbr:map-codebase` and select "Refresh a specific area" → {focus_area}.
```

### Step 7: Secret Scan

**CRITICAL SECURITY CHECK:** Scan output files for accidentally leaked secrets before committing.

```bash
grep -E '(sk-[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]+|sk_test_[a-zA-Z0-9]+|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]+|AKIA[A-Z0-9]{16}|xox[baprs]-[a-zA-Z0-9-]+|-----BEGIN.*PRIVATE KEY|eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.)' .planning/codebase/*.md 2>/dev/null && SECRETS_FOUND=true || SECRETS_FOUND=false
```

**If secrets found:**
```
⚠ SECURITY ALERT: Potential secrets detected in codebase documents!

Found patterns that look like API keys or tokens in:
{show grep output}

This would expose credentials if committed.

Action required:
1. Review the flagged content above
2. If these are real secrets, they must be removed before committing
3. Reply "safe to proceed" if the flagged content is not actually sensitive
```

Wait for user confirmation before continuing.

**If no secrets found:** Continue to Step 8.

### Step 8: Present Summary

Read key findings from each file (first section or frontmatter) and display:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SCAN COMPLETE ✓                            ║
╚══════════════════════════════════════════════════════════════╝

Created .planning/codebase/:
- STACK.md ({N} lines) - Technologies and dependencies
- INTEGRATIONS.md ({N} lines) - External services and APIs
- ARCHITECTURE.md ({N} lines) - System design and patterns
- STRUCTURE.md ({N} lines) - Directory layout and organization
- CONVENTIONS.md ({N} lines) - Code style and patterns
- TESTING.md ({N} lines) - Test structure and practices
- CONCERNS.md ({N} lines) - Technical debt and issues
```

**Concerns section** (only display if concerns mapper was spawned AND CONCERNS.md exists with content):

```
Concerns: {critical} critical, {high} high, {medium} medium

Top concerns:
1. {most critical concern}
2. {second concern}
3. {third concern}
```

### Step 9: Seed Intel System

If `intel_enabled` is true from init context:

Display:
```
Seeding intel system from scan results...
```

Spawn a `Task(subagent_type: "pbr:intel-updater")` with prompt:

```
Seed the intel system from fresh codebase scan results.

Read these files and extract structured intelligence:
- .planning/codebase/STACK.md → update .planning/intel/stack.json
- .planning/codebase/ARCHITECTURE.md → update .planning/intel/arch.md
- .planning/codebase/INTEGRATIONS.md → update .planning/intel/deps.json
- .planning/codebase/STRUCTURE.md → update .planning/intel/files.json

For each intel file:
1. Read the codebase analysis document
2. Extract structured data (dependencies, file graph, API endpoints, architecture patterns)
3. Write/update the intel JSON/MD file

Update .planning/intel/.last-refresh.json with current timestamp and source: "scan".
```

When the intel agent completes, display: `✓ Intel system seeded from scan results`

If `intel_enabled` is false: skip silently.

### Step 10: Git Integration

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

If `commit_docs` is true from init context:

```bash
git add .planning/codebase/
git commit -m "docs(planning): map existing codebase"
```

If no config exists yet (scan before begin):
Use AskUserQuestion (pattern: yes-no):
  question: "Commit the codebase analysis to git?"
  header: "Commit?"
  options:
    - label: "Yes"  description: "Stage and commit .planning/codebase/ files"
    - label: "No"   description: "Skip commit — files are saved but not committed"
- If "Yes": run `git add .planning/codebase/ && git commit -m "docs(planning): map existing codebase"`
- If "No": skip commit

### Step 11: Next Steps

```



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Start a project** — use the scan results to plan your work

`/pbr:new-project`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:intel` — query codebase intelligence
- `/pbr:new-milestone` — create a milestone to address concerns
- `/pbr:progress` — see project status


```

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

### Scan before /pbr:new-project
- This is a valid and encouraged workflow
- Scan results become input for the begin skill
- Create `.planning/` and `.planning/codebase/` if needed
- Don't require config.json

---

## Anti-Patterns

Additionally for this skill:

1. **DO NOT** modify any source code — scan is read-only analysis
2. **DO NOT** run the project (no `npm start`, `python app.py`, etc.) — analyze statically
3. **DO NOT** install dependencies — analyze package files, don't install
4. **DO NOT** generate concerns without evidence — every concern needs a file reference
5. **DO NOT** ignore positive observations — knowing what works well is valuable
6. **DO NOT** produce generic output — every finding should be specific to THIS codebase
7. **DO NOT** scan node_modules, venv, .git, or build output directories
8. **DO NOT** read every file in large codebases — sample and extrapolate
9. **DO NOT** combine agents — the agents must run in parallel with separate focuses
10. **DO NOT** skip the secret scan — leaked credentials in committed docs are a security incident
