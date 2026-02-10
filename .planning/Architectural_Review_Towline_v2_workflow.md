This is a comprehensive, step-by-step architectural review of the Towline v2 workflow. It breaks down every skill, agent, and interaction, specifically optimizing for the **Claude Code Max 5x** token budget (~200k context, finite message cap).

---

# Phase 1: Initialization & Context Loading (`/dev:begin`)

**The Goal:** Establish the "Pointer State" without polluting the context window with file contents.

### The Skill: `skills/begin/SKILL.md`
This is a **Thin Orchestrator** running in the main session.
1.  **Handoff Check:** Looks for `.planning/HANDOFF.yaml`.
    *   *If found:* **Resurrection Mode.** Reads the file, restores the `phase_id` and `active_wave`, and immediately triggers the next step.
    *   *If missing:* **Fresh Start Mode.**
2.  **State Check:** Looks for `.planning/STATE.yaml`.
    *   *If missing:* Runs a minimal interview (3 questions max) to establish vision. Creates `STATE.yaml` and `config.yaml`.
3.  **Pointer Mapping:** Runs `find . -maxdepth 3 -not -path '*/.*'` (bash) to get a file tree.
    *   *Crucial Optimization:* It does **not** read file contents. It stores the *tree structure* in `STATE.yaml`.
    *   *Context Impact:* ~200 tokens (tree) vs ~20,000 tokens (full file read).

### The Sub-Agent: `towline-researcher` (Optional)
*   **Trigger:** Only if the user asks for "Brownfield Scan" or "Domain Research."
*   **Role:** The Scanner.
*   **Context Strategy:** Spawns via `Task()`. It reads code, summarizes architecture into `architecture.md`, and **dies**. The main session never sees the raw code it read, only the summary.

**Max 5x Optimization:**
*   **Standard:** Loading a project usually burns 15k-30k tokens immediately.
*   **Towline:** Burns ~2k tokens. You start with 99% capacity.

---

# Phase 2: Architecture & Requirements (`/dev:plan`)

**The Goal:** Convert abstract desires into concrete, executable Markdown specifications.

### The Skill: `skills/plan/SKILL.md`
1.  **Input:** Reads `REQUIREMENTS.md` (or creates it from chat) and `STATE.yaml`.
2.  **Orchestration:** Calculates how many "Waves" are needed based on dependency logic (e.g., DB $\to$ API $\to$ UI).
3.  **Delegation:** Spawns the Planner.

### The Agent: `towline-planner`
*   **Role:** The Architect.
*   **Input:** `REQUIREMENTS.md`, `STATE.yaml` (Pointer Map), and `config.yaml`.
*   **Prompt Constraint:** "Do not write code. Output a Markdown Plan (`PLAN.md`) with strictly formatted headers (`## Task 1`)."
*   **Output:** `phases/01-PLAN.md`.
    *   *Format:* Markdown Checkboxes (`- [ ]`) are token-cheap and universally understood.
    *   *Verification:* Defines *how* to verify the task (e.g., "Run `npm test auth`").

**Max 5x Optimization:**
*   The Orchestrator does not "think" about the architecture; it just reviews the generated plan file.
*   **Savings:** ~5k tokens (Planner reasoning) kept out of main context.

---

# Phase 3: The Build Factory (`/dev:build`)

**The Goal:** High-velocity execution using parallel Git Worktrees to prevent collisions. This is the most complex phase.

### The Skill: `skills/build/SKILL.md`
1.  **Analysis:** Reads `phases/01-PLAN.md`. Identifies tasks in **Wave 1** (Independent tasks).
2.  **Environment Prep (The Worktree Manager):**
    *   Executes `node scripts/worktree-manager.js setup agent-01`.
    *   Executes `node scripts/worktree-manager.js setup agent-02`.
    *   *Result:* Creates isolated folders `.worktrees/agent-01` and `.worktrees/agent-02`.
3.  **Fan-Out (Spawn):** Launches `Task(towline-executor)` for each active worktree.

### The Agent: `towline-executor`
*   **Role:** The Builder.
*   **Environment:** Locked to `.worktrees/agent-XX`.
*   **Input:**
    *   Specific Task Description from `PLAN.md`.
    *   Reference to `STATE.yaml`.
*   **Loop:**
    1.  **TDD:** Write failing test.
    2.  **Implement:** Write code to pass test.
    3.  **Commit:** `git commit -m "feat(auth): ..."` (Atomic).
    4.  **Log:** Append "Completed Step 1" to `../logs/status.log`.
*   **Termination:** Writes `SUMMARY.md` (What I did, files changed) and exits.

