---
name: begin
description: "Start a new project. Deep questioning, research, requirements, and roadmap."
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:begin — Project Initialization

You are the orchestrator for `/pbr:begin`. This skill initializes a new Plan-Build-Run project through deep questioning, optional research, requirements scoping, and roadmap generation. Your job is to stay lean — delegate heavy work to Task() subagents and keep the user's main context window clean.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Minimize** reading subagent output — read only summaries, not full research docs
- **Delegate** all analysis work to subagents — the orchestrator routes, it doesn't analyze

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► STARTING PROJECT                           ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Prerequisites

- Working directory should be the project root
- No existing `.planning/` directory (or user confirms overwrite)

---

## Orchestration Flow

Execute these steps in order. Each step specifies whether it runs inline (in your context) or is delegated to a subagent.

---

### Step 1: Detect Brownfield (inline)

> **Cross-platform note**: Use the Glob tool (not Bash `ls` or `find`) for all file and directory discovery. Bash file commands fail on Windows due to path separator issues.

Check if the current directory has existing code:

```
1. Use Glob to check directory contents (e.g., pattern "*" at project root)
2. Look for indicators of existing code:
   - package.json, requirements.txt, CMakeLists.txt, go.mod, Cargo.toml
   - src/, lib/, app/ directories
   - .git/ directory with commits
3. Use Glob to check if .planning/ already exists (e.g., pattern ".planning/*")
```

**If existing code found:**
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "This looks like an existing codebase. Run /pbr:scan to analyze what's here first?"
  options:
    - label: "Yes, scan"   description: "Run /pbr:scan first to analyze existing code"
    - label: "No, begin"   description: "Proceed with /pbr:begin on top of existing code"
- If user selects "Yes, scan": suggest `/pbr:scan` and stop
- If user selects "No, begin": proceed to Step 2

**If `.planning/` already exists:**
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "A .planning/ directory already exists. This will overwrite it. Continue?"
  options:
    - label: "Yes"  description: "Overwrite existing planning directory"
    - label: "No"   description: "Cancel — keep existing planning"
- If user selects "No": **STOP IMMEDIATELY. Do not ask again. Do not proceed to Step 2. End the skill with this message:**
  ```
  Keeping existing .planning/ directory. Use `/pbr:status` to see current project state, or `/pbr:plan` to continue planning.
  ```
  **Do NOT re-prompt the same question or any other question. The skill is finished.**
- If user selects "Yes": proceed (existing directory will be overwritten during state initialization)

---

### Step 2: Deep Questioning (inline)

**Reference**: Read `references/questioning.md` for technique details.

Have a natural conversation to understand the user's vision. Do NOT present a form or checklist. Instead, have a flowing conversation that covers these areas organically:

**Required context to gather:**

1. **What they want to build** — The core product/feature/system
2. **Problem being solved** — Why does this need to exist? Who is it for?
3. **Success criteria** — How will they know it works? What does "done" look like?
4. **Existing constraints** — Technology choices already made, hosting, budget, timeline, team size
5. **Key decisions already made** — Framework, language, architecture preferences
6. **Edge cases and concerns** — What worries them? What's the hardest part?

**Conversation approach:**
- Start broad: "What are you building?"
- Go deeper on each answer: "What does that mean exactly?" "Show me an example."
- Surface assumptions: "Why do you assume that?" "Have you considered X?"
- Find edges: "What happens when...?" "What about...?"
- Reveal motivation: "Why does that matter?"
- Avoid leading questions — let the user define their vision

**Keep going until you have:**
- A clear, concrete understanding of what they want to build
- At least 3 specific success criteria
- Known constraints and decisions
- A sense of complexity and scope

**Anti-patterns:**
- DO NOT present a bulleted checklist and ask them to fill it in
- DO NOT ask all questions at once — have a conversation
- DO NOT assume technologies — let them tell you
- DO NOT rush — this is the foundation for everything that follows

---

### Step 3: Workflow Preferences (inline)

After understanding the project, configure the Plan-Build-Run workflow. Use AskUserQuestion for each preference below. Present them sequentially with conversational bridging (e.g., "Great. Next...") to keep the flow natural.

