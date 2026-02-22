# Cross-Agent Audit Summary

## Systemic Issues

### 1. Write Tool vs Read-Only Contradiction (P1)

**Affected agents**: verifier, integration-checker

Both agents are described as "read-only" (no Write/Edit tools) but their instructions say to WRITE output files (VERIFICATION.md, INTEGRATION-REPORT.md). Either:
- The orchestrator skill captures agent text output and writes the file (undocumented handoff), OR
- The tool lists are wrong and should include Write

The verifier at least has clear file output expectations with template references. Integration-checker additionally has `noFileExpected: true` in check-subagent-output.js, which contradicts its own instructions to produce INTEGRATION-REPORT.md.

**Recommendation**: Audit the review and milestone skills to determine which pattern is actually used. Then fix either the tool lists or the instructions to match reality.

### 2. Plan Filename Convention Mismatch (P1)

**Affected agents**: planner, executor (indirectly via gates)

Planner agent says `{phase}-{NN}-PLAN.md`. Gate regex (`/^PLAN.*\.md$/i`) requires files starting with "PLAN". MEMORY.md documents this as a known issue but the planner agent definition has NOT been fixed.

**Recommendation**: Fix planner agent to produce `PLAN-{NN}.md`. This is a live bug that causes gate failures.

### 3. No Gates for 6 of 10 Agents (P2)

**Agents with gates**: executor (5 gates), planner (2 gates), verifier (1 gate), general (1 gate, milestone only)

**Agents with NO gates**: plan-checker, researcher, debugger, codebase-mapper, synthesizer, integration-checker

While most ungated agents are read-only or low-risk, the debugger has full Write/Edit/Bash access with no gate validation. A debugger spawned in the wrong context could make untracked code changes.

**Recommendation**: Add advisory (not blocking) gates for debugger and researcher to warn when spawned outside expected skill contexts.

### 4. Template Dependency Without Fallback (P2)

**Affected agents**: ALL agents that reference templates (executor, planner, verifier, researcher, codebase-mapper, synthesizer, integration-checker)

Every agent that produces structured output references a `.tmpl` file via `${CLAUDE_PLUGIN_ROOT}/templates/`. If the template file is missing or unreadable, agents have no fallback format instructions. This creates a single point of failure.

**Recommendation**: Add minimal inline format (3-5 key sections) as fallback in each agent definition. Template adds detail; inline provides minimum viable structure.

### 5. Cross-Platform Time Tracking (P2)

**Affected agents**: executor

Executor uses `date +%s` for time tracking. This fails on native Windows (PowerShell). Other agents reference `date` implicitly. Since CI runs on Windows, this is a real failure path.

**Recommendation**: Use `node -e "console.log(Math.floor(Date.now()/1000))"` or delegate to pbr-tools.js.

### 6. Post-Execution Steps Are Highest Skip Risk (P2)

**Affected agents**: executor (SUMMARY.md, self-check), verifier (steps 8-9), debugger (fix protocol steps 5-8), planner (self-check)

Across all agents, the pattern is: core work is done well, but post-completion steps (summaries, validation, cleanup) are consistently the highest skip risk. This is the "I'm done, let me just return" cognitive shortcut.

**Recommendation**:
- Add CRITICAL markers before final artifact creation steps
- Expand check-subagent-output.js skill-specific checks to validate more post-completion artifacts
- Consider a universal "completion checklist" hook that fires on SubagentStop

### 7. Implicit Contracts Between Agents (P2)

**Key contracts not formally specified**:
- Researcher -> Synthesizer: confidence levels + source tags format
- Synthesizer -> Planner: `[NEEDS DECISION]` flag handling
- Executor -> Verifier: SUMMARY.md frontmatter schema (especially `provides`/`requires`/`must_haves`)
- Verifier -> Planner: gap format in VERIFICATION.md
- Integration-checker -> ???: who creates fix plans for integration issues?

Templates serve as implicit contracts for some handoffs, but the data formats within frontmatter are not formally specified anywhere.

**Recommendation**: Create a `references/agent-contracts.md` documenting the input/output schema each agent expects, with examples.

### 8. check-subagent-output.js Coverage Gaps (P3)

| Agent | Output Check | Gap |
|-------|-------------|-----|
| executor | SUMMARY*.md in phase/quick dir + commits field | Good |
| planner | PLAN*.md in phase dir | Good |
| verifier | VERIFICATION.md in phase dir | Good |
| researcher | Any .md in research/ | Too loose -- pre-existing files pass |
| synthesizer | Any .md in research/ or CONTEXT.md | Too loose -- pre-existing files pass |
| plan-checker | noFileExpected | Correct |
| integration-checker | noFileExpected | **Wrong if it should write INTEGRATION-REPORT.md** |
| debugger | Any .md in debug/ | Acceptable |
| codebase-mapper | Any .md in codebase/ | Acceptable |
| general | noFileExpected | Acceptable |

**Recommendation**: Add mtime-based recency checks for researcher and synthesizer. Resolve integration-checker contradiction.

### 9. Universal Anti-Patterns Are Duplicated (P3)

All 10 agents contain identical 12-item "Universal Anti-Patterns" sections. This is ~150 tokens per agent, consuming 1,500 tokens total across agents. Since agents get fresh context, they each need these rules -- but the duplication means any update must be made 10 times.

**Recommendation**: This is a maintenance concern, not a bug. Consider extracting to a shared reference file that agents are instructed to read, similar to how `references/plan-format.md` works. Trade-off: one extra Read per agent vs duplication.

## Priority Summary

| Priority | Count | Key Items |
|----------|-------|-----------|
| P1 | 3 | Write tool contradiction, plan filename bug, integration-checker noFileExpected |
| P2 | 10 | Missing gates for debugger, template fallbacks, cross-platform time, post-execution skip risk, agent contracts, synthesizer->planner handoff |
| P3 | 8 | check-subagent-output recency, anti-pattern duplication, slug uniqueness, single-phase warnings |