### The Fan-In (Merge)
*   **Skill Action:** The Orchestrator sees agents have exited.
*   **Merge:** Executes `node scripts/worktree-manager.js merge agent-01`.
    *   *Success:* Worktree deleted.
    *   *Conflict:* Spawns `towline-merge-resolver`.

### The Agent: `towline-merge-resolver` (Conditional)
*   **Role:** The Diplomat.
*   **Trigger:** Only on git conflict.
*   **Task:** Read conflict markers, strictly resolve based on "Incoming" vs "Current", commit, and exit.

**Max 5x Optimization:**
*   **Parallelism:** You get 2-3 units of work for the wall-clock time of 1.
*   **Safety:** Git Worktrees prevent the "Index Lock" errors that plague normal parallel agent attempts.
*   **Context:** The main session *never sees the code*. It only sees "Task Completed" in the log.

---

# Phase 4: Verification & UAT (`/dev:review`)

**The Goal:** Trust but verify. Ensure the merged code actually works on the main branch.

### The Skill: `skills/review/SKILL.md`
1.  **Scope:** Targets the `main` branch (or `develop`) *after* the wave merge.
2.  **Delegation:** Spawns `towline-verifier`.

### The Agent: `towline-verifier`
*   **Role:** Quality Control.
*   **Tools:** **Read-Only**. (Read, Bash, Grep). No Write tools allowed.
*   **Input:** `PLAN.md` (The promise) + `SUMMARY.md` (The claim).
*   **Action:**
    1.  Checks if files exist.
    2.  Runs the verification commands listed in the Plan.
    3.  Runs the full test suite (Integration tests).
*   **Output:** `VERIFICATION.md` (Pass/Fail report).

**Max 5x Optimization:**
*   Because the Verifier cannot *fix* code (which triggers long loops), it is fast and cheap. If it fails, it simply reports back, and the Orchestrator marks the task for a "Fix Wave" in the next Build cycle.

---

# Support Skills & Mechanisms

### 1. The Dashboard (`/dev:status`)
*   **Mechanism:** Reads `.planning/logs/status.log` (Tail last 10 lines) and `.planning/STATE.yaml`.
*   **Output:**
    ```text
    Phase: 2 (Auth) | Wave: 1 | Budget: 72%
    ------------------------------------------------
    [Agent-01] Writing tests for Login.tsx... (10s ago)
    [Agent-02] Debugging DB connection... (45s ago)
    ```
*   **Value:** Keeps the human in the loop without burning tokens on chat updates.

### 2. The Context Watchdog (Background)
*   **Script:** `scripts/context-watchdog.js` (Hooked to `PostToolUse`).
*   **Logic:**
    *   Checks `token_usage`.
    *   **< 80%:** Do nothing.
    *   **> 80%:**
        1.  **Block:** Prevent new heavy tool calls.
        2.  **Serialize:** Dump specific "Volatile Memory" (Current Task, Last Error) to `HANDOFF.yaml`.
        3.  **Alert:** "Session limit reached. Auto-saved. Run `/dev:begin` to resume."
*   **Value:** Prevents the "Context Rot" crash where the model becomes stupid and ruins the code.

### 3. The Debugger (`/dev:debug`)
*   **Agent:** `towline-debugger`.
*   **Role:** The Scientist.
*   **Workflow:**
    1.  User reports bug.
    2.  Agent hypothesizes.
    3.  Creates reproduction test case.
    4.  Fixes code.
    5.  Verifies fix.
*   **Persistence:** If the context fills during debugging, the Watchdog saves the *Hypothesis List* to `HANDOFF.yaml` so the next session doesn't repeat tested theories.

---

# Summary of Optimization for Max 5x

| Feature | Standard "Chat" Workflow | Towline v2 Workflow |
| :--- | :--- | :--- |
| **Initial Load** | Reads full file tree (~20k tokens) | Reads "Pointer" tree (~2k tokens) |
| **Planning** | Reasoning in main chat (Context Rot) | Sub-agent Reasoning (Zero Main Context) |
| **Execution** | Serial (1 task at a time) | **Parallel Waves** (2-3 tasks / message cycle) |
| **State** | Implicit (Chat History) | **Explicit** (`STATE.yaml` / `HANDOFF.yaml`) |
| **Cost Control** | "I hope I don't run out" | **Automated Watchdog** (Auto-save at 80%) |

This architecture turns Claude Code from a "Coding Assistant" into a "Coding Manager," utilizing the token budget for *management* while offloading *labor* to ephemeral, cheap contexts.