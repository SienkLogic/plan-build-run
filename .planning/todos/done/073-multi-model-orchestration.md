---
title: "Research: multi-model orchestration patterns"
status: done
priority: P4
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: research
---

## Goal

Research multi-model orchestration patterns for potential future Towline capabilities.

## Research Findings

### What ECC's Multi-Model System Does

ECC's CCG (Claude-Codex-Gemini) system routes tasks to specialized models:
- **Codex**: Backend logic, algorithms, performance-critical code
- **Gemini**: Frontend UI/UX, design systems, visual components
- **Claude**: Orchestrator and sovereign — all file writes go through Claude
- **Trust routing**: Backend decisions defer to Codex, frontend to Gemini
- **Dirty prototype refactoring**: External models produce rough prototypes, Claude refactors to production quality

### How This Maps to Towline

Towline's architecture already supports multi-model via the `models` config section:
```json
{
  "models": {
    "executor": "sonnet",
    "researcher": "sonnet",
    "planner": "sonnet",
    "verifier": "sonnet",
    "synthesizer": "haiku"
  }
}
```

This allows different Claude models per agent role but doesn't support non-Claude models or trust-routing.

### Potential Multi-Model Scenarios

1. **Research agents using web-focused models**: A future model optimized for web search/browsing could handle the researcher role more effectively.
2. **Code generation with specialized models**: If Anthropic releases a code-specialized model, executors could use it.
3. **Cost-optimized routing**: Use the cheapest model that can handle each task (already done via Haiku for synthesizer).

### Feasibility Assessment

**What would be needed:**
1. Abstract the Task() call to support non-Claude models (currently hardcoded to Claude Code's subagent system)
2. Add model-specific prompt formatting (each model family has different system prompt conventions)
3. Build trust-routing logic (which model's output to prefer for which domain)
4. Handle model-specific tool calling differences (each provider has different function calling formats)

**Blockers:**
1. Claude Code's Task() API only supports Claude models — multi-model would require building a custom orchestration layer outside of Claude Code's plugin system
2. No standardized cross-provider tool calling format
3. Quality control: non-Claude models can't be verified by Claude's existing verifier without round-tripping
4. Context isolation: Towline's subagent model assumes fresh Claude context windows; non-Claude models have different context limitations

### Cost/Latency Impact

- Cross-model calls add API latency (each model call is a separate HTTP request)
- Multiple provider API keys required
- Cost savings depend on per-model pricing at the time of implementation
- Debugging becomes harder with multi-provider error surfaces

## Recommendation: REJECT (for now)

**Verdict**: Not feasible within Claude Code's current plugin architecture.

**Reasoning**:
- Claude Code's Task() only supports Claude models — the fundamental plumbing doesn't exist
- Building a custom multi-model orchestration layer would be a separate project, not a Towline plugin feature
- The use cases (code-specialized models, web-focused models) are speculative — Anthropic's own model lineup may address these needs
- Towline's value proposition is context engineering, not model routing; focus should stay there

**If reconsidered later**: This becomes relevant when either (a) Claude Code adds multi-model Task() support, or (b) Towline evolves beyond a Claude Code plugin into a standalone agent framework. Neither is imminent.

## Acceptance Criteria

- [x] Research document with feasibility assessment
- [x] Clear recommendation on if/when to pursue — REJECT (not feasible in current architecture)
