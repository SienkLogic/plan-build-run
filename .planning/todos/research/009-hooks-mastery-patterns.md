# Research: Claude Code Hooks Mastery Patterns

> Research conducted: 2026-02-10
> Research date: 2026-02-10
> Mode: project-research
> Confidence: HIGH
> Sources consulted: 15
> Repository: https://github.com/disler/claude-code-hooks-mastery

## Executive Summary

The claude-code-hooks-mastery repository demonstrates comprehensive implementation of all 13 Claude Code lifecycle hooks using Python scripts with UV's single-file architecture. The repository provides production-ready patterns for security enforcement, observability, agent orchestration, and UX enhancement through text-to-speech and dynamic status displays.

Key architectural principles include: (1) exit code control flow for blocking vs. non-blocking hooks, (2) separation of concerns through isolated scripts, (3) graceful degradation with comprehensive error handling, (4) structured JSON logging for audit trails, and (5) builder/validator agent pairing for quality assurance.

For Towline, the most valuable patterns are: **PostToolUse validators** for gradual enforcement, **permission_request** auto-approval patterns, **enhanced SessionStart** context loading (git issues, project metadata), **structured error capture** in PostToolUseFailure, and **agent coordination patterns** from the team workflow.

## Repository Overview

**Structure**: The repository is organized into `.claude/` directory containing:
- `hooks/` — 13 lifecycle hook scripts (Python with UV inline dependencies)
- `hooks/validators/` — PostToolUse code quality validators (ruff, ty)
- `hooks/utils/` — Supporting utilities (LLM integration, TTS)
- `status_lines/` — 9 progressive terminal status display versions
- `output-styles/` — 8 response formatting templates
- `commands/` — Custom slash command definitions
- `agents/` — Sub-agent configurations (team builder/validator pattern)
- `logs/` — JSON event logs from all hook executions

**Philosophy**: Provides "deterministic (or non-deterministic) control over Claude Code's behavior" through hooks that intercept lifecycle events, enabling security enforcement, workflow automation, and enhanced observability without relying on language model decisions.

**Language/Runtime**: Python scripts using UV's single-file script architecture for dependency isolation and portability. Each hook declares dependencies inline (no virtual environment management needed).

## Hook Event Catalog

All 13 Claude Code hook events are implemented with descriptions below:

| Hook Event | When It Fires | Blocking? | Purpose |
|-----------|---------------|-----------|---------|
| **UserPromptSubmit** | Before Claude processes user prompt | Yes (exit 2) | Validate/enhance prompts, inject context, block dangerous requests [S3] |
| **PreToolUse** | Before any tool executes | Yes (exit 2) | Security enforcement, block dangerous commands (rm -rf, .env access) [S3] |
| **PostToolUse** | After tool succeeds | No | Log successful operations, convert transcripts, trigger validators [S3] |
| **PostToolUseFailure** | After tool fails | No | Capture structured error data, provide debugging context [S3] |
| **Notification** | On Claude Code notifications | No | Handle alerts, optional TTS announcements [S3] |
| **Stop** | When session ends normally | Yes (exit 2) | Generate completion messages, optional AI summaries, force continuation [S3] |
| **SubagentStop** | When subagent completes | Yes (exit 2) | Announce task completion, summarize work, force continuation [S3] |
| **SubagentStart** | When subagent spawns | No | Log subagent lifecycle, track agent usage [S3] |
| **PreCompact** | Before context compaction | No | Backup transcripts, preserve critical state [S3] |
| **SessionStart** | New/resumed session begins | No | Load development context (git status, issues, TODOs) [S3] |
| **SessionEnd** | Session terminates | No | Cleanup, session logging, final audit trail [S3] |
| **PermissionRequest** | Tool needs permission | Yes (can auto-allow) | Audit permissions, auto-approve safe operations [S3] |
| **Setup** | Repository initialization | No | First-run setup, dependency installation, project detection [S3] |

