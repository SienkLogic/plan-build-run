## Agent Context Enrichment

When spawning a Task() executor or other subagent, enrich the spawn prompt with project context if `features.rich_agent_prompts` is enabled in config.

### How to Use

Before spawning Task(), call the enrichment modules:

1. **Rich context** (from `lib/gates/rich-agent-context.js`):
   - `buildRichAgentContext(planningDir, config, 5000)` returns a markdown string with project summary, state, decisions, conventions.
   - Append this to the Task() prompt under a `## Project Context` header.

2. **Multi-phase plans** (from `lib/gates/multi-phase-loader.js`):
   - `loadMultiPhasePlans(planningDir, currentPhase, config)` returns plans from adjacent phases.
   - Include the current phase plans in full. Include adjacent phase plans as frontmatter summaries only (first 30 lines).

### Budget Control

- Rich context defaults to 5000 chars (~1250 tokens). Adjust via `budgetChars` parameter.
- Multi-phase loading is bounded by `workflow.max_phases_in_context` (default 3).
- If orchestrator context is above 50%, reduce budgetChars to 2500.
