Here is the **Comprehensive Towline v2 Master Build Plan**.

This document consolidates the original GSD insights, your v1 proposal, and the v2 architectural optimizations (Gemini analysis) into a single execution blueprint. It is specifically engineered for the **Claude Code Max 5x** tier, treating token context as a finite, expensive currency that must be aggressively managed.

---

# 1. Towline Philosophy & Design Goals

### The "Max 5x" Reality
*   **Constraint:** You have ~200k tokens per context window and a finite daily/weekly message budget.
*   **The Problem:** "Context Rot." As a session grows, reasoning degrades, and costs explode. Loading a full codebase map (15k tokens) at the start of every session is bankruptcy.
*   **The Solution:** Towline is not a chatbot; it is a **stateless state manager**.

### Core Principles

1.  **Context is Currency (The 10% Rule)**
    *   *Goal:* The main orchestrator session should never exceed **15-20%** of the context window.
    *   *Philosophy:* If the main window fills up, the system has failed. Heavy lifting (reading files, writing code, running tests) *must* happen in ephemeral `Task()` sub-agents that burn their own context, not yours.

2.  **State > Memory (The "Memento" Protocol)**
    *   *Goal:* A session should be killable at any second without data loss.
    *   *Philosophy:* Never rely on Claude's conversation history to remember what happened. If it isn't written to `.planning/STATE.yaml`, it didn't happen. Every session starts fresh by reading the state file, not by reading chat history.

3.  **Fan-Out / Fan-In (The Factory Model)**
    *   *Goal:* Maximize throughput within the 5-hour rolling message limit.
    *   *Philosophy:* Don't chat back and forth. Spawn 3 parallel agents (Fan-Out) to do work in isolated Git Worktrees, then aggregate their results (Fan-In). One command interaction = multiple units of work.

4.  **Verification Over Trust (Trust but Verify)**
    *   *Goal:* Catch hallucinations before they become legacy code.
    *   *Philosophy:* Agents lie. They claim "Fixed it" when they haven't. Towline uses a specialized **Verifier Agent** (Read-Only) that checks the work of Execution Agents against the requirements *before* the code is merged.

5.  **Build Houses, Don't Swat Flies**
    *   *Goal:* The overhead of an agentic framework is only worth it for complex tasks.
    *   *Philosophy:* Towline is for "Phase 2: Authentication System," not "Fix typo in readme." Use `/dev:quick` for the latter, `/dev:build` for the former.

---

# 2. System Architecture

### 2.1 Directory Structure
We use `.js` for cross-platform compatibility (Windows/Linux/Mac) and `YAML` for token-efficient state.

```text
towline/
├── .claude-plugin/
│   └── plugin.json                 # Plugin Manifest
├── .planning/                      # The Brain (Gitignored except config)
│   ├── STATE.yaml                  # Machine-readable current state (The Truth)
│   ├── HANDOFF.yaml                # Session continuity data (The Baton)
│   ├── config.yaml                 # User settings (Models, depth, git behavior)
│   └── logs/
│       └── status.log              # Real-time dashboard for the user
├── skills/                         # The Thin Orchestrators
│   ├── begin/                      # Project initialization & resurrection
│   ├── plan/                       # Requirement breakdown & estimation
│   ├── build/                      # Worktree orchestration & execution
│   ├── review/                     # Verification & UAT
│   ├── discuss/                    # Pre-plan brainstorming
│   ├── status/                     # Dashboard & progress check
│   └── help/                       # Command reference
├── agents/                         # The Workforce (Markdown Prompts)
│   ├── towline-researcher.md       # "Look before you leap"
│   ├── towline-planner.md          # "Measure twice"
│   ├── towline-executor.md         # "Cut once" (Worktree aware)
│   ├── towline-verifier.md         # "Quality Control" (Read-only)
│   ├── towline-synthesizer.md      # "Summarizer"
│   └── towline-merge-resolver.md   # "The Diplomat" (Git conflict handler)
├── scripts/                        # The Engine (Node.js)
│   ├── state-manager.js            # Reads/Writes YAML state safely
│   ├── worktree-manager.js         # Manages Git Worktree isolation
│   ├── context-watchdog.js         # Monitors token usage & triggers handoff
│   ├── status-logger.js            # writes to .planning/logs/status.log
│   ├── validate-commit.js          # Enforces atomic commit message format
│   └── bootstrap.js                # Environment setup
├── hooks/
│   └── hooks.json                  # Lifecycle triggers
└── package.json                    # Dependencies & Scripts
```

### 2.2 Key Technologies

*   **Format:** `YAML` for state (16% cheaper than JSON), `Markdown` for Plans (human-readable).
*   **Isolation:** **Git Worktrees**. Each parallel agent runs in `.worktrees/agent-ID/` to prevent `index.lock` collisions.
*   **Runtime:** Node.js (Standard in Claude Code environment).

---

# 3. The Workflows (Orchestration Logic)

## 3.1 The `/dev:begin` "Resurrector"
*   **Context Cost:** ~2k tokens (vs ~20k standard load).
*   **Logic:**
    1.  **Check:** Does `.planning/HANDOFF.yaml` exist?
        *   *Yes:* Load it. Restore `phase_id`, `active_wave`. Print: "Resuming session..."
        *   *No:* Check `.planning/STATE.yaml`.
            *   *Yes:* Load it. Print: "Project loaded."
            *   *No:* **Initialize.** Ask 3 vision questions. Create `config.yaml`.
    2.  **Lazy Load:** Do **not** read code files. Create a "pointer map" of the file structure (file names only) into state.
    3.  **Ready:** Wait for user command.