**Key insight** [S2]: Hooks are categorized by blocking capability:
- **Blocking hooks** (UserPromptSubmit, PreToolUse, Stop, SubagentStop): Can prevent actions via exit code 2
- **Post-execution hooks** (PostToolUse, PostToolUseFailure): Provide feedback after irreversible operations
- **Informational hooks** (Notification, PreCompact, SessionStart/End): Primarily for logging and monitoring

## Pattern Catalog

### 1. Security Enforcement (PreToolUse)

**Event**: PreToolUse
**Purpose**: Block dangerous commands before execution
**How it works** [S3]:
- Reads JSON from stdin containing `tool_name` and `tool_input`
- Normalizes commands (lowercase, whitespace consolidation)
- Applies multiple regex patterns per threat category:
  - `.env` file protection (blocks read/write/edit, permits .env.sample)
  - Destructive command prevention (rm -rf with recursive/force flags)
  - Dangerous path detection (root `/`, home `~`, wildcards `*`, parent `..`)
- Exit code 0 for allowed operations, exit code 2 for blocked (stderr message fed to Claude)

**Towline applicability**: **HIGH**
Towline's validate-commit.js already blocks invalid commits. Adding PreToolUse for .env protection and destructive commands would enhance security. Consider adding:
- Block direct edits to `.planning/STATE.md` by agents (must use state_update tool)
- Block force pushes unless explicitly requested
- Block deletion of phase directories

**Code pattern** (Python, from repo):
```python
# Source: [S3] pre_tool_use.py
if tool_name == "Bash":
    command = tool_input.get("command", "").lower()

    # Block .env access
    if re.search(r'\.env(?!\.sample)', command):
        error = {"decision": "block", "reason": "Access to .env files is blocked"}
        sys.stdout.write(json.dumps(error))
        sys.exit(2)

    # Block rm -rf patterns
    if re.search(r'\brm\s+.*-[a-z]*r[a-z]*f', command):
        error = {"decision": "block", "reason": "Destructive rm -rf command blocked"}
        sys.stdout.write(json.dumps(error))
        sys.exit(2)
```

### 2. Gradual Validation (PostToolUse Validators)

**Event**: PostToolUse (Write/Edit operations)
**Purpose**: Enforce code quality without blocking initial implementation
**How it works** [S3]:
- Triggers after Write/Edit tool succeeds (file already written)
- Runs linting/type checking (ruff, ty) on modified Python files
- Outputs JSON decision: `{}` (allow) or `{"decision": "block", "reason": "..."}` (retry)
- Blocking at this stage forces Claude to fix and retry the write

**Towline applicability**: **HIGH**
Towline's check-plan-format.js validates PLAN.md/SUMMARY.md structure after write. The gradual validation pattern (allowing initial write, then forcing fix) is already proven effective. Consider extending:
- Validate VERIFICATION.md format (must have Success/Failure Reason sections)
- Validate ROADMAP.md progress table integrity
- Run JSON schema validation on config.json writes

**Pattern demonstrated**: "Two-phase validation" — let the agent write first (preserves momentum), then force correction if quality gates fail. Better UX than blocking on PreToolUse.

**Code pattern** (Python, from repo):
```python
# Source: [S3] ruff_validator.py (PostToolUse hook)
file_path = input_data.get("tool_input", {}).get("file_path", "")
if not file_path.endswith(".py"):
    sys.exit(0)  # Only validate Python files

result = subprocess.run(
    ["uvx", "ruff", "check", file_path],
    capture_output=True, text=True, timeout=120
)

if result.returncode != 0:
    error = {
        "decision": "block",
        "reason": f"Lint check failed:\n{result.stdout[:500]}"
    }
    sys.stdout.write(json.dumps(error))
```

### 3. Permission Auto-Approval