**3a. Mode:**
Use the **toggle-confirm** pattern from `skills/shared/gate-prompts.md`:
  question: "How do you want to work?"
  header: "Mode"
  options:
    - label: "Interactive"  description: "Pause at key gates for your approval (default)"
    - label: "Autonomous"   description: "Auto-proceed, only stop for critical decisions"
- `interactive` (default) — confirm at gates (roadmap, plans, transitions)
- `autonomous` — auto-proceed, only stop for critical decisions

**3b. Depth:**
Use the **depth-select** pattern from `skills/shared/gate-prompts.md`:
  question: "How thorough should planning be?"
- `quick` — 3-5 phases, skip research, ~50% cheaper
- `standard` (default) — 5-8 phases, includes research
- `comprehensive` — 8-12 phases, full deep research, ~2x cost

**3c. Parallelization:**
Use the **toggle-confirm** pattern from `skills/shared/gate-prompts.md`:
  question: "Run multiple agents in parallel when plans are independent?"
  header: "Parallel"
  options:
    - label: "Enable"   description: "Parallel execution of independent plans (default)"
    - label: "Disable"  description: "Sequential execution only"
- `enabled` (default) — parallel execution of independent plans
- `disabled` — sequential execution

**3d. Git Branching:**
Use the **git-strategy-select** pattern from `skills/shared/gate-prompts.md`:
  question: "Git branching strategy?"
- `none` (default) — commit to current branch
- `phase` — create branch per phase
- `milestone` — create branch per milestone

**3e. Commit Planning Docs:**
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "Should planning documents (.planning/ directory) be committed to git?"
  options:
    - label: "Yes"  description: "Commit planning docs (default)"
    - label: "No"   description: "Add .planning/ to .gitignore"
- `yes` (default) — commit planning docs
- `no` — add .planning/ to .gitignore

**After gathering preferences:**

**CRITICAL: You MUST create the .planning/ directory and write config.json NOW. Do not proceed without this.**

1. Read the config template from `skills/begin/templates/config.json.tmpl`
2. Apply the user's choices to the template
3. Create `.planning/` directory
4. Write `.planning/config.json` with the user's preferences

**IMPORTANT**: This step MUST happen BEFORE research (Step 5) because depth controls how many researchers to spawn.

**CRITICAL: Write .active-skill NOW.** Write the text "begin" to `.planning/.active-skill` using the Write tool. Verify the file exists before proceeding.

---

### Step 4: Research Decision (inline)

Based on the depth setting from Step 3, determine the research approach:

**Depth-to-Discovery mapping:**

| Depth | Discovery Level | Researchers | Topics |
|-------|----------------|-------------|--------|
| quick | Level 0 | 0 | Skip research entirely |
| standard | Level 1 | 2 | STACK.md, FEATURES.md |
| standard + brownfield | Level 2 | 2-3 | STACK.md, FEATURES.md, + codebase mapping |
| comprehensive | Level 3 | 4 | STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md |

**If depth is `quick`:**
- Skip to Step 7 (Requirements Scoping)
- Tell user: "Skipping research phase (depth: quick). Moving straight to requirements."

**If depth is `standard` or `comprehensive`:**
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "I'd like to research the technology landscape before planning. This helps create better plans. Proceed with research?"
  options:
    - label: "Yes"  description: "Run research agents (recommended for standard/comprehensive)"
    - label: "No"   description: "Skip research, move straight to requirements"
- If user selects "No": skip to Step 7
- If user selects "Yes": proceed to Step 5

---

### Step 5: Research (delegated to subagents)

Spawn parallel Task() subagents for research. Each researcher writes to `.planning/research/`.

**CRITICAL: Create .planning/research/ directory NOW before spawning researchers. Do NOT skip this step.**

**For each research topic, spawn a Task():**

```
Task({
  subagent_type: "pbr:researcher",
  prompt: <see researcher prompt template below>
})
```

**NOTE**: The `pbr:researcher` subagent type auto-loads the agent definition from `agents/researcher.md`. Do NOT inline the agent definition — it wastes main context.

**Path resolution**: Before constructing any agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Researcher Prompt Template

