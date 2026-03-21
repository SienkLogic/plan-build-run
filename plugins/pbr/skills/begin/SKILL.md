---
name: begin
description: "Start a new project. Deep questioning, research, requirements, and roadmap."
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:new-project — Project Initialization

**References:** `@references/questioning.md`, `@references/ui-brand.md`

You are the orchestrator for `/pbr:new-project`. This skill initializes a new Plan-Build-Run project through deep questioning, optional research, requirements scoping, and roadmap generation. Your job is to stay lean — delegate heavy work to Task() subagents and keep the user's main context window clean.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

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

## Multi-Session Sync

Before any phase-modifying operations, this skill acquires a claim on the project:

```
acquireClaim(planningDir, sessionId)
```

Where `planningDir` is the `.planning/` directory and `sessionId` is the current session identifier. If the claim fails (another session owns it), display: "Another session owns this project. Use `/pbr:progress` to see active claims."

On completion or error, release the claim:

```
releaseClaim(planningDir, sessionId)
```

## Prerequisites

- Working directory should be the project root
- No existing `.planning/` directory (or user confirms overwrite)

---

## Orchestration Flow

Execute these steps in order. Each step specifies whether it runs inline (in your context) or is delegated to a subagent.

---

### Step 1: Detect Brownfield (inline)

**CRITICAL — Run init command FIRST before any Glob calls or manual file checks:**

```bash
node plugins/pbr/scripts/pbr-tools.js init begin
```

Store the JSON result as `blob`. This single call replaces multiple Glob/filesystem checks with a pre-computed payload:
- `blob.has_planning` — whether .planning/ directory exists
- `blob.has_existing_code` — whether brownfield indicators were found
- `blob.brownfield_indicators` — array of detected indicators (package.json, src/, etc.)
- `blob.has_git` — whether .git directory exists
- `blob.existing_phases` — count of existing phase directories
- `blob.state` — existing STATE.md frontmatter (or null if no project)
- `blob.config` — existing config.json contents (or null)

> **Cross-platform note**: The init command handles all filesystem checks cross-platform. No Glob or Bash file discovery needed.

**If `blob.has_existing_code` is true:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "This looks like an existing codebase. Run /pbr:map-codebase to analyze what's here first?"
  options:
    - label: "Yes, scan"   description: "Run /pbr:map-codebase first to analyze existing code"
    - label: "No, begin"   description: "Proceed with /pbr:new-project on top of existing code"
- If user selects "Yes, scan": suggest `/pbr:map-codebase` and stop
- If user selects "No, begin": proceed to Step 2

**If `blob.has_planning` is true:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "A .planning/ directory already exists. This will overwrite it. Continue?"
  options:
    - label: "Yes"  description: "Overwrite existing planning directory"
    - label: "No"   description: "Cancel — keep existing planning"