**Event**: PermissionRequest
**Purpose**: Auto-approve safe read-only operations, audit others
**How it works** [S3]:
- Receives permission request via stdin (tool metadata)
- Defines safe tool categories: Read, Glob, Grep, safe Bash commands (`ls`, `cat` without redirection)
- Auto-approves with `{"behavior": "allow", "message": "Safe read-only operation"}` when `--auto-allow` flag set
- Logs all requests to `logs/permission_request.json` for audit

**Towline applicability**: **MEDIUM**
Towline doesn't currently use permission controls (assumes all tools allowed). This pattern could streamline agent workflows:
- Auto-approve Read/Glob/Grep for research/verifier agents
- Require explicit permission for Write/Edit/Bash in production mode
- Log all permission requests for workflow optimization analysis

**Code pattern** (Python, from repo):
```python
# Source: [S3] permission_request.py
SAFE_TOOLS = ["Read", "Glob", "Grep"]
SAFE_BASH_PATTERNS = [r"^ls\b", r"^cat\b(?!.*>)", r"^git\s+(status|log|diff)"]

if tool_name in SAFE_TOOLS:
    response = {
        "behavior": "allow",
        "message": f"Auto-approved safe operation: {tool_name}"
    }
    sys.stdout.write(json.dumps(response))
    sys.exit(0)
```

### 4. Enhanced SessionStart Context Loading

**Event**: SessionStart
**Purpose**: Enrich Claude's initial state with project context
**How it works** [S3]:
- Reads project files: `.claude/CONTEXT.md`, `TODO.md`, `.github/ISSUE_TEMPLATE.md` (first 1000 chars)
- Executes git commands: `git rev-parse --abbrev-ref HEAD`, `git status --porcelain` (uncommitted count)
- Queries GitHub issues: `gh issue list --limit 5` (if gh CLI available)
- Outputs as `{"additionalContext": "..."}` for Claude to consume at session start

**Towline applicability**: **HIGH**
Towline's progress-tracker.js already injects STATE.md sections, config, and notes. The mastery repo adds valuable sources:
- **Git branch + uncommitted file count**: Helps Claude understand uncommitted work
- **GitHub issues**: Could inject open issues from `.planning/todos/pending/` instead
- **Recent commit messages**: Parse `git log -5 --oneline` to show recent work

**Enhanced pattern for Towline**:
```javascript
// Add to progress-tracker.js buildContext()
const branch = execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf8'}).trim();
const uncommittedCount = execSync('git status --porcelain', {encoding: 'utf8'}).trim().split('\n').length;
parts.push(`\nGit: ${branch} (${uncommittedCount} uncommitted files)`);

// Parse recent commits for context
const recentCommits = execSync('git log -5 --oneline', {encoding: 'utf8'}).trim();
parts.push(`\nRecent commits:\n${recentCommits}`);
```

### 5. Structured Error Capture (PostToolUseFailure)

**Event**: PostToolUseFailure
**Purpose**: Create audit trail of tool failures with full context
**How it works** [S3]:
- Captures: tool name/ID/input, error object, session ID, cwd, permission mode, timestamp, transcript path
- Preserves raw input via `'raw_input': input_data` for unexpected data shapes
- Appends to `logs/post_tool_use_failure.json` (cumulative log)
- Silent error handling (JSON parse failures exit 0, ensuring agent continues)

**Towline applicability**: **MEDIUM**
Towline doesn't currently track tool failures systematically. This pattern would help:
- Debug agent failures (why did executor crash?)
- Identify problematic commands (which Bash commands fail most often?)
- Improve error messages (aggregate common failure patterns)

**Implementation for Towline**:
```javascript
// Create plugins/dev/scripts/log-tool-failure.js
// PostToolUseFailure hook
const data = JSON.parse(input);
const logEntry = {
  timestamp: new Date().toISOString(),
  tool: data.tool_name,
  error: data.error,
  context: {
    session_id: data.session_id,
    cwd: data.cwd,
    phase: extractCurrentPhase() // parse from STATE.md
  },
  raw: data
};
appendToLog('.planning/logs/tool-failures.jsonl', logEntry);
```

