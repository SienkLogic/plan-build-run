---
name: scan
description: "Analyze an existing codebase. Maps structure, architecture, conventions, and concerns."
allowed-tools: Read, Write, Bash, Glob, Grep, Task
---

# /dev:scan — Codebase Analysis

You are running the **scan** skill. Your job is to analyze an existing codebase and produce a comprehensive map of its structure, architecture, conventions, and concerns. This is the entry point for brownfield projects — codebases that already have code before Towline is introduced.

This skill **spawns 4 parallel Task(subagent_type: "dev:towline-codebase-mapper")** agents for analysis.

---

## Context Budget

Keep the orchestrator lean. Follow these rules:
- **Never** read agent definitions (agents/*.md) — subagent_type auto-loads them
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
  2. Refresh a specific area (tech, arch, quality, or concerns)
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

Before spawning agents, do a quick scan to identify what we're working with. This gives agents better context:

1. **Detect project type:**
   ```
   Look for:
   - package.json -> Node.js/JavaScript/TypeScript
   - requirements.txt / setup.py / pyproject.toml -> Python
   - CMakeLists.txt -> C/C++
   - go.mod -> Go
   - Cargo.toml -> Rust
   - pom.xml / build.gradle -> Java
   - *.sln / *.csproj -> .NET
   - Gemfile -> Ruby
   - composer.json -> PHP
   ```

2. **Detect project scale:**
   Use Glob patterns to count source files (exclude node_modules, venv, .git, build, dist).

   Scale categories:
   - Small: < 50 source files
   - Medium: 50-200 source files
   - Large: 200-1000 source files
   - Very large: 1000+ source files

3. **Detect key directories:**
   ```
   Look for:
   - src/, lib/, app/ -> source code
   - test/, tests/, __tests__/, spec/ -> tests
   - docs/ -> documentation
   - config/, .config/ -> configuration
   - scripts/ -> build/deploy scripts
   - public/, static/, assets/ -> static assets
   - migrations/ -> database migrations
   ```

4. **Read existing docs:**
   - README.md (if exists)
   - Any existing architecture docs
   - .env.example (to understand config shape)

5. Write a brief `.planning/codebase/RECON.md` with findings:

   ```markdown
   # Codebase Reconnaissance

   **Scanned:** {date}
   **Type:** {project type}
   **Scale:** {small/medium/large} ({file count} source files)
   **Root:** {working directory}

   ## Key Directories
   - {dir}: {purpose}

   ## Entry Points
   - {file}: {purpose}

   ## Quick Stats
   - Source files: {count}
   - Test files: {count}
   - Config files: {count}
   ```

### Step 3: Spawn Analysis Agents

Spawn **4 parallel** `Task(subagent_type: "dev:towline-codebase-mapper")` agents, each with a different focus area. All 4 should be spawned in a single response for maximum parallelism.

#### Agent 1: Technology Stack (`focus="tech"`)

```
You are towline-codebase-mapper with focus="tech".

Analyze the codebase technology stack and external integrations.

Reconnaissance: {paste RECON.md content}
Working directory: {cwd}

Instructions:

1. STACK.md -- Technology inventory
   - Languages and versions (from config files, shebang lines, etc.)
   - Frameworks and their versions
   - Build tools and configuration
   - Package manager and dependency count
   - Runtime requirements
   - Development tools (linters, formatters, type checkers)

2. INTEGRATIONS.md -- External connections
   - APIs consumed (look for HTTP clients, SDK imports, API keys)
   - Databases used (look for connection strings, ORM configs, migrations)
   - Third-party services (auth providers, payment, email, etc.)
   - Message queues, caches, file storage
   - CI/CD pipelines (GitHub Actions, Jenkins, etc.)
   - Deployment targets (Docker, Kubernetes, serverless, etc.)

Write both files to .planning/codebase/

Read `templates/codebase/STACK.md.tmpl` for the STACK.md output format.
Read `templates/codebase/INTEGRATIONS.md.tmpl` for the INTEGRATIONS.md output format.
Fill in all placeholder fields with data from your codebase analysis.
```

#### Agent 2: Architecture (`focus="arch"`)

```
You are towline-codebase-mapper with focus="arch".

Analyze the codebase architecture and structure.

Reconnaissance: {paste RECON.md content}
Working directory: {cwd}

Instructions:

1. ARCHITECTURE.md -- High-level architecture
   - Architecture style (monolith, microservices, serverless, MVC, etc.)
   - Layer structure (presentation, business logic, data access)
   - Module boundaries and how they communicate
   - Data flow through the system
   - Key abstractions and interfaces
   - State management approach
   - Error handling strategy
   - Authentication/authorization architecture

2. STRUCTURE.md -- Directory and file organization
   - Directory tree with annotations
   - File naming conventions
   - Module organization pattern
   - Entry points and their roles
   - Configuration file locations
   - Environment-specific files

Write both files to .planning/codebase/

Read `templates/codebase/ARCHITECTURE.md.tmpl` for the ARCHITECTURE.md output format.
Read `templates/codebase/STRUCTURE.md.tmpl` for the STRUCTURE.md output format.
Fill in all placeholder fields with data from your codebase analysis.
```

#### Agent 3: Code Quality (`focus="quality"`)

```
You are towline-codebase-mapper with focus="quality".

Analyze the codebase quality, conventions, and testing approach.

Reconnaissance: {paste RECON.md content}
Working directory: {cwd}

Instructions:

1. CONVENTIONS.md -- Coding standards in practice
   - Naming conventions (files, functions, variables, classes)
   - Code style (indentation, quotes, semicolons, etc.)
   - Import/export patterns
   - Comment style and documentation patterns
   - Error handling patterns
   - Logging patterns
   - Configuration patterns (env vars, config files, constants)

   IMPORTANT: Document what the codebase ACTUALLY does, not what it should do.
   Look at multiple files to identify the dominant pattern.

2. TESTING.md -- Test infrastructure and coverage
   - Test framework(s) used
   - Test file organization
   - Test types present (unit, integration, e2e)
   - Test coverage (rough estimate from test file count vs source file count)
   - Mocking patterns
   - Test data management
   - CI test configuration
   - Notable gaps in testing

Write both files to .planning/codebase/

Read `templates/codebase/CONVENTIONS.md.tmpl` for the CONVENTIONS.md output format.
Read `templates/codebase/TESTING.md.tmpl` for the TESTING.md output format.
Fill in all placeholder fields with data from your codebase analysis.
```

#### Agent 4: Concerns (`focus="concerns"`)

```
You are towline-codebase-mapper with focus="concerns".

Identify concerns, risks, and improvement opportunities in the codebase.

Reconnaissance: {paste RECON.md content}
Working directory: {cwd}

Instructions:

Write CONCERNS.md to .planning/codebase/

Analyze the codebase for:

1. Security concerns
   - Hardcoded secrets or credentials
   - Injection vulnerabilities
   - Insecure authentication patterns
   - Missing input validation
   - Outdated dependencies with known vulnerabilities

2. Technical debt
   - TODO/FIXME/HACK comments
   - Dead code (unused exports, unreachable branches)
   - Copy-pasted code (duplication)
   - Overly complex functions
   - Missing error handling
   - Inconsistent patterns

3. Scalability concerns
   - N+1 query patterns
   - Missing pagination
   - Unbounded data loading
   - Synchronous blocking operations
   - Missing caching opportunities

4. Maintainability concerns
   - Missing documentation
   - Complex inheritance hierarchies
   - Tight coupling between modules
   - Magic numbers/strings
   - Missing type safety

5. Operational concerns
   - Missing health checks
   - Insufficient logging
   - No monitoring hooks
   - Unclear deployment process

Read `templates/codebase/CONCERNS.md.tmpl` for the CONCERNS.md output format.
Fill in all placeholder fields with data from your codebase analysis.
```

### Step 4: Wait for Agents

All 4 agents run in parallel. Report progress as each completes:
```
Scanning codebase...
  [1/4] Technology stack... done
  [2/4] Architecture... done
  [3/4] Code quality... done
  [4/4] Concerns... done
```

### Step 5: Verify Output

After all agents complete, verify the expected files exist:

**Required files:**
- `.planning/codebase/RECON.md` (created in Step 2)
- `.planning/codebase/STACK.md` (Agent 1)
- `.planning/codebase/INTEGRATIONS.md` (Agent 1)
- `.planning/codebase/ARCHITECTURE.md` (Agent 2)
- `.planning/codebase/STRUCTURE.md` (Agent 2)
- `.planning/codebase/CONVENTIONS.md` (Agent 3)
- `.planning/codebase/TESTING.md` (Agent 3)
- `.planning/codebase/CONCERNS.md` (Agent 4)

For any missing files:
- Warn the user which file is missing
- Note which analysis agent failed
- Offer to re-run that specific agent

### Step 6: Present Summary

Read key findings from each file (frontmatter or first section) and display:

```
Codebase Scan Complete
======================

Use the branded stage banner from `references/ui-formatting.md`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► SCANNING CODEBASE
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

/dev:begin — start a Towline project for this codebase

───────────────────────────────────────────────────────────────

**Also available:**
- /dev:milestone new — create a milestone to address concerns

───────────────────────────────────────────────────────────────
```

### Step 7: Git Integration

If `.planning/config.json` exists and `planning.commit_docs: true`:

```bash
git add .planning/codebase/
git commit -m "docs(planning): map existing codebase"
```

If no config exists yet (scan before begin), ask user:
"Commit the codebase analysis? (y/n)"

---

## Scale Handling

### Small projects (< 50 files)
- Agents can be thorough -- read most files
- Output should be concise (don't pad)
- Concerns list may be short -- that's fine

### Medium projects (50-200 files)
- Agents should sample representative files
- Focus on entry points, configuration, and key modules
- Use Grep patterns to find conventions rather than reading every file

### Large projects (200-1000 files)
- Agents must be selective -- read key files only
- Use Glob and Grep extensively for pattern detection
- Focus on architecture and module boundaries
- Sample 3-5 files per module for conventions

### Very large projects (1000+ files)
- Warn user: "This is a large codebase. The scan will focus on high-level architecture and key modules."
- Agents should limit their file reads
- Architecture focus > file-level detail
- Consider suggesting scoping the scan to a subdirectory

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

### Scan before /dev:begin
- This is a valid and encouraged workflow
- Scan results become input for the begin skill
- Create `.planning/` and `.planning/codebase/` if needed
- Don't require config.json

---

## Anti-Patterns

1. **DO NOT** modify any source code -- scan is read-only analysis
2. **DO NOT** run the project (no `npm start`, `python app.py`, etc.) -- analyze statically
3. **DO NOT** install dependencies -- analyze package files, don't install
4. **DO NOT** generate concerns without evidence -- every concern needs a file reference
5. **DO NOT** ignore positive observations -- knowing what works well is valuable
6. **DO NOT** produce generic output -- every finding should be specific to THIS codebase
7. **DO NOT** scan node_modules, venv, .git, or build output directories
8. **DO NOT** read every file in large codebases -- sample and extrapolate
9. **DO NOT** skip the RECON step -- agents need baseline context
10. **DO NOT** combine agents -- the 4 agents must run in parallel with separate focuses