For each researcher, construct the prompt by reading the template and filling in placeholders:

Read `skills/begin/templates/researcher-prompt.md.tmpl` for the prompt structure.

**Placeholders to fill:**
- `{project name from questioning}` — project name gathered in Step 2
- `{2-3 sentence description from questioning}` — project description from Step 2
- `{any locked technology choices}` — technology constraints from Step 2
- `{budget, timeline, skill level, etc.}` — user constraints from Step 2
- `{topic}` — the research topic being assigned (e.g., "Technology Stack Analysis")
- `{TOPIC}` — the output filename (e.g., STACK, FEATURES, ARCHITECTURE, PITFALLS)
- `{topic-specific questions}` — see topic-specific questions below

**Topic-specific questions:**

**STACK.md** (Level 1+):
- What is the standard technology stack for this type of project?
- What are the current recommended versions?
- What are the key dependencies and their compatibility?
- What build tools and development workflow is standard?

**FEATURES.md** (Level 1+):
- How are similar features typically implemented in this stack?
- What libraries/packages are commonly used for each feature area?
- What are standard patterns for the key features described?
- What third-party integrations are typically needed?

**ARCHITECTURE.md** (Level 3 only):
- What is the recommended architecture for this type of project?
- How should the codebase be organized?
- What are the standard patterns for data flow, state management, etc.?
- How should components communicate?

**PITFALLS.md** (Level 3 only):
- What commonly goes wrong with this type of project?
- What are the most common mistakes developers make?
- What performance issues are typical?
- What security concerns exist?

**Parallelization:**
- Spawn ALL researchers in parallel (multiple Task() calls in one response)
- Use `run_in_background: true` for each researcher
- Before spawning, display to the user: `◐ Spawning {N} researchers in parallel...`
- While waiting, display progress to the user:
  - After spawning: list of topics being researched
  - Periodically (every ~30s): check `TaskOutput` with `block: false` for each agent and report status
  - When each completes: "✓ {topic} researcher complete ({duration})"
  - When all complete: "All {N} researchers finished. Proceeding to synthesis."
- Wait for all to complete before proceeding

---

### Step 6: Synthesis (delegated to subagent)

After all researchers complete, display to the user: `◐ Spawning synthesizer...`

Spawn a synthesis agent:

```
Task({
  subagent_type: "pbr:synthesizer",
  prompt: <synthesis prompt>
})
```

**NOTE**: The `pbr:synthesizer` subagent type auto-loads the agent definition. Do NOT inline it. The agent definition specifies `model: sonnet` — do not override it.

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it.

#### Synthesis Prompt Template

Read `skills/begin/templates/synthesis-prompt.md.tmpl` for the prompt structure.

**Placeholders to fill:**
- `{List all .planning/research/*.md files that were created}` — list the research files produced in Step 5

**After the synthesizer completes**, display:
```
✓ Research synthesis complete — see .planning/research/SUMMARY.md
```

---

### Step 7: Requirements Scoping (inline)

Present research findings (if any) and interactively scope requirements with the user.

**7a. Present findings:**
If research was done, read `.planning/research/SUMMARY.md` and present key findings:
- Recommended stack
- Key architectural decisions
- Notable pitfalls to be aware of

**7b. Feature identification:**
From the questioning session, list all features and capabilities discussed. Group them into categories.

Example categories: Auth, UI, API, Data, Infrastructure, Testing, etc.

**7c. Scope each category:**
For each category, present the features and ask the user to classify each:
- **v1 (committed)** — Will be built in this project
- **v2 (deferred)** — Will be built later, not now
- **Out of scope** — Will NOT be built

**7d. Assign REQ-IDs:**
For each committed requirement, assign an ID in the format `{CATEGORY}-{NN}`:
- `AUTH-01`: User can log in with Discord OAuth
- `AUTH-02`: Protected routes redirect to login
- `UI-01`: Dashboard shows player statistics
- `UI-02`: Mobile-responsive layout

Each requirement must be:
- **User-centric** — describes a capability from the user's perspective
- **Testable** — you can verify whether it's met or not
- **Specific** — not vague ("fast" is bad, "page loads in <2s" is good)