- If user selects "No": **STOP IMMEDIATELY. Do not ask again. Do not proceed to Step 2. End the skill with this message:**
  ```
  Keeping existing .planning/ directory. Use `/pbr:progress` to see current project state, or `/pbr:plan-phase` to continue planning.
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

### Step 2.5: Fast-Path Offer (inline)

Before asking any workflow preference questions, offer the user a quick-start option:

Use AskUserQuestion:
  question: "How do you want to configure this project?"
  header: "Setup mode"
  options:
    - label: "Quick start"
      description: "Use all defaults — model balanced, depth standard, interactive mode, parallel on. Writes config in seconds."
    - label: "Custom setup"
      description: "Walk through model selection, features, and preferences step by step."

**If user selects "Quick start":**
- Tell the user: "Tip: Agents set to `inherit` use your Claude Code session model. For cost savings, run on Sonnet -- orchestration and inherit agents work well at that tier. See `references/model-profiles.md` for details."
- Write `.planning/config.json` immediately using the default config below (no further questions):
  ```json
  {
    "version": 2,
    "context_strategy": "aggressive",
    "mode": "interactive",
    "depth": "standard",
    "context_window_tokens": 200000,
    "features": {
      "structured_planning": true,
      "goal_verification": true,
      "integration_verification": true,
      "context_isolation": true,
      "atomic_commits": true,
      "session_persistence": true,
      "research_phase": true,
      "plan_checking": true,
      "tdd_mode": false,
      "status_line": true,
      "auto_continue": false,
      "auto_advance": false,
      "team_discussions": false,
      "inline_verify": false
    },
    "models": {
      "researcher": "sonnet",
      "planner": "inherit",
      "executor": "inherit",
      "verifier": "sonnet",
      "integration_checker": "sonnet",
      "debugger": "inherit",
      "mapper": "sonnet",
      "synthesizer": "haiku"
    },
    "parallelization": {
      "enabled": true,
      "plan_level": true,
      "task_level": false,
      "max_concurrent_agents": 3,
      "min_plans_for_parallel": 2,
      "use_teams": false
    },
    "planning": {
      "commit_docs": true,
      "max_tasks_per_plan": 3,
      "search_gitignored": false
    },
    "git": {
      "branching": "none",
      "commit_format": "{type}({phase}-{plan}): {description}",
      "phase_branch_template": "plan-build-run/phase-{phase}-{slug}",
      "milestone_branch_template": "plan-build-run/{milestone}-{slug}",
      "mode": "enabled"
    },
    "gates": {
      "confirm_project": true,
      "confirm_roadmap": true,
      "confirm_plan": true,
      "confirm_execute": false,
      "confirm_transition": true,
      "issues_review": true
    },
    "safety": {
      "always_confirm_destructive": true,
      "always_confirm_external_services": true
    }
  }
  ```
**CRITICAL — DO NOT SKIP: Write .active-skill NOW.** Write `.planning/.active-skill` with text "begin"
- Write CLAUDE.md integration block (see Step 3d-claude below) using the project name gathered in Step 2
- Skip to Step 4 (Research Decision)
- Tell the user: "Quick start selected. Using all defaults — you can adjust later with `/pbr:settings`."

**If user selects "Custom setup":** proceed to Step 3 normally.

---

### Step 3: Workflow Preferences (inline)

After understanding the project, configure the Plan-Build-Run workflow. Use AskUserQuestion for each preference below. Present them sequentially with conversational bridging (e.g., "Great. Next...") to keep the flow natural.

**3-model. Model Profile:**
Note: These profiles control agent models. The orchestrator uses your Claude Code session model. For cost optimization, consider running on Sonnet -- agents with `inherit` will follow. See `references/model-profiles.md`.

Use AskUserQuestion:
  question: "Which model profile should agents use?"
  header: "Models"
  options:
    - label: "Balanced (Recommended)"
      description: "Sonnet for most agents, Haiku for synthesizer. Good quality/cost tradeoff."
    - label: "Quality"
      description: "Opus for executor and planner, Sonnet for others. Best results, highest cost."
    - label: "Budget"
      description: "Haiku for most agents. Fastest and cheapest, but lower quality."

Apply the selected profile to the models block in config.json:
- **Balanced**: executor=sonnet, researcher=sonnet, planner=sonnet, verifier=sonnet, synthesizer=haiku, context_window_tokens=200000, agent_checkpoint_pct=50, extended_context=false
- **Quality**: executor=opus, researcher=sonnet, planner=opus, verifier=sonnet, synthesizer=sonnet, context_window_tokens=1000000, agent_checkpoint_pct=65, extended_context=true
- **Budget**: executor=haiku, researcher=haiku, planner=sonnet, verifier=haiku, synthesizer=haiku, context_window_tokens=200000, agent_checkpoint_pct=50, extended_context=false

**3-features. Workflow Features:**
Use AskUserQuestion:
  question: "Any extra workflow features?"
  header: "Features"
  multiSelect: true
  options:
    - label: "Auto-continue"
      description: "Automatically chain commands (build → review → next phase) without prompting"
    - label: "TDD mode"
      description: "Write tests before implementation in executor agents"
    - label: "Strict gates"
      description: "Require verification AND review to pass before advancing phases"
    - label: "Git branching"
      description: "Create a branch per phase for cleaner PR history"

Apply selections:
- **Auto-continue**: Set `features.auto_continue: true`
- **TDD mode**: Set `features.tdd_mode: true`
- **Strict gates**: Set `gates.verification: true`, `gates.review: true`, `gates.plan_approval: true`
- **Git branching**: Set `git.branching: "phase"`

**3a. Mode:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **toggle-confirm** pattern from `skills/shared/gate-prompts.md`:
  question: "How do you want to work?"
  header: "Mode"
  options:
    - label: "Interactive"  description: "Pause at key gates for your approval (default)"
    - label: "Autonomous"   description: "Auto-proceed, only stop for critical decisions"
- `interactive` (default) — confirm at gates (roadmap, plans, transitions)
- `autonomous` — auto-proceed, only stop for critical decisions

**3b. Depth:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **depth-select** pattern from `skills/shared/gate-prompts.md`:
  question: "How thorough should planning be?"
- `quick` — 3-5 phases, skip research, ~50% cheaper
- `standard` (default) — 5-8 phases, includes research
- `comprehensive` — 8-12 phases, full deep research, ~2x cost

**3c. Parallelization:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **toggle-confirm** pattern from `skills/shared/gate-prompts.md`:
  question: "Run multiple agents in parallel when plans are independent?"
  header: "Parallel"
  options:
    - label: "Enable"   description: "Parallel execution of independent plans (default)"
    - label: "Disable"  description: "Sequential execution only"
- `enabled` (default) — parallel execution of independent plans
- `disabled` — sequential execution

**3d. Git Branching:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **git-strategy-select** pattern from `skills/shared/gate-prompts.md`:
  question: "Git branching strategy?"
- `none` (default) — commit to current branch
- `phase` — create branch per phase
- `milestone` — create branch per milestone

**3e. Commit Planning Docs:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "Should planning documents (.planning/ directory) be committed to git?"
  options:
    - label: "Yes"  description: "Commit planning docs (default)"
    - label: "No"   description: "Add .planning/ to .gitignore"
- `yes` (default) — commit planning docs
- `no` — add .planning/ to .gitignore

**3d-claude. CLAUDE.md Integration:**

Check if a `CLAUDE.md` file exists in the project root.

**If it exists**: Read it. If it does NOT already contain a "Plan-Build-Run" section, append the block below.
**If it does NOT exist**: Create `CLAUDE.md` with the block below.

Append/create:

```markdown
## Plan-Build-Run

