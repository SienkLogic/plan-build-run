# Development Guide — Internal Architecture

These are internal architecture documents for Plan-Build-Run contributors. They describe how agents interact through files on disk and how skills coordinate subagent delegation.

---

## Agent Interaction Map

This section shows how Plan-Build-Run agents communicate through files on disk. Agents never message each other directly — they read and write shared files in `.planning/`.

### Interaction Graph

```
                    User / Orchestrator
                     |           ^
                     v           |
              +--------------+   |
              |  researcher  |---+---> planner
              +--------------+         |    ^
                     |                 v    |
              +--------------+   +--------------+
              | synthesizer  |   | plan-checker |
              +--------------+   +--------------+
                                       |
                                       v
                                 +-----------+
                                 |  executor  |
                                 +-----------+
                                       |
                                       v
                                 +-----------+
                                 |  verifier  |----> planner (gap closure)
                                 +-----------+
                                       |
                                       v
                              +--------------------+
                              | integration-checker|
                              +--------------------+
```

### Per-Agent Interaction Details

#### researcher

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | User/Orchestrator | Research topics, CONTEXT.md constraints, phase goals |
| Produces for | planner | Research documents with technology details and recommendations |
| Produces for | synthesizer | Research documents to be combined |
| Produces for | User | Direct reading for decision-making |

#### synthesizer

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | researcher | Research documents to synthesize |
| Receives from | Orchestrator | Paths to research documents, synthesis request |
| Produces for | planner | SUMMARY.md as consolidated research input for planning |
| Produces for | User | High-level project/phase research overview |

#### planner

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | researcher | Research documents with technology details and recommendations |
| Receives from | plan-checker | Issue reports requiring plan revision |
| Receives from | verifier | VERIFICATION.md reports requiring gap closure plans |
| Receives from | User/Orchestrator | Phase goals, CONTEXT.md, planning requests |
| Produces for | plan-checker | Plan files for quality verification |
| Produces for | executor | Plan files for execution |
| Produces for | verifier | Must-have definitions for verification (embedded in plan frontmatter) |

#### plan-checker

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Plan files to check, phase context |
| Receives from | planner | Newly created or revised plan files |
| Produces for | planner | Issue reports for revision |
| Produces for | Orchestrator/User | Pass/fail decision on plan quality |

#### executor

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Plan files to execute, continuation instructions |
| Receives from | planner | The plans themselves (indirectly, via files) |
| Produces for | verifier | SUMMARY.md for verification, committed code for inspection |
| Produces for | Orchestrator | Checkpoint responses, completion status |
| Produces for | planner | Deferred ideas (in SUMMARY.md) for future planning |

#### verifier

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Phase to verify, timing trigger |
| Receives from | executor | Completed work (via codebase and SUMMARY.md) |
| Receives from | Previous VERIFICATION.md | Gaps to re-check (in re-verification mode) |
| Produces for | planner | Gap list for gap-closure planning (via VERIFICATION.md) |
| Produces for | Orchestrator | Phase status (passed/gaps_found/human_needed) |
| Produces for | User | Human verification items with specific test instructions |

#### integration-checker

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Phases to check, trigger event (milestone/review) |
| Receives from | verifier | Phase-level verification reports (for context on per-phase status) |
| Produces for | planner | Integration gap list for cross-phase fix plans |
| Produces for | Orchestrator | Integration status for milestone decisions |
| Produces for | User | Integration health overview and security issues |

#### debugger

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Bug reports, symptoms, reproduction steps |
| Receives from | executor | Errors encountered during execution (via checkpoint responses) |
| Receives from | verifier | Issues discovered during verification |
| Produces for | Orchestrator/User | Root cause analysis, fix commits, checkpoint requests |
| Produces for | planner | Findings requiring architectural changes |
| Produces for | executor | Simple fix instructions for executor to apply |

