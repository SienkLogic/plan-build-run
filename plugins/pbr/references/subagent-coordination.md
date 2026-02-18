# Subagent Coordination Reference

Patterns for spawning, monitoring, and consuming output from Task() subagents. Used by skills that delegate work to specialized agents.

---

## When to Spawn vs Inline

| Condition | Action |
|-----------|--------|
| >50 lines of analysis or code generation needed | Spawn a subagent |
| Simple state read or file write | Do it inline |
| Multiple files need reading for a decision | Spawn — protect orchestrator context |
| User interaction needed (questions, confirmations) | Do it inline |
| Work needs a fresh context window | Spawn |

---

## Spawning Pattern

Always use the modern subagent_type syntax. Agent definitions are auto-loaded by Claude Code — never inline them.

```
Task({
  subagent_type: "pbr:{agent-name}",
  prompt: <structured prompt with context>
})
```

### Structured Input Format

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

### What NOT to Include in Spawn Prompts

- Full agent definition text (auto-loaded via subagent_type)
- Full SUMMARY.md bodies (agent reads from disk)
- Full PLAN.md bodies unless the agent needs them (executor does, verifier doesn't)
- Content from unrelated phases

---

## Reading Output

After a subagent completes, read its output file — but only what you need.

| Output Type | Orchestrator Reads | Agent Reads Full |
|-------------|-------------------|-----------------|
| SUMMARY.md | Frontmatter only (status, key_files, commits) | Yes, from disk |
| VERIFICATION.md | Frontmatter only (status, must_haves_passed/failed) | Yes, from disk |
| PLAN.md | Frontmatter only (wave, depends_on, files_modified) | Yes, from disk |
| RESEARCH.md | Frontmatter + recommendations section | Yes, from disk |
| Debug files | Latest hypothesis + result only | Yes, from disk |

### Frontmatter-Only Read Pattern

```
Read the file, extract YAML frontmatter between --- markers.
Parse: status, key_files, commits, provides.
Do NOT read past the closing --- of frontmatter.
```

---

## State Update After Agent Completion

After reading agent output, update STATE.md with minimal information:
1. Update phase/plan status
2. Record completion timestamp
3. Note any blockers or warnings from frontmatter
4. Do NOT copy agent output into STATE.md

---

## Error Handling

| Scenario | Action |
|----------|--------|
| Agent times out | Report to user, suggest retry |
| Agent produces no output file | Report failure, check for partial work |
| Output file has `status: failed` | Read failure details, present to user |
| Agent reports warnings | Continue but show warnings in completion summary |

### Retryable vs Fatal

- **Retryable**: Timeout, transient file errors, partial completion
- **Fatal**: Missing plan files, invalid state, circular dependencies
- **User decision**: Verification failures, ambiguous requirements

---

## Context Budget Impact

Each subagent coordination step has a token cost in the orchestrator:

| Step | Approximate Cost |
|------|-----------------|
| Reading state before spawn | 200-500 tokens |
| Constructing spawn prompt | 500-1000 tokens |
| Reading output frontmatter | 100-300 tokens |
| Updating STATE.md | 200-400 tokens |
| **Total per agent cycle** | **1,000-2,200 tokens** |

Compare to inlining the same work: 5,000-20,000 tokens. Delegation saves 3-10x.