**7e. Write REQUIREMENTS.md:**

**CRITICAL: Write REQUIREMENTS.md NOW. The roadmap planner depends on this file.**

Read the template from `skills/begin/templates/REQUIREMENTS.md.tmpl` and write `.planning/REQUIREMENTS.md` with:
- All v1 requirements grouped by category
- All v2 requirements with deferral reasons
- Out-of-scope items with rationale
- Traceability table (all REQ-IDs, no phases assigned yet)

---

### Step 8: Roadmap Generation (delegated to subagent)

Display to the user: `◐ Spawning planner (roadmap)...`

Spawn the planner in roadmap mode:

```
Task({
  subagent_type: "pbr:planner",
  prompt: <roadmap prompt>
})
```

**NOTE**: The `pbr:planner` subagent type auto-loads the agent definition. Do NOT inline it. The planner agent will read REQUIREMENTS.md and SUMMARY.md from disk — you only need to tell it what to do and where files are.

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it.

#### Roadmap Prompt Template

Read `skills/begin/templates/roadmap-prompt.md.tmpl` for the prompt structure.

**Placeholders to fill:**
- `{project name}` — project name from Step 2
- `{description}` — project description from Step 2
- `{quick|standard|comprehensive}` — depth setting from Step 3

**After the planner completes:**
- Read `.planning/ROADMAP.md`
- Count the phases from the roadmap content
- Verify the roadmap contains a `## Milestone:` section wrapping the phases (the planner should generate this). If not, the initial set of phases constitutes the first milestone — add the section header yourself.
- Display:
  ```
  ✓ Roadmap created — {N} phases in milestone "{name}"
  ```
- If `gates.confirm_roadmap` is true in config, use the **approve-revise-abort** pattern from `skills/shared/gate-prompts.md`:
  question: "Approve this roadmap?"
  options:
    - label: "Approve"          description: "Proceed with this roadmap"
    - label: "Request changes"  description: "Discuss adjustments before proceeding"
    - label: "Abort"            description: "Cancel and start over"
    - If user selects "Request changes": edit the roadmap inline (small changes) or re-spawn planner
    - If user selects "Approve": proceed to Step 9
    - If user selects "Abort": stop execution

---

### Step 9: State Initialization (inline)

Write the project state files from templates:

**CRITICAL: You MUST write all 5 state initialization files (Steps 9a-9e). Do NOT skip any.**

**CRITICAL: Write PROJECT.md NOW. Do NOT skip this step.**

**9a. Write PROJECT.md:**
1. Read `skills/begin/templates/PROJECT.md.tmpl`
2. Fill in:
   - `{project_name}` — from questioning
   - `{2-3 sentences}` — project description from questioning
   - `{ONE sentence}` — core value statement
   - Out-of-scope features
   - Technical context and constraints
   - Initial key decisions from the questioning conversation
3. Write to `.planning/PROJECT.md`
4. Ensure the `## Milestones` section is filled in with the project name and phase count from the roadmap

**CRITICAL: Write STATE.md NOW. Do NOT skip this step.**

**9b. Write STATE.md:**
1. Read `skills/begin/templates/STATE.md.tmpl`
2. Fill in:
   - `{date}` — today's date
   - `{total}` — total phase count from roadmap
   - `{Phase 1 name}` — from roadmap
   - Core value one-liner
   - Decisions from initialization
3. Write to `.planning/STATE.md`
4. Fill in the `## Milestone` section with the project name and total phase count
5. **STATE.md size limit**: Follow size limit enforcement rules in `skills/shared/state-update.md` (150 lines max).

**CRITICAL: Write CONTEXT.md NOW. Do NOT skip this step.**

**9c. Write CONTEXT.md:**
Create `.planning/CONTEXT.md` from information gathered during questioning:

```markdown
# Project Context

## Locked Decisions
{Technology choices, architecture decisions, and constraints that are NON-NEGOTIABLE}

| Decision | Rationale | Locked By |
|----------|-----------|-----------|
| {e.g., "Use TypeScript"} | {User preference, team skill} | User |

## User Constraints
{Budget, timeline, skill level, hosting, team size}

## Deferred Ideas
{Features explicitly moved to v2 or out-of-scope}

| Idea | Reason Deferred |
|------|----------------|
| {feature} | {reason} |
```

