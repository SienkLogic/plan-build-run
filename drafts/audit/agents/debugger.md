# Audit: pbr:debugger

## Agent Overview
- Lines: 175 | Model: inherit | Tools: Read, Write, Edit, Bash, Glob, Grep
- Spawned by: `/pbr:debug`
- Gate validation: None specific in validate-task.js
- Output validation: `check-subagent-output.js` checks for .md files in `.planning/debug/`

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Operating Modes (4 combos) | High | Low | Mode/flag/behavior table is clear |
| Debug File Protocol | High | Low | YAML schema and section structure well-defined |
| Update Semantics | High | Low | IMMUTABLE/APPEND-ONLY/OVERWRITE rules are explicit |
| Investigation Techniques (8) | High | Low | Good reference table; LLM picks appropriate technique |
| Hypothesis Testing Framework | High | Med | "Write hypothesis BEFORE running" -- discipline easily skipped |
| Checkpoint Support | High | Low | 3 checkpoint types with key fields |
| Fixing Protocol | High | Med | "Verify root cause -> plan minimal fix -> predict" -- 8 steps, later ones may be skipped |
| Common Bug Patterns | Med | Low | References external file -- good delegation |
| Return Values | High | Low | 3 return types with required fields |

## Output Format Gaps
1. **Debug file slug generation**: "slug: lowercase, hyphens" but no max length or uniqueness guarantee. If two debug sessions have similar names, slug collision. **Fix**: Add timestamp or sequence number to slug.
2. **No SUMMARY.md equivalent**: Debugger doesn't produce a SUMMARY.md. Its output is the debug file + commit. The `check-subagent-output.js` checks for debug/*.md which is correct.
3. **Commit scope for debug fixes**: `fix({scope}): {description}` -- what scope? Phase scope? Quick scope? "planning"? Not specified for standalone debug sessions. **Fix**: Define scope convention for debug commits (e.g., `fix(debug): ...` or `fix({component}): ...`).

## Gate Coverage Gaps
1. **No gate at all**: Debugger can be spawned from any context. Since it has Write/Edit tools, it could modify code without the usual build/executor gates. **Risk**: Debugger making code changes outside of a planned workflow bypasses plan-based tracking.
2. **No validation that a bug report/symptoms exist**: Debugger can be spawned with empty instructions. In `interactive` mode this is fine (gathers symptoms), but in `symptoms_prefilled` mode it would start investigating nothing.

## Cognitive Load Risks
1. **"Update BEFORE action, not after"**: Writing hypothesis to debug file before running the test requires discipline. LLM naturally wants to run first, write later. **Mitigation**: Prompt-only enforcement.
2. **Fixing protocol 8-step sequence**: After finding root cause, the 8-step fix protocol (verify -> plan -> predict -> implement -> verify -> regressions -> commit -> update) is long. Steps 5-8 (post-fix verification) are high skip risk. **Mitigation**: The commit format includes `Root cause:` and `Debug session:` which serves as partial enforcement.
3. **Revert on fix failure**: "If fix fails: Revert immediately" -- LLM may try to fix the fix instead of reverting. **Mitigation**: Anti-pattern #2 "DO NOT make multiple changes at once" helps but is prompt-only.

## Cross-Agent Handoff Issues
1. **Debugger -> Executor**: If a bug is found during execution (deviation Rule 4), executor stops and the debug skill spawns debugger. But there's no documented handoff: does the executor's PROGRESS file persist? Does the debugger know which task failed? **Fix**: Document that executor's checkpoint should include task ID and PROGRESS file path.
2. **Debug file consumption**: No other agent reads `.planning/debug/` files. They're archival only. This is fine but could be leveraged for root cause pattern analysis in future.

## Priority Fixes
- [ ] P2: Define commit scope convention for debug fixes
- [ ] P2: Document executor -> debugger handoff (task context transfer)
- [ ] P3: Add slug uniqueness mechanism (timestamp suffix)
- [ ] P3: Consider advisory gate warning when debugger spawned with empty description