#### codebase-mapper

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Focus area to analyze, project path |
| Receives from | researcher | May be invoked alongside researcher for new projects |
| Produces for | planner | STACK.md, ARCHITECTURE.md, STRUCTURE.md for informed planning |
| Produces for | executor | CONVENTIONS.md for code style, TESTING.md for test patterns |
| Produces for | verifier | All documents as reference for what "correct" looks like |
| Produces for | User | Direct reading for project understanding |

#### general

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Ad-hoc task instructions |
| Produces for | Orchestrator/User | Task output (files, formatting, config changes) |

---

## Subagent Coordination

Patterns for spawning, monitoring, and consuming output from Task() subagents. Used by skills that delegate work to specialized agents.

### When to Spawn vs Inline

| Condition | Action |
|-----------|--------|
| >50 lines of analysis or code generation needed | Spawn a subagent |
| Simple state read or file write | Do it inline |
| Multiple files need reading for a decision | Spawn — protect orchestrator context |
| User interaction needed (questions, confirmations) | Do it inline |
| Work needs a fresh context window | Spawn |

### Spawning Pattern

Always use the modern subagent_type syntax. Agent definitions are auto-loaded by Claude Code — never inline them.

```
Task({
  subagent_type: "pbr:{agent-name}",
  prompt: <structured prompt with context>
})
```

#### Structured Input Format

Provide context to subagents using tagged blocks:

```xml
<phase_context>
Phase: {NN}-{slug}
Goal: {goal from ROADMAP.md}
</phase_context>

<prior_work>
{Frontmatter from relevant SUMMARY.md files}
</prior_work>

<instructions>
{Specific instructions for this agent invocation}
</instructions>
```

#### What NOT to Include in Spawn Prompts

- Full agent definition text (auto-loaded via subagent_type)
- Full SUMMARY.md bodies (agent reads from disk)
- Full PLAN.md bodies unless the agent needs them (executor does, verifier doesn't)
- Content from unrelated phases

### Reading Output

After a subagent completes, read its output file — but only what you need.

| Output Type | Orchestrator Reads | Agent Reads Full |
|-------------|-------------------|-----------------|
| SUMMARY.md | Frontmatter only (status, key_files, commits) | Yes, from disk |
| VERIFICATION.md | Frontmatter only (status, must_haves_passed/failed) | Yes, from disk |
| PLAN.md | Frontmatter only (wave, depends_on, files_modified) | Yes, from disk |
| RESEARCH.md | Frontmatter + recommendations section | Yes, from disk |
| Debug files | Latest hypothesis + result only | Yes, from disk |

#### Frontmatter-Only Read Pattern

```
Read the file, extract YAML frontmatter between --- markers.
Parse: status, key_files, commits, provides.
Do NOT read past the closing --- of frontmatter.
```

### State Update After Agent Completion

After reading agent output, update STATE.md with minimal information:

1. Update phase/plan status
2. Record completion timestamp
3. Note any blockers or warnings from frontmatter
4. Do NOT copy agent output into STATE.md

### Error Handling

| Scenario | Action |
|----------|--------|
| Agent times out | Report to user, suggest retry |
| Agent produces no output file | Report failure, check for partial work |
| Output file has `status: failed` | Read failure details, present to user |
| Agent reports warnings | Continue but show warnings in completion summary |

#### Retryable vs Fatal

- **Retryable**: Timeout, transient file errors, partial completion
- **Fatal**: Missing plan files, invalid state, circular dependencies
- **User decision**: Verification failures, ambiguous requirements

### Context Budget Impact

Each subagent coordination step has a token cost in the orchestrator:

| Step | Approximate Cost |
|------|-----------------|
| Reading state before spawn | 200-500 tokens |
| Constructing spawn prompt | 500-1000 tokens |
| Reading output frontmatter | 100-300 tokens |
| Updating STATE.md | 200-400 tokens |
| **Total per agent cycle** | **1,000-2,200 tokens** |

Compare to inlining the same work: 5,000-20,000 tokens. Delegation saves 3-10x.