**CRITICAL: Write HISTORY.md NOW. Do NOT skip this step.**

**9d. Write HISTORY.md:**
Create `.planning/HISTORY.md` with an initial entry:

```markdown
# Project History

## {date} — Project Created

- Initialized Plan-Build-Run project
- Depth: {depth}, Mode: {mode}
- Roadmap: {N} phases planned
```

**CRITICAL: Create phase directories NOW. Do NOT skip this step.**

**9e. Create phase directories:**
For each phase in the roadmap, create the directory structure:
```
.planning/phases/01-{slug}/
.planning/phases/02-{slug}/
...
```

Where `{slug}` is the phase name in kebab-case (e.g., `project-setup`, `authentication`).

---

### Step 10: Git Setup (inline)

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

**10a. Gitignore:**
If `planning.commit_docs` is `false` in config:
- Add `.planning/` to `.gitignore`

If `planning.commit_docs` is `true`:
- Add `.planning/research/` to `.gitignore` (research is always excluded — it's reference material, not project state)

**10b. Initial commit (if desired):**
If `gates.confirm_project` is true in config:
- Present a summary of everything created:
  - Project: {name}
  - Core value: {one-liner}
  - Phases: {count} phases in roadmap
  - Requirements: {count} v1 requirements
  - Config: depth={depth}, mode={mode}
- Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "Everything look good? Commit the planning docs?"
  options:
    - label: "Yes"  description: "Stage and commit .planning/ files"
    - label: "No"   description: "Let me review and adjust first"
- If user selects "Yes" and `planning.commit_docs` is true:
  - Stage `.planning/` files (excluding research/ if gitignored)
  - Commit: `chore: initialize plan-build-run project planning`
- If user selects "No": let user review and adjust

---

## Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

## Completion

After all steps complete, present the final summary:

Use the branded stage banner from `references/ui-formatting.md`:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PROJECT INITIALIZED ✓                      ║
╚══════════════════════════════════════════════════════════════╝

**{name}**

{core value one-liner}

Roadmap: {N} phases
  1. {Phase 1 name}
  2. {Phase 2 name}
  ...

Requirements: {N} committed, {M} deferred, {K} out-of-scope
```

Then use the "Next Up" routing block:
```


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Phase 1: {Name}** — {one-line goal}

`/pbr:discuss 1`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:explore` — open-ended exploration before planning
- `/pbr:plan 1` — jump straight to planning Phase 1
- `/pbr:milestone new` — add a second milestone with new phases
- `/pbr:config` — adjust workflow settings


```

---

## Error Handling

### Research agent fails
If a researcher Task() fails or times out:
- Note which topic wasn't researched
- Continue with available research
- Display: `⚠ Research on {topic} failed. Proceeding without it. You can re-research during /pbr:plan.`

### User wants to restart
If user says they want to start over mid-flow:
- Confirm: "Start over from the beginning? Current progress will be lost."
- If yes: restart from Step 2

### Config write fails
If `.planning/` directory can't be created, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Cannot create .planning/ directory.

**To fix:** Check directory permissions or specify an alternative path.
```

---

## Files Created by /pbr:begin

| File | Purpose | When |
|------|---------|------|
| `.planning/config.json` | Workflow configuration | Step 3 |
| `.planning/research/*.md` | Research documents | Step 5 (if research enabled) |
| `.planning/research/SUMMARY.md` | Research synthesis | Step 6 (if research enabled) |
| `.planning/REQUIREMENTS.md` | Scoped requirements | Step 7 |
| `.planning/ROADMAP.md` | Phase roadmap | Step 8 |
| `.planning/PROJECT.md` | Project overview | Step 9 |
| `.planning/STATE.md` | Current state tracker | Step 9 |
| `.planning/CONTEXT.md` | Decisions and constraints | Step 9 |
| `.planning/HISTORY.md` | Project history log | Step 9 |
| `.planning/phases/NN-*/` | Phase directories | Step 9 |
