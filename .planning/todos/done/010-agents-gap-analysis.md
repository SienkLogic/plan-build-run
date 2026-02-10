---
title: "Gap analysis: Towline agents vs GSD agents"
status: done
priority: P2
source: user-request
created: 2026-02-10
completed: 2026-02-10
---

## Goal

Review GSD's agents and identify what Towline needs to add or rebuild.

## Agent Mapping

### GSD (11 agents) → Towline (10 agents)

| GSD Agent | Towline Equivalent | Coverage |
|-----------|-------------------|----------|
| gsd-codebase-mapper | towline-codebase-mapper | Full — same role |
| gsd-debugger | towline-debugger | Full — same role |
| gsd-executor | towline-executor | Full — same role |
| gsd-integration-checker | towline-integration-checker | Full — same role |
| gsd-phase-researcher | towline-researcher (Mode 2: Phase Research) | Full — Towline uses modal agent |
| gsd-plan-checker | towline-plan-checker | Full — same role |
| gsd-planner | towline-planner | Full — same role |
| gsd-project-researcher | towline-researcher (Mode 1: Project Research) | Full — Towline uses modal agent |
| gsd-research-synthesizer | towline-synthesizer | Full — same role |
| gsd-roadmapper | towline-planner (Roadmap Mode) | Full — Towline uses modal agent |
| gsd-verifier | towline-verifier | Full — same role |
| *(no equivalent)* | towline-general | Towline-only — ad-hoc tasks |

### Architectural Difference

GSD uses **dedicated agents** (11 separate files, one role each). Towline uses **modal agents** — the researcher handles both project-level and phase-level research via mode switching, and the planner handles both roadmapping and phase planning. This means:

- GSD: 11 agents, each single-purpose → simpler per-agent prompts, more files to maintain
- Towline: 10 agents, some multi-modal → fewer files, richer per-agent prompts

Neither approach is strictly better. Towline's modal approach keeps context cleaner since Claude Code auto-loads the full agent file regardless — having 2 agents that each do 1 thing vs 1 agent that does 2 things loads the same amount of prompt text per spawn.

## Gap Assessment

### Gaps in the "Known Gaps" section of the original todo

1. **Towline Phase Checker** — Not needed. GSD doesn't have this either. The `towline-plan-checker` covers pre-execution plan verification, and `towline-verifier` covers post-execution phase verification. There's no gap.

2. **Towline Phase Researcher** — Already covered. `towline-researcher` Mode 2 (Phase Research) handles this. It produces RESEARCH.md consumed by the planner, exactly like `gsd-phase-researcher`.

3. **Towline Roadmapper** — Already covered. `towline-planner` has a Roadmap Mode spawned by `/dev:begin` Step 8. It produces ROADMAP.md with phase breakdown, success criteria, and requirement mapping.

### Tool Gaps Worth Noting

| Tool | GSD agents that use it | Towline agents that use it |
|------|----------------------|--------------------------|
| WebSearch | debugger, phase-researcher, project-researcher | None |
| WebFetch | phase-researcher, project-researcher, planner | None |
| mcp__context7__* | phase-researcher, project-researcher, planner | None |

**Assessment**: GSD's researchers and planner can query external documentation (Context7 MCP) and search the web. Towline's researcher has the iterative retrieval protocol but relies on local codebase analysis only. Adding WebSearch/WebFetch to the researcher would be a **low-effort, medium-value improvement** — useful for greenfield projects where the codebase doesn't yet contain the answers.

### Other Differences

- **GSD uses `color:` frontmatter** for UI display (cyan, orange, etc.). Towline doesn't — the status line and log-subagent script don't use per-agent colors. Low value to add.
- **No GSD agent specifies `model:`**. Towline explicitly sets model per agent (sonnet/haiku/inherit). Towline's approach is better — it enables cost-optimized routing (e.g., synthesizer on haiku).
- **No GSD agent has `Task` tool**. Neither do Towline agents. Both architectures correctly prevent agents from spawning sub-agents (only skills orchestrate).

## Recommendations

1. **No new agents needed.** All 11 GSD roles are covered by Towline's 10 agents. The `towline-general` agent is Towline-only and useful for ad-hoc `/dev:quick` tasks.

2. **Consider adding WebSearch/WebFetch to towline-researcher** (separate todo if desired). Would improve greenfield project research quality.

3. **No structural changes needed.** The modal agent pattern is a valid architectural choice that keeps the agent count lower without losing capability.

## Acceptance Criteria

- [x] Complete mapping of GSD agents to Towline agents
- [x] Gap list with priority and rationale for each — no gaps found
- [x] Draft agent frontmatter for any new agents recommended — none needed
- [x] Notes on which skills need updating to spawn new agents — none needed