This project uses [Plan-Build-Run](https://github.com/SienkLogic/plan-build-run) for structured development.

- Project state: `.planning/STATE.md` (source of truth for current phase and progress)
- Configuration: `.planning/config.json`
- Run `/pbr:progress` to see current project state and suggested next action.

**After compaction or context recovery**: Read `.planning/STATE.md` (especially the `## Session Continuity` section) before proceeding with any work. The PreCompact hook writes recovery state there automatically.
```

**After gathering preferences:**

**CRITICAL (no hook): You MUST create the .planning/ directory and write config.json NOW. Do not proceed without this.**

1. Read the config template from `${CLAUDE_SKILL_DIR}/templates/config.json.tmpl`
2. Apply the user's choices to the template (including 3d-claude CLAUDE.md integration)
3. Create `.planning/` directory
4. Write `.planning/config.json` with the user's preferences

**IMPORTANT**: This step MUST happen BEFORE research (Step 5) because depth controls how many researchers to spawn.

**CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "begin" to `.planning/.active-skill` using the Write tool. Verify the file exists before proceeding.

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

**Auto-mode bypass:** If the `--auto` flag is active or `config.mode === 'autonomous'`:
- Default to `standard` depth (2 researchers: STACK, FEATURES) unless depth was explicitly set to `comprehensive`
- Set `gates.confirm_research` to `false` (skip the depth selection gate)
- Display: "PBR > Auto-mode: advancing to research (standard depth)..."
- Proceed directly to Step 5

**Interactive mode (default):**
- If `gates.confirm_research` is `true` in config:
  **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
  Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
    question: "I'd like to research the technology landscape before planning. This helps create better plans. Proceed with research?"
    options:
      - label: "Yes"  description: "Run research agents (recommended for standard/comprehensive)"
      - label: "No"   description: "Skip research, move straight to requirements"
  - If user selects "No": skip to Step 7
  - If user selects "Yes": proceed to Step 5
- If `gates.confirm_research` is `false` (default): proceed directly to Step 5 (research runs automatically)

---

### Step 5: Research (delegated to subagents)

Spawn parallel Task() subagents for research. Each researcher writes to `.planning/research/`.

**CRITICAL (no hook): Create .planning/research/ directory NOW before spawning researchers. Do NOT skip this step.**

**Learnings injection (opt-in):** Before spawning researchers, check if global learnings exist:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js learnings query --tags "stack,tech" 2>/dev/null
```

If the command succeeds AND returns a non-empty JSON array:

- Write the results to a temp file:

  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js learnings query --tags "stack,tech" > /tmp/pbr-learnings-$$.md
  ```

- Note the temp file path as `{learnings_temp_path}`
- Add this file to the researcher's `files_to_read` block (see below)

If no learnings exist or the command fails: skip injection silently.

**For each research topic, spawn a Task():**

```
Task({
  subagent_type: "pbr:researcher",
  // After researcher: check for ## RESEARCH COMPLETE or ## RESEARCH BLOCKED
  prompt: <see researcher prompt template below>
})
```

**NOTE**: The `pbr:researcher` subagent type auto-loads the agent definition from `agents/researcher.md`. Do NOT inline the agent definition — it wastes main context.

**Path resolution**: Before constructing any agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Researcher Prompt Template

For each researcher, construct the prompt by reading the template and filling in placeholders:

Read `${CLAUDE_SKILL_DIR}/templates/researcher-prompt.md.tmpl` for the prompt structure.

**Prepend this block to the researcher prompt before sending:**

```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/REQUIREMENTS.md — scoped requirements (if exists)
{if learnings_temp_path exists}2. {learnings_temp_path} — cross-project learnings (tech stack patterns from past PBR projects){/if}
</files_to_read>
```

If `{learnings_temp_path}` was produced in the learnings injection step above, replace `{if...}{/if}` with the actual line. If no learnings were found, omit line 2 entirely.

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

**Domain-specific template injection:**

Each researcher must be told which domain-specific template to follow. When constructing the researcher prompt, inject the correct template path for the assigned topic:

| Topic | Template Path |
|-------|--------------|
| STACK | `${CLAUDE_PLUGIN_ROOT}/templates/research-outputs/STACK.md.tmpl` |
| FEATURES | `${CLAUDE_PLUGIN_ROOT}/templates/research-outputs/FEATURES.md.tmpl` |
| ARCHITECTURE | `${CLAUDE_PLUGIN_ROOT}/templates/research-outputs/ARCHITECTURE.md.tmpl` |
| PITFALLS | `${CLAUDE_PLUGIN_ROOT}/templates/research-outputs/PITFALLS.md.tmpl` |

Include the resolved absolute path in the researcher prompt (resolve `${CLAUDE_PLUGIN_ROOT}` before sending).

**Parallelization:**
- Spawn ALL researchers in parallel (multiple Task() calls in one response)
- Use `run_in_background: true` for each researcher
- **Individual Agent Calls:** Each researcher MUST be a separate Task() tool call in a single response message. Do NOT describe the batch in prose (e.g., "4 researchers launched"). Each separate Task() call gets its own colored badge and independent ctrl+o expansion in the Claude Code UI. Multiple Task() calls in one message still run concurrently — no parallelism is lost.
- Before spawning, display to the user: `◆ Spawning {N} researchers in parallel...`
- While waiting, display progress to the user:
  - After spawning: list of topics being researched
  - Periodically (every ~30s): check `TaskOutput` with `block: false` for each agent and report status
  - When each completes: "✓ {topic} researcher complete ({duration})"
  - When all complete: "All {N} researchers finished. Proceeding to synthesis."
- Wait for all to complete before proceeding

#### Partial Failure Detection

After all researchers complete (or timeout), check which research files were actually produced:

1. List files in `.planning/research/` (excluding SUMMARY.md)
2. Map against expected files for the current depth level:
   - **standard**: expect STACK.md, FEATURES.md (2 files)
   - **comprehensive**: expect STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (4 files)
3. Count successes and failures
4. For files that exist, also check for `## RESEARCH BLOCKED` marker -- count these as "completed with issues" (still pass to synthesizer, which handles them)

**If all expected files present:** proceed to Step 6.

**If some files missing (partial failure):**

Display: "Research partially complete: {N} of {M} researchers succeeded."
List the missing dimensions.

**Auto-mode:** Display "Continuing with gaps (auto-mode). Gaps will be noted in synthesis." and proceed to Step 6.

**Interactive mode:**
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use AskUserQuestion with 3 options:

```
question: "Research partially complete. {N} of {M} researchers succeeded. How would you like to proceed?"
header: "Partial Research"
options:
  - label: "Continue with gaps"
    description: "Proceed to synthesis -- gaps will be noted in SUMMARY.md"
  - label: "Retry failed"
    description: "Re-spawn only the failed researchers, then re-check"
  - label: "Abort research"
    description: "Skip research entirely and move to requirements"
```

- If "Continue with gaps": proceed to Step 6
- If "Retry failed": re-spawn only the failed researchers (same Task() pattern), then re-run partial failure detection
- If "Abort research": skip to Step 7 (Requirements Scoping)

---

### Step 6: Synthesis (delegated to subagent)

**Auto-mode bypass:** If the `--auto` flag is active or `config.mode === 'autonomous'`, skip the "Research complete. Review findings?" gate and proceed directly to synthesizer spawning.

**Interactive mode:** If a review gate is configured (e.g., `gates.confirm_research_review`), present the research findings and ask the user to review before synthesis. Preserve the existing review gate behavior.

After all researchers complete (and review gate passed or bypassed), display to the user: `◆ Spawning synthesizer...`

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

Read `${CLAUDE_SKILL_DIR}/templates/synthesis-prompt.md.tmpl` for the prompt structure.

**Prepend this block to the synthesizer prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/research/*.md — all research output files from Step 5
</files_to_read>
```

**Dynamic file discovery:** Do NOT pass a hardcoded list of research files. Instead, instruct the synthesizer to "Read ALL .md files in the `.planning/research/` directory (excluding SUMMARY.md). These are your research inputs." The synthesizer discovers available files at runtime, which handles partial failure gracefully.

**Commit instruction:** Instruct the synthesizer to commit all research files together after producing SUMMARY.md: "After writing SUMMARY.md, commit ALL files in `.planning/research/` together with message: `docs(research): complete research synthesis`"

**Placeholders to fill:**
- `{List all .planning/research/*.md files that were created}` — list the research files produced in Step 5 (for reference, but synthesizer uses dynamic discovery)

**After the synthesizer completes**, check for completion markers in the Task() output:

- If `## SYNTHESIS COMPLETE` is present: proceed normally
- If `## SYNTHESIS BLOCKED` is present: warn the user and offer to proceed without synthesis:
  ```
  ⚠ Synthesizer reported BLOCKED: {reason from output}
  Research files are still available individually in .planning/research/.
  ```
  **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
  Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
    question: "Synthesis was blocked. Continue without synthesis?"
    header: "Blocked"
    options:
      - label: "Yes"  description: "Proceed to requirements — use individual research files"
      - label: "No"   description: "Stop and investigate"
  - If "Yes": proceed to Step 7 without SUMMARY.md
  - If "No": stop and suggest reviewing .planning/research/ files
- If neither marker is found: warn the user that the synthesizer may not have completed successfully, but proceed if SUMMARY.md exists on disk

If synthesis succeeded, display:
```
✓ Research synthesis complete — see .planning/research/SUMMARY.md
```

---

### Step 7: Requirements Scoping (inline)

**Auto-mode chaining:** If `config.mode === 'autonomous'`, display "PBR > Auto-mode: advancing to requirements scoping..." and proceed through this step without interactive gates. Auto-derive requirements from research findings and questioning context. Classify all identified features as v1 (committed) unless they clearly belong in a later phase.

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
For each committed requirement, assign an ID using the REQ-F/REQ-NF schema:
- Functional requirements: `REQ-F-xxx` numbered sequentially within each category (REQ-F-001, REQ-F-002, ...)
- Non-functional requirements: `REQ-NF-xxx` numbered sequentially across all NFR categories (REQ-NF-001, REQ-NF-002, ...)
- Examples: `REQ-F-001: User can log in with Discord OAuth`, `REQ-NF-001: Page loads in <2s on 4G`

Each requirement must be:
- **User-centric** — describes a capability from the user's perspective
- **Testable** — you can verify whether it's met or not
- **Specific** — not vague ("fast" is bad, "page loads in <2s" is good)

**7e. Write REQUIREMENTS.md:**

**CRITICAL (no hook): Write REQUIREMENTS.md NOW. The roadmap planner depends on this file.**

Read the template from `${CLAUDE_SKILL_DIR}/templates/REQUIREMENTS.md.tmpl` and write `.planning/REQUIREMENTS.md` with:
- All v1 requirements grouped by category
- All v2 requirements with deferral reasons
- Out-of-scope items with rationale
- Traceability table (all REQ-IDs, no phases assigned yet)

---

### Step 8: Roadmap Generation (delegated to subagent)

Display to the user: `◆ Spawning roadmapper...`

Spawn the roadmapper agent:

```
Task({
  subagent_type: "pbr:roadmapper",
  // After roadmapper: check for ## ROADMAP CREATED or ## ROADMAP BLOCKED
  prompt: <roadmap prompt>
})
```

**NOTE**: The `pbr:roadmapper` subagent type auto-loads the agent definition. Do NOT inline it. The roadmapper agent will read REQUIREMENTS.md and SUMMARY.md from disk — you only need to tell it what to do and where files are.

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it.

#### Roadmap Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/roadmap-prompt.md.tmpl` for the prompt structure.

**Prepend this block to the roadmap planner prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/REQUIREMENTS.md — scoped requirements for phase planning
2. .planning/research/SUMMARY.md — research synthesis (if exists)
</files_to_read>
```

**Placeholders to fill:**
- `{project name}` — project name from Step 2
- `{description}` — project description from Step 2
- `{quick|standard|comprehensive}` — depth setting from Step 3

**After the roadmapper completes:**
- **Spot-check:** Verify `.planning/ROADMAP.md` exists on disk using Glob before attempting to read it. If missing, the roadmapper may have failed silently — warn: `⚠ ROADMAP.md not found after roadmapper completed. Re-spawning roadmapper...` and retry once.
- Read `.planning/ROADMAP.md`
- Count the phases from the roadmap content
- Verify the roadmap contains a `## Milestone:` section wrapping the phases (the planner should generate this). If not, the initial set of phases constitutes the first milestone — add the section header yourself.
- Verify each phase section includes `**Requirements:**` and `**Success Criteria:**` fields.
- Verify a `## Milestones` index section exists near the top of the roadmap.
- Display:
  ```
  ✓ Roadmap created — {N} phases in milestone "{name}"
  ```
- **Auto-mode bypass:** If `config.mode === 'autonomous'`, display "PBR > Auto-mode: advancing to state initialization..." and skip the roadmap approval gate. Proceed directly to Step 9.
- If `gates.confirm_roadmap` is true in config (interactive mode):
  **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
  Use the **approve-revise-abort** pattern from `skills/shared/gate-prompts.md`:
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

**CRITICAL (no hook): You MUST write all 5 state initialization files (Steps 9a-9e). Do NOT skip any.**

**CRITICAL (no hook): Write PROJECT.md NOW. Do NOT skip this step.**

**9a. Write PROJECT.md:**
1. Read `${CLAUDE_SKILL_DIR}/templates/PROJECT.md.tmpl`
2. Fill in:
   - `{project_name}` — from questioning
   - `{2-3 sentences}` — project description from questioning
   - `{ONE sentence}` — core value statement
   - **Requirements** section with three lifecycle categories:
     - `### Active` — v1 requirements committed for this milestone
     - `### Validated` — requirements completed and verified (empty at project start)
     - `### Out of Scope` — deferred and excluded items with rationale
   - **Key Decisions** table with Outcome column:
     ```markdown
     | Decision | Rationale | Date | Outcome |
     |----------|-----------|------|---------|
     | {decision} | {why} | {date} | Pending |
     ```
     All initial decisions start with Outcome = `Pending`. Updated to `Good`, `Revisit`, or `Pending` during `/pbr:milestone complete` (see PROJECT.md Evolution Review step).
   - Technical context and constraints
3. Write to `.planning/PROJECT.md`
4. Ensure the `## Milestones` section is filled in with the project name and phase count from the roadmap

**CRITICAL (no hook): Write STATE.md NOW. Do NOT skip this step.**

**9b. Write STATE.md:**
1. Read `${CLAUDE_SKILL_DIR}/templates/STATE.md.tmpl`
2. Fill in:
   - `{date}` — today's date
   - `{total}` — total phase count from roadmap
   - `{Phase 1 name}` — from roadmap
   - Core value one-liner
   - Decisions from initialization
3. Write to `.planning/STATE.md`
4. Fill in the `## Milestone` section with the project name and total phase count
5. **STATE.md size limit**: Follow size limit enforcement rules in `skills/shared/state-update.md` (150 lines max).

**CRITICAL (no hook): Write context to PROJECT.md NOW. Do NOT skip this step.**

**9c. Write context to PROJECT.md ## Context section:**
1. Read `${CLAUDE_SKILL_DIR}/templates/project-CONTEXT.md.tmpl`
2. Fill in from the questioning conversation:
   - Locked Decisions: all technology choices and architecture decisions from Step 2
   - User Constraints: budget, timeline, skill level, hosting, team
   - Deferred Ideas: out-of-scope items identified in Step 7c scoping
   - Claude's Discretion: any areas where user said "you decide"
3. Append to `.planning/PROJECT.md` under a `## Context` section with subsections:
   - `### Locked Decisions`
   - `### User Constraints`
   - `### Deferred Ideas`
4. Do NOT write a separate CONTEXT.md file. All context lives in PROJECT.md now.
5. **Backwards compat migration:** If `.planning/CONTEXT.md` exists (from a prior project version), read its content and merge into PROJECT.md ## Context section. Log: "PBR > Migrated CONTEXT.md into PROJECT.md"

**9d. Initialize velocity and session fields in STATE.md frontmatter:**
Add these fields to the STATE.md YAML frontmatter during initialization:
- `velocity: {}` — empty object, populated as plans are executed
- `session_last: ""` — set when `/pbr:pause-work` is run
- `session_stopped_at: ""` — set when `/pbr:pause-work` is run
- `session_resume: ""` — set when `/pbr:pause-work` is run

**Do NOT write a ## History section to STATE.md.** History has been removed from STATE.md to keep it lean. Milestone completion records are preserved in milestone archives.
**Backwards compat:** If `.planning/HISTORY.md` exists from a prior project, it is ignored during new project initialization.

**CRITICAL (no hook): Create phase directories NOW. Do NOT skip this step.**

**9e. Create phase directories:**
For each phase in the roadmap, create the directory structure:
```
.planning/phases/01-{slug}/
.planning/phases/02-{slug}/
...
```

Where `{slug}` is the phase name in kebab-case (e.g., `project-setup`, `authentication`).

**9f. Create KNOWLEDGE.md:**
Write `.planning/KNOWLEDGE.md` with empty knowledge base tables:

```markdown
---
updated: "{today's date}"
---
# Project Knowledge Base

Aggregated knowledge from milestone completions. Auto-maintained by milestone-learnings.js.

## Key Rules

Architectural rules and constraints discovered during development.

| ID | Rule | Source | Date |
|----|------|--------|------|

## Patterns

Reusable patterns and conventions established across phases.

| ID | Pattern | Source | Date |
|----|---------|--------|------|

## Lessons Learned

What worked, what didn't, and deferred items for future consideration.

| ID | Lesson | Type | Source | Date |
|----|--------|------|--------|------|
```

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
- If `gates.confirm_commit_docs` is `true` OR this is a **brownfield** project (existing code detected in Step 1):
  **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
  Use the **yes-no** pattern from `skills/shared/gate-prompts.md`:
    question: "Everything look good? Commit the planning docs?"
    options:
      - label: "Yes"  description: "Stage and commit .planning/ files"
      - label: "No"   description: "Let me review and adjust first"
  - If user selects "Yes" and `planning.commit_docs` is true:
    - Stage `.planning/` files (excluding research/ if gitignored)
    - Commit: `chore: initialize plan-build-run project planning`
  - If user selects "No": let user review and adjust
- If `gates.confirm_commit_docs` is `false` AND greenfield: skip the question and commit automatically if `planning.commit_docs` is true

---

## Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

## Completion

After all steps complete, present the final summary using the stage banner format from Read `references/ui-brand.md`:

Display the `PROJECT INITIALIZED ✓` banner with project name, core value, phase list, and requirement counts. Then display the "Next Up" block (see § "Next Up Block" in ui-brand.md) pointing to `/pbr:discuss-phase 1` with alternatives: `/pbr:explore`, `/pbr:plan-phase 1`, `/pbr:new-milestone`, `/pbr:settings`, `/pbr:intel` (if codebase scan results exist in `.planning/codebase/`). Include `<sub>/clear first → fresh context window</sub>` inside the Next Up routing block.

**Auto-mode chaining to first phase discussion:** If `config.mode === 'autonomous'`, after displaying the completion banner, automatically chain to the first phase discussion:
- Display: "PBR > Auto-mode: advancing to phase 1 discussion..."
- Write `.planning/.auto-next` with `/pbr:discuss-phase 1` to trigger auto-continue hook
- If any stage in the auto-mode chain fails, stop the chain and report: "PBR > Auto-mode chain stopped: {stage} failed. Resume manually with `/pbr:{next_command}`."

---

## Error Handling

### Research agent fails
If a researcher Task() fails or times out:
- Note which topic wasn't researched
- Continue with available research
- Display: `⚠ Research on {topic} failed. Proceeding without it. You can re-research during /pbr:plan-phase.`

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

## Files Created by /pbr:new-project

| File | Purpose | When |
|------|---------|------|
| `.planning/config.json` | Workflow configuration | Step 3 |
| `.planning/research/*.md` | Research documents | Step 5 (if research enabled) |
| `.planning/research/SUMMARY.md` | Research synthesis | Step 6 (if research enabled) |
| `.planning/REQUIREMENTS.md` | Scoped requirements | Step 7 |
| `.planning/ROADMAP.md` | Phase roadmap | Step 8 |
| `.planning/PROJECT.md` | Project overview + context (locked decisions, constraints, deferred ideas) | Step 9 |
| `.planning/STATE.md` | Current state tracker + history log | Step 9 |
| `.planning/KNOWLEDGE.md` | Project knowledge base (rules, patterns, lessons) | Step 9 |
| `.planning/phases/NN-*/` | Phase directories | Step 9 |
