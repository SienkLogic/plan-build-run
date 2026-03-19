# Phase 27 Decision: Roadmapper Agent

## Decision
**Outcome:** wire-up
**Rationale:** The planner's roadmap mode (Mode 4) covers only ~38% of the roadmapper's capabilities. Key gaps include the anti-enterprise philosophy, granularity calibration table, detailed phase identification methodology, STATE.md initialization, and REQUIREMENTS.md traceability updates. These are substantive workflow features, not just stylistic differences. The roadmapper was purpose-built for roadmap creation with guardrails the planner lacks. Wire-up is the correct path: update begin/SKILL.md Step 8 to spawn `pbr:roadmapper` and fix the broken template reference.

## Capability Comparison

| Capability | Roadmapper | Planner (roadmap mode) | Gap |
|-----------|-----------|----------------------|-----|
| Anti-enterprise philosophy | yes | no | Planner has no equivalent guardrails against PM theater |
| Requirements-drive-structure | yes | partial | Planner validates coverage but doesn't explicitly derive phases from requirements |
| Granularity calibration | yes | no | Planner has no coarse/standard/fine calibration table |
| Goal-backward success criteria | yes | partial | Planner has goal-backward methodology but less detailed for roadmap context |
| 100% coverage validation | yes | yes | Both require full requirement mapping |
| Phase identification steps | yes | no | Planner has no 4-step phase identification methodology |
| Milestone index generation | yes | partial | Planner has milestone index in fallback format but less prescribed |
| Per-phase REQ-IDs + Success Criteria | yes | partial | Planner includes in fallback format but roadmapper makes it a required field |
| Completed milestone collapse | yes | yes | Both support details/summary collapse |
| STATE.md initialization | yes | no | Planner does not write STATE.md; begin skill handles it inline after planner returns |
| REQUIREMENTS.md traceability update | yes | no | Planner does not update REQUIREMENTS.md traceability section |
| Structured returns (CREATED/REVISED/BLOCKED) | yes | partial | Planner uses PLANNING COMPLETE/FAILED, not roadmap-specific markers |
| Revision loop (Step 9) | yes | partial | Planner has general Revision Mode but not roadmap-specific revision |

**Coverage score:** 2 full (15.4%) + 6 partial at 50% (23.1%) + 5 none (0%) = 38.5% -- well below the 80% merge threshold.

## Stale References to Clean

- hooks/check-subagent-output.js: lines 272 (AGENT_OUTPUTS), 791-794 (begin:pbr:roadmapper learnings check), 991 (AGENT_TO_SKILL mapping), 1181 (AGENT_TO_SKILL mapping)
- plugins/pbr/scripts/check-subagent-output.js: lines 281 (AGENT_OUTPUTS), 802-805 (begin:pbr:roadmapper learnings check)
- hooks/lib/core.js: line 31 (known-agents list)
- plugins/pbr/scripts/lib/core.js: line 31 (known-agents list)

Note: With wire-up, the AGENT_OUTPUTS and AGENT_TO_SKILL entries are correct (roadmapper IS a real agent mapped to begin skill). The known-agents entries are also correct. Only the learnings check entries at lines 791-794/802-805 need verification that they still apply after wire-up.

## Broken Template Reference
- roadmapper.md line 277: `${CLAUDE_PLUGIN_ROOT}/templates/state.md` -- **missing**
- The file `plugins/pbr/templates/state.md` does not exist
- Correct template location: `plugins/pbr/skills/begin/templates/STATE.md.tmpl` (skill-local) or the legacy `plan-build-run/templates/state.md`
- Fix: Change roadmapper.md line 277 to reference `${CLAUDE_SKILL_DIR}/templates/STATE.md.tmpl` (since begin skill owns STATE.md writing) OR inline the STATE.md format directly in the roadmapper agent (since the roadmapper writes STATE.md as part of its Step 7)

## Action Plan for PLAN-02

Since outcome is **wire-up**:

1. **Update begin/SKILL.md Step 8**: Change `subagent_type: "pbr:planner"` to `subagent_type: "pbr:roadmapper"` for roadmap generation. Update the prompt template reference and completion markers to match roadmapper's structured returns (ROADMAP CREATED/REVISED/BLOCKED instead of PLANNING COMPLETE/FAILED).

2. **Fix template reference in roadmapper.md line 277**: Replace `${CLAUDE_PLUGIN_ROOT}/templates/state.md` with either `${CLAUDE_SKILL_DIR}/templates/STATE.md.tmpl` or inline the STATE.md structure. Decide based on whether the roadmapper should depend on the begin skill's template directory.

3. **Keep AGENT_OUTPUTS and AGENT_TO_SKILL mappings**: The existing entries in check-subagent-output.js (both copies) are correct for a wired-up roadmapper -- they map `pbr:roadmapper` to the `begin` skill.

4. **Keep known-agents list entries**: The `roadmapper` entry in core.js (both copies) is correct for a wired-up agent.

5. **Verify learnings check entries**: Confirm that the `begin:pbr:roadmapper` learnings check (lines 791-794 hooks, 802-805 plugin) still applies after wire-up.

6. **Update roadmap-prompt.md.tmpl**: The begin skill's roadmap prompt template may need updates to work with the roadmapper agent instead of the planner agent.

7. **Consider removing planner Mode 4**: After wire-up, the planner's roadmap mode becomes dead code. Either remove it or keep it as a fallback for edge cases where the roadmapper is not available.