### 6. Transcript Backup Before Compaction

**Event**: PreCompact
**Purpose**: Preserve session state before context compression
**How it works** [S3]:
- Logs compaction event to `logs/pre_compact.json` (session ID, transcript path, trigger type)
- Copies transcript to `logs/transcript_backups/{session}_{trigger}_{timestamp}.jsonl`
- Captures custom instructions (preserved separately from transcript)
- Graceful error handling (allows compaction to proceed even if logging fails)

**Towline applicability**: **LOW**
Towline's context-budget-check.js already preserves STATE.md before compaction (higher priority than transcripts). Transcript backup could be useful for debugging but adds storage overhead. Consider:
- Backup last 3 transcripts only (auto-delete older)
- Only backup on manual compaction (skip auto-compaction)
- Store in `.planning/.transcripts/` instead of logs/

### 7. Builder/Validator Agent Pairing

**Event**: Agents (not a hook, but agent definition pattern)
**Purpose**: Separate implementation from verification for quality assurance
**How it works** [S2]:
- **Builder agent**: Focused executor with Write/Edit/Bash tools, single-task mandate, no coordination
- **Validator agent**: Read-only inspector with TaskGet/TaskUpdate, verifies acceptance criteria, reports pass/fail
- **Workflow**: Builder completes task → Validator inspects artifacts → Validator reports findings
- **Quality gates**: Validators run linting/type checking, ensure acceptance criteria met

**Towline applicability**: **HIGH**
Towline already has executor/verifier agents but they're sequential phases. The mastery repo's pattern is more granular:
- Executor completes a **plan** (not entire phase)
- Verifier checks that specific plan immediately
- Faster feedback loop than waiting until end of phase

**Consideration for Towline**: Current workflow (all plans → all verifications) batches work efficiently. The builder/validator pairing is better for **iterative development** where each unit of work must be verified before proceeding. Trade-off: more context switches vs. faster failure detection.

### 8. Stop Hook with AI-Generated Summaries

**Event**: Stop
**Purpose**: Generate context-aware completion messages
**How it works** [S3]:
- Attempts LLM-generated completion message via subprocess calls (OpenAI → Anthropic → Ollama)
- Fallback to predefined messages: "Work complete!", "All done!", "Task finished!"
- Optional TTS announcement via multi-tier provider selection
- Exit code 0 (graceful completion, not forcing continuation)

**Towline applicability**: **LOW**
Towline's auto-continue.js already chains commands based on workflow state. AI-generated summaries add polish but consume tokens and add latency. Consider:
- User preference flag: `announce_completion: true` in config.json
- TTS announcements only for milestone completion (not per-plan)
- Fallback to simple "Phase N complete" messages

### 9. Subagent Lifecycle Logging

**Event**: SubagentStart, SubagentStop
**Purpose**: Track agent spawning, completion, and task context
**How it works** [S3]:
- **SubagentStart**: Logs agent_id, timestamp to `logs/subagent_start.json`
- **SubagentStop**: Extracts task context from transcript (first user message), optionally generates AI summary, announces via TTS
- **Lock mechanism**: Acquires TTS lock to prevent concurrent announcements (30s timeout)
- **Debug logging**: Timestamps, agent IDs, task context, lock acquisition status

**Towline applicability**: **MEDIUM**
Towline's log-subagent.js already tracks agent lifecycle. The mastery repo adds:
- **Task context extraction**: Parse subagent transcript to understand what it did
- **AI summarization**: Optional LLM-generated summary of agent work
- **TTS lock pattern**: Prevents overlapping audio announcements

**Enhancement for Towline**:
```javascript
// In log-subagent.js SubagentStop handler
function extractTaskContext(transcriptPath) {
  const transcript = fs.readFileSync(transcriptPath, 'utf8');
  const lines = transcript.split('\n').filter(Boolean);
  // Find first user-type message
  for (const line of lines) {
    const msg = JSON.parse(line);
    if (msg.type === 'user' && msg.content) {
      return msg.content.substring(0, 200); // First 200 chars
    }
  }
  return 'No task context found';
}
```

