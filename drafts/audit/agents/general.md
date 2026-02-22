# Audit: pbr:general

## Agent Overview
- Lines: 94 | Model: inherit | Tools: Read, Write, Edit, Bash, Glob, Grep
- Spawned by: `/pbr:quick`, `/pbr:milestone` (complete operation), ad-hoc tasks
- Gate validation: `checkMilestoneCompleteGate` (milestone context only)
- Output validation: `check-subagent-output.js` marks as `noFileExpected: true`

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| When You're Used | High | Low | 4 use cases listed |
| Project Awareness | High | Low | Directory structure reference is helpful for fresh context |
| Self-Escalation | High | Med | "30% context usage" is self-assessed; LLM may not track accurately |
| Guidelines (7 items) | High | Low | Clear and concise |
| Anti-Patterns | High | Low | Good escalation rules |

## Output Format Gaps
1. **noFileExpected but may create files**: General agent has Write/Edit tools and may create files as part of ad-hoc tasks. `check-subagent-output.js` won't validate any output. This is correct since general is a wildcard agent, but means there's zero post-completion validation. **Acceptable trade-off** given the agent's ad-hoc nature.
2. **No output format specified**: General agent produces whatever the task requires. No template or structure. This is intentional for a utility agent.

## Gate Coverage Gaps
1. **Milestone complete gate only**: General is gated only in milestone context. For quick tasks, the executor gate fires (since quick spawns executor, not general -- but general IS listed in quick use cases). **Clarify**: Does `/pbr:quick` spawn general or executor? If both depending on task complexity, gates may not cover all paths.
2. **No scope limitation gate**: General has all tools (Read, Write, Edit, Bash) but self-escalation is prompt-only. Could modify files extensively without hitting any gate. **Mitigation**: Anti-pattern "DO NOT take on large implementation tasks" but no enforcement.

## Cognitive Load Risks
1. **Self-escalation thresholds**: "30% context usage" and ">3 files to create/modify" are self-assessed. LLM is unlikely to accurately track context usage. **Mitigation**: `suggest-compact.js` and `track-context-budget.js` hooks provide external tracking, but they operate on the orchestrator, not the subagent.
2. **Minimal instructions = maximal freedom**: The agent's brevity means less guidance for complex edge cases. LLM may improvise inappropriately. **Mitigation**: This is the intended design -- escalate to specialized agents for complex work.

## Cross-Agent Handoff Issues
1. **General -> Executor escalation**: When general self-escalates, it recommends executor via `/pbr:quick`. But the user must act on this recommendation -- no automatic handoff. This is correct for a utility agent.
2. **Quick task SUMMARY.md**: If general produces a SUMMARY.md for a quick task, it should follow the executor's SUMMARY format. But general has no SUMMARY template reference. **Fix**: Add SUMMARY format reference for quick task completions.

## Priority Fixes
- [ ] P2: Add SUMMARY.md format reference for quick task completion scenarios
- [ ] P3: Clarify when `/pbr:quick` spawns general vs executor
- [ ] P3: Consider adding context-budget tracking hooks for subagent context (not just orchestrator)
