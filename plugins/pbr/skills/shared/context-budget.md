# Context Budget Rules

Standard rules for keeping orchestrator context lean. Reference this fragment in skills that spawn Task() subagents.

See also: `skills/shared/universal-anti-patterns.md` for the complete set of universal rules (context budget + file reading + behavioral rules).

---

## Universal Rules

Every skill that spawns agents or reads significant content must follow these rules:

1. **Never** read agent definition files (`agents/*.md`) — `subagent_type` auto-loads them
2. **Never** inline large files into Task() prompts — tell agents to read files from disk instead
3. **Read depth scales with context window** — check `context_window_tokens` in `.planning/config.json`:
   - At < 500000 tokens (default 200k): read only frontmatter, status fields, or summaries. Never read full SUMMARY.md, VERIFICATION.md, or RESEARCH.md bodies.
   - At >= 500000 tokens (1M model): MAY read full subagent output bodies when the content is needed for inline presentation or decision-making. Still avoid unnecessary reads.
4. **Delegate** heavy work to subagents — the orchestrator routes, it doesn't execute
5. **Before spawning agents**: If you've already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/pbr:pause` to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

## Read Depth by Context Window

| Context Window | Subagent Output Reading | SUMMARY.md | VERIFICATION.md | PLAN.md (other phases) |
|---------------|------------------------|------------|-----------------|------------------------|
| < 500k (200k model) | Frontmatter only | Frontmatter only | Frontmatter only | Current phase only |
| >= 500k (1M model) | Full body permitted | Full body permitted | Full body permitted | Current phase only |

**How to check:** Read `.planning/config.json` and inspect `context_window_tokens`. If the field is absent, treat as 200k (conservative default).

**Applies to:** build, plan, review skills — any skill that reads back subagent artifacts.

## Context Degradation Awareness

Quality degrades gradually before panic thresholds fire. Watch for these early warning signs:

- **Silent partial completion** — agent claims task is done but implementation is incomplete. Self-check catches file existence but not semantic completeness. Always verify agent output meets the plan's must_haves, not just that files exist.
- **Increasing vagueness** — agent starts using phrases like "appropriate handling" or "standard patterns" instead of specific code. This indicates context pressure even before budget warnings fire.
- **Skipped steps** — agent omits protocol steps it would normally follow. If an agent's success criteria has 8 items but it only reports 5, suspect context pressure.

When delegating to agents, the orchestrator cannot verify semantic correctness of agent output — only structural completeness. This is a fundamental limitation. Mitigate with must_haves.truths and spot-check verification.

## State Consolidation Impact

State consolidation (Phase 5) reduces core planning files from 5 to 3:
- CONTEXT.md is now merged into PROJECT.md ## Context section
- HISTORY.md is now merged into STATE.md ## History section
- This reduces per-phase context loading overhead — fewer files to read, same information

**File size estimates (post-consolidation):**
- PROJECT.md: ~2-4 KB (includes Context section)
- STATE.md: ~3-6 KB (includes History section)
- ROADMAP.md: ~3-8 KB (depending on phase count)
- config.json: ~1-2 KB

**Note:** PROJECT.md is larger now with the merged Context section. Factor this into context budget when loading project state.

## Customization

Skills should add skill-specific rules below the reference line. Common skill-specific additions:

- **build**: "Minimize reading executor output — read only SUMMARY.md frontmatter, not full content"
- **plan**: "Minimize reading subagent output — read only plan frontmatter for summaries"
- **review**: "Minimize reading subagent output — read only VERIFICATION.md frontmatter for summaries"
- **scan**: "Delegate ALL analysis to the 4 parallel codebase-mapper subagents"
- **quick**: "Never implement the task yourself — ALL code changes go through a spawned executor"
- **debug**: "Never perform investigation work yourself — delegate ALL analysis to the debugger subagent"

Format in the SKILL.md:

```markdown
## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- {Skill-specific rule 1}
- {Skill-specific rule 2}
```

## Agent Elapsed Time Estimates

When displaying agent spawn lines (e.g., "Spawning researcher..."), append a parenthetical estimate:

| Agent Type | Display Text | Estimate |
|------------|-------------|----------|
| researcher | Spawning researcher... | (est. 1-3 min) |
| planner | Spawning planner... | (est. 2-5 min) |
| executor | Spawning executor... | (est. 3-8 min) |
| verifier | Spawning verifier... | (est. 1-2 min) |
| codebase-mapper | Spawning codebase-mapper... | (est. 1-2 min) |
| plan-checker | Spawning plan-checker... | (est. 1-2 min) |
| integration-checker | Spawning integration-checker... | (est. 2-4 min) |
| debugger | Spawning debugger... | (est. 2-5 min) |
| general | Spawning agent... | (est. 1-4 min) |
| audit | Spawning audit... | (est. 2-4 min) |

**Usage**: In any skill that spawns Task() agents, prefix spawn displays with the agent name and append the estimate from this table. Example:

```
Spawning researcher... (est. 1-3 min)
Spawning planner... (est. 2-5 min)
[Wave 1: 3 plans in parallel] Spawning executors... (est. 3-8 min each)
```

Skills that spawn agents: build, plan, review, debug, scan, milestone, quick.