## 3.2 The `/dev:plan` "Architect"
*   **Context Cost:** ~5k tokens (Orchestrator) + Sub-agent cost.
*   **Logic:**
    1.  **Orchestrator:** Reads `REQUIREMENTS.md` (pointer) and `STATE.yaml`.
    2.  **Spawn:** `Task(towline-planner)`
        *   *Prompt:* "Read `REQUIREMENTS.md`. Generate `phases/01-PLAN.md` using the Markdown template. Do not implement."
    3.  **Review:** Orchestrator reads the generated Plan (headers only).
    4.  **User Gate:** "Plan generated with 3 waves. Proceed?"

## 3.3 The `/dev:build` "Factory" (The Complex One)
*   **Context Cost:** ~10% of window. Heavy lifting delegated.
*   **Logic:**
    1.  **Load Plan:** Read `phases/01-PLAN.md`. Extract "Wave 1" tasks.
    2.  **Wave Loop:**
        *   Identify 2-3 parallel tasks (e.g., "DB Schema", "API Routes").
        *   **Worktree Setup:** Call `worktree-manager.setup('agent-01')`, `setup('agent-02')`.
        *   **Spawn:** Parallel `Task(towline-executor)` calls.
            *   *Constraint:* "You are restricted to directory `.worktrees/agent-01`. Write status to `../logs/status.log`."
        *   **Monitor:** User sees live dashboard via `status-logger`.
    3.  **Fan-In:**
        *   Agents finish.
        *   **Merge:** Call `worktree-manager.merge('agent-01')`.
        *   *Conflict?* Spawn `Task(towline-merge-resolver)` to fix it.
        *   *Success?* Delete worktree.
    4.  **Verify:** Spawn `Task(towline-verifier)` to run tests on the merged `main` branch.
    5.  **Checkpoint:** Update `STATE.yaml`.

## 3.4 The "Reactive Handoff" (Safety Net)
*   **Trigger:** `context-watchdog.js` detects >80% token usage OR >45 minutes duration.
*   **Action:**
    1.  **Freeze:** Stop accepting new tool calls.
    2.  **Dump:** Write `HANDOFF.yaml` (Current phase, active wave, last error, next immediate step).
    3.  **Die:** Terminate session.
    4.  **Rebirth:** Next `/dev:begin` reads `HANDOFF.yaml` and auto-resumes.

---

# 4. Implementation Steps

## Phase 1: Foundation (The Skeleton)
*   [ ] **Scaffold:** Create plugin directory, `package.json`, `hooks.json`.
*   [ ] **State Engine:** Write `scripts/state-manager.js` (YAML reader/writer).
*   [ ] **Logger:** Write `scripts/status-logger.js` (Append-only log).
*   [ ] **Config:** Define `config.yaml` schema (Goals: max_depth, git_mode).

## Phase 2: The Agent Workforce (The Brains)
*   [ ] **Prompts:** Create 8 Markdown agent definitions in `agents/`.
    *   *Crucial:* Ensure `towline-executor` understands it will be in a sub-directory (worktree).
    *   *Crucial:* Ensure `towline-planner` outputs Markdown task lists `-[ ]`, not XML.
*   [ ] **Tooling:** Configure agents to use "Tool Search" (lazy loading) rather than having all tools injected at start.

## Phase 3: Worktree Engine (The Muscle)
*   [ ] **Manager Script:** Write `scripts/worktree-manager.js`.
    *   `setup(id)`: `git worktree add ...`
    *   `teardown(id)`: `git worktree remove ...`
    *   `merge(id)`: `git merge ...`
*   [ ] **Build Skill:** Create `skills/build/SKILL.md`. Implement the Wave looping logic.

## Phase 4: Lifecycle & Handoff (The Safety)
*   [ ] **Watchdog:** Write `scripts/context-watchdog.js`.
*   [ ] **Hook:** Bind watchdog to `PostToolUse` in `hooks.json`.
*   [ ] **Begin Skill:** Create `skills/begin/SKILL.md` with the "Resurrection" logic.

## Phase 5: Verification & Polish
*   [ ] **Test:** Run a "crash test" (kill terminal mid-build, restart, verify resume).
*   [ ] **Optimize:** specific prompts to reduce verbosity (e.g., "Reply only with 'OK'").
*   [ ] **Docs:** `README.md` explaining the Worktree workflow to users.

---

# 5. Token Economy Analysis (Max 5x)

| Operation | Standard Cost | Towline v2 Cost | Savings |
| :--- | :--- | :--- | :--- |
| **Session Start** | ~20k (Full Context) | ~2k (Pointer Only) | **90%** |
| **Planning** | ~10k (Inline) | ~1k (Orchestrator) + Sub-agent | **Orchestrator stays lean** |
| **Execution** | ~100k+ (Chat History) | ~15k (Fresh Sub-agent) | **85%** |
| **Verification** | ~50k (Reading Logs) | ~5k (Reading Summary) | **90%** |

**Budget Impact:**
With Towline v2, a Max 5x user can theoretically run **3-4 full feature cycles per day**, compared to 1 cycle with standard "chat-based" coding, because the main context never fills up with garbage.

This is the blueprint. It moves beyond "prompt engineering" into **architecture engineering**.