### 10. Dynamic Status Line with Context Tracking

**Event**: Status line (not a lifecycle hook, but a display feature)
**Purpose**: Real-time session metrics in terminal
**How it works** [S3]:
- Reads JSON input from stdin containing current state (model, context_window, session info)
- Executes `git branch --show-current` to get current branch (1s timeout)
- Displays Powerline-style status bar with ANSI escape codes:
  - Model name
  - Git branch
  - Current directory (truncated to 20 chars)
  - Context usage percentage (color-coded: green <25%, yellow 50-75%, magenta 75%+)
- Uses Unicode separators (`\ue0b0`, `\ue0b1`) for visual segmentation

**Towline applicability**: **MEDIUM**
Towline doesn't currently provide real-time status display (status is shown via /dev:status command). The mastery repo's status line pattern is valuable for:
- Visual feedback during long agent runs
- Context budget awareness (prevent overruns)
- Current position indicator (phase/plan)

**Implementation consideration**: Claude Code status lines are configured in `.claude/settings.json` and run continuously. Adding Towline-specific metrics:
```javascript
// status-line.js (new script)
const data = JSON.parse(input);
const state = parseStateFile('.planning/STATE.md');
const phase = state.currentPhase || 'N/A';
const contextPct = data.context_window.used_percentage;

// Output: [Towline] Phase 3/12 | Context: 45% | Model: Opus 4.6
console.log(`\x1b[44m Towline \x1b[0m Phase ${phase} | Context: ${contextPct}% | Model: ${data.model.display_name}`);
```

### 11. Output Style Templates (Not a Hook Pattern)

**Event**: Response formatting (configured via output-styles/)
**Purpose**: Consistent, use-case-optimized response formats
**How it works** [S2]:
- 8 template files in `.claude/output-styles/`: bullet-points, html-structured, markdown-focused, table-based, tts-summary, ultra-concise, yaml-structured, genui
- **TTS-optimized format**: Direct address by name, <20 words, outcome-focused, conversational tone
- Templates loaded into Claude's system prompt to guide response structure

**Towline applicability**: **LOW**
Towline already has rich UI formatting in `references/ui-formatting.md` (TOWLINE ► banners, checkpoint boxes, spawning indicators). The mastery repo's contribution:
- **TTS-summary pattern**: "Dan, I've updated your API to support pagination. You can now query large datasets efficiently."
- **Ultra-concise pattern**: Strips all formatting for minimal output

**Consideration**: Towline's formatting is skill-specific (executor uses stage banners, verifier uses tables). Global output styles would reduce flexibility. Keep current approach.

### 12. Command-Based Workflow Orchestration

**Event**: Custom commands (not a hook, but slash command pattern)
**Purpose**: Define reusable workflows with agent delegation
**How it works** [S2]:
- Commands in `.claude/commands/` define workflows (plan.md, plan_w_team.md, build.md, etc.)
- **/plan_w_team workflow**:
  1. Parse user prompt (requirements analysis)
  2. Understand codebase (direct analysis, no subagents)
  3. Design solution (technical approach, architecture)
  4. Define team (identify required agents)
  5. Specify tasks (sequential/parallel with dependencies)
  6. Document plan (save to specs/ directory)
- **Orchestration model**: Main agent never modifies codebase directly; uses Task() and Task* tools to deploy team members
- **Coordination**: TaskCreate, TaskUpdate, TaskList, TaskOutput for progress tracking

**Towline applicability**: **HIGH**
Towline's skill structure is already command-based (/dev:begin, /dev:plan, /dev:build). The mastery repo's plan_w_team pattern demonstrates:
- **No direct implementation by orchestrator**: Orchestrator only plans and delegates (Towline executor already does this)
- **Parallel agent execution**: Multiple agents work simultaneously when tasks independent (Towline executes plans sequentially)
- **Task dependency tracking**: Explicit dependencies between tasks (Towline has implicit dependencies via plan order)

**Enhancement for Towline**: Consider parallel plan execution when plans are independent (e.g., "Add API endpoint" and "Write tests" could run concurrently if no shared files).

### 13. UserPromptSubmit for Context Injection

**Event**: UserPromptSubmit
**Purpose**: Enhance/validate prompts before Claude processes them
**How it works** [S3]:
- Reads user prompt from stdin (JSON with prompt text)
- Validation: Checks against `blocked_patterns` list (currently empty by default)
- Enhancement: Optionally generates agent name via LLM (Ollama > Anthropic)
- Logging: Stores all prompts to `logs/user_prompt_submit.json`
- Blocking: Exit code 2 + stderr message if validation fails

**Towline applicability**: **LOW**
Towline already injects context via SessionStart hook (progress-tracker.js). UserPromptSubmit blocking is useful for:
- Preventing users from asking agents to skip verification
- Blocking requests to modify .planning/ files directly
- Enforcing workflow discipline (e.g., "You must run /dev:plan before /dev:build")

**Implementation consideration**: UserPromptSubmit runs on **every** prompt, including follow-ups. Blocking follow-ups could frustrate users. Use sparingly for critical workflow violations only.

## Novel Techniques Not in Towline

### 1. PostToolUse Validators for Incremental Quality Gates

**Pattern**: Ruff/Ty validators run after Write operations, allowing initial implementation then forcing correction.
**Why novel**: Towline's check-plan-format.js validates structure but doesn't enforce retries. The mastery repo's validators **block completion** via `{"decision": "block"}`, forcing Claude to fix and rewrite.
**Towline benefit**: HIGH — extend to VERIFICATION.md format, ROADMAP.md integrity, config.json schema validation.

### 2. Permission Auto-Approval with Audit Trail

**Pattern**: Auto-approve safe tools (Read, Glob, Grep), log all requests for analysis.
**Why novel**: Towline assumes all tools allowed. Permission controls would enable production-safe agent execution.
**Towline benefit**: MEDIUM — useful for production deployments, agent workflow optimization.

### 3. Git Integration in SessionStart

**Pattern**: Load branch name, uncommitted file count, recent commits at session start.
**Why novel**: Towline injects STATE.md but not git context. Git context helps Claude understand uncommitted work.
**Towline benefit**: HIGH — simple addition to progress-tracker.js with immediate value.

### 4. Structured Error Logging (PostToolUseFailure)

**Pattern**: Capture all tool failures with full context (tool name, error, session ID, cwd, timestamp).
**Why novel**: Towline doesn't systematically track failures. Error log would enable failure pattern analysis.
**Towline benefit**: MEDIUM — valuable for debugging agent issues, improving error messages.

### 5. TTS Lock Mechanism

**Pattern**: Acquire lock before TTS announcement, timeout after 30s, prevent concurrent audio.
**Why novel**: Prevents overlapping audio when multiple agents complete simultaneously.
**Towline benefit**: LOW — Towline doesn't currently use TTS, but pattern is useful if added.

### 6. Task Context Extraction from Subagent Transcripts

**Pattern**: Parse subagent transcript to extract first user message (task description), log for debugging.
**Why novel**: Towline logs agent spawn/stop but not task context. Context extraction helps debug agent failures.
**Towline benefit**: MEDIUM — parse subagent transcript to understand what executor/verifier did.

### 7. Builder/Validator Immediate Feedback Loop

**Pattern**: Builder completes one unit of work → validator checks immediately → feedback within same session.
**Why novel**: Towline's verifier runs after all plans complete (batched). Immediate feedback reduces rework.
**Towline benefit**: HIGH for iterative workflows, LOW for Towline's current batch-oriented approach.

### 8. AI-Generated Completion Messages

**Pattern**: Stop hook calls LLM to generate context-aware completion summary.
**Why novel**: Adds polish but consumes tokens/time.
**Towline benefit**: LOW — auto-continue.js already chains commands; AI summaries are nice-to-have.

### 9. Dynamic Status Line with Context Budget

**Pattern**: Real-time terminal status bar showing model, git branch, directory, context usage percentage.
**Why novel**: Visual feedback during long agent runs, prevents context overruns.
**Towline benefit**: MEDIUM — helps users track progress, especially during comprehensive depth.

### 10. Setup Hook for First-Run Initialization

**Pattern**: Detect project type (Node, Python, Rust), install dependencies, check tool availability.
**Why novel**: Automates onboarding for new projects.
**Towline benefit**: LOW — Towline expects users to run /dev:begin manually; Setup hook would auto-initialize.

## Key Takeaways

### 1. Exit Code 2 is the Control Primitive

**Insight** [S2]: Exit code 2 in PreToolUse/UserPromptSubmit hooks blocks execution and feeds stderr back to Claude. Exit code 0 allows operation. This is the fundamental control mechanism — not LLM decisions, but deterministic hook logic.

**Action for Towline**: Towline's validate-commit.js already uses exit code 2 correctly. Extend this pattern to:
- Block .env file access (new PreToolUse hook)
- Block force pushes (validate-commit.js enhancement)
- Block direct STATE.md edits by agents (new PreToolUse hook)

### 2. PostToolUse Validators Enable Gradual Enforcement

**Insight** [S3]: Blocking on PreToolUse prevents implementation momentum. PostToolUse validators allow write to succeed, then force correction if quality gates fail. Better UX — agent sees progress, then fixes issues.

**Action for Towline**: Extend check-plan-format.js to **block and retry** (not just log warning):
```javascript
if (!isValidFormat) {
  const output = {decision: 'block', reason: 'PLAN.md missing required sections...'};
  process.stdout.write(JSON.stringify(output));
  process.exit(2); // Force retry
}
```

### 3. SessionStart Context Injection is Underutilized

**Insight** [S3]: Towline injects STATE.md but misses git context (branch, uncommitted files, recent commits). The mastery repo shows git integration is low-effort, high-value.

**Action for Towline**: Add to progress-tracker.js:
```javascript
const branch = execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf8'}).trim();
const uncommitted = execSync('git status --porcelain', {encoding: 'utf8'}).trim().split('\n').length;
const recentCommits = execSync('git log -5 --oneline', {encoding: 'utf8'}).trim();
parts.push(`\nGit: ${branch} (${uncommitted} uncommitted)\n${recentCommits}`);
```

### 4. Permission Controls Scale Agent Workflows

**Insight** [S3]: Auto-approving Read/Glob/Grep eliminates permission prompts for research/verifier agents while maintaining audit trail. Production-safe agent execution requires permission gates.

**Action for Towline**: Add `permission_mode` config option:
- `unrestricted`: Current behavior (all tools allowed)
- `safe`: Auto-approve read-only, require permission for write/bash
- `audit`: Log all tool usage, allow all (for workflow optimization analysis)

### 5. Structured Logging Enables Post-Hoc Analysis

**Insight** [S3]: All 13 hooks append JSON to logs/ directory. This creates audit trail for debugging, compliance, workflow optimization. The mastery repo shows systematic logging pays dividends.

**Action for Towline**: Create `.planning/logs/` directory, add PostToolUseFailure hook:
```javascript
// log-tool-failure.js (PostToolUseFailure hook)
const logEntry = {
  timestamp: new Date().toISOString(),
  tool: data.tool_name,
  error: data.error,
  phase: extractCurrentPhase(),
  raw: data
};
fs.appendFileSync('.planning/logs/tool-failures.jsonl', JSON.stringify(logEntry) + '\n');
```

### 6. Builder/Validator Pairing Trades Batching for Feedback Speed

**Insight** [S2]: The mastery repo's builder/validator pattern validates each unit of work immediately. Towline's batch approach (all plans → all verifications) is more efficient but delays failure detection. Trade-off depends on workflow type.

**Action for Towline**: Offer `verification_mode` config option:
- `batch`: Current behavior (verify all plans after execution)
- `immediate`: Verify each plan after completion (slower, faster feedback)

### 7. PreCompact is the Last Chance to Save State

**Insight** [S3]: Context compaction is lossy — transcripts compressed, custom instructions may be trimmed. PreCompact hook is final opportunity to preserve critical state.

**Action for Towline**: Towline's context-budget-check.js already preserves STATE.md. Consider extending:
- Backup `.planning/.hook-log` (preserve audit trail)
- Backup current phase's PLAN.md/SUMMARY.md (in case agent references it post-compaction)
- Log compaction events to `.planning/logs/compaction.jsonl`

### 8. Subagent Transcript Parsing Reveals Task Context

**Insight** [S3]: Parsing subagent transcripts to extract first user message provides task context for debugging. When an agent fails, knowing *what it was asked to do* is essential.

**Action for Towline**: Enhance log-subagent.js to parse transcript:
```javascript
function extractTaskContext(transcriptPath) {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      const msg = JSON.parse(line);
      if (msg.type === 'user') return msg.content.substring(0, 200);
    }
  } catch (_e) {}
  return null;
}
```

### 9. Status Lines Require Continuous Execution

**Insight** [S3]: Status lines run on every tool use, reading stdin for current state. Adds observability but requires careful performance optimization (1s git timeout, minimal processing).

**Action for Towline**: Consider status line for long-running operations only:
- Activate during /dev:build (shows "Phase 3/12, Plan 2/4, Context 45%")
- Deactivate during /dev:status (status already shown in command output)
- Config option: `status_line_enabled: false` for users who don't want it

### 10. Hook Architecture Enables Incremental Adoption

**Insight** [S2]: Each hook is independent — can add one at a time without affecting others. The mastery repo's structure (isolated scripts, clear event boundaries) enables experimentation without risk.

**Action for Towline**: Prioritize hooks by value/effort:
1. **High value, low effort**: Git integration in SessionStart (5 LOC), PostToolUse validators for VERIFICATION.md
2. **High value, medium effort**: Permission auto-approval, structured error logging
3. **Medium value, high effort**: Dynamic status line, AI-generated summaries

## Implementation Priority for Towline

### Immediate (Next Sprint)

1. **Git integration in progress-tracker.js** — 15 minutes, immediate value
2. **PostToolUse blocking for VERIFICATION.md** — 30 minutes, prevents malformed verifications
3. **Structured error logging (PostToolUseFailure hook)** — 1 hour, enables failure analysis

### Near-term (Within 2 Sprints)

4. **Permission auto-approval pattern** — 2 hours, enables production-safe agent execution
5. **PreToolUse .env blocking** — 30 minutes, prevents credential leaks
6. **Subagent transcript parsing** — 1 hour, improves debugging

### Long-term (Future Milestones)

7. **Dynamic status line** — 4 hours, requires UI/UX design decisions
8. **Builder/validator immediate feedback** — 8 hours, requires workflow refactor
9. **AI-generated completion summaries** — 2 hours, polish feature (low ROI)
10. **Setup hook for auto-initialization** — 4 hours, changes onboarding flow (UX decision needed)

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S1 | Official Docs | N/A (no official hooks docs found) | N/A |
| S2 | GitHub | https://github.com/disler/claude-code-hooks-mastery README.md | HIGH |
| S3 | GitHub | Individual hook scripts from repository | HIGH |
| S4 | Towline Source | plugins/dev/scripts/*.js (for comparison) | HIGH |

---

**Research complete.** Next step: Review with maintainer to prioritize implementation. Recommend starting with git integration (immediate value, minimal effort) and PostToolUse blocking for VERIFICATION.md (prevents downstream issues).
