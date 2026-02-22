# Audit: pbr:synthesizer

## Agent Overview
- Lines: 105 | Model: sonnet | Tools: Read, Write, Bash
- Spawned by: `/pbr:begin` (after multiple research outputs), `/pbr:explore`
- Gate validation: None specific in validate-task.js
- Output validation: `check-subagent-output.js` checks for .md in `.planning/research/` or CONTEXT.md update

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Synthesis Process (5 steps) | High | Low | Well-structured matrix approach |
| Step 2: Findings Matrix | High | Low | Table format is explicit |
| Step 3: Resolve Contradictions | High | Low | 4-level priority is unambiguous |
| Step 4: Prioritize Findings | High | Low | P1/P2/P3 classification |
| Step 5: Write Summary | High | Low | Template reference |
| Quality Standards | High | Med | "Under 200 lines" is testable; "every recommendation must trace" may degrade |
| Edge Cases (4) | High | Low | Good coverage of corner cases |

## Output Format Gaps
1. **Output path flexibility**: "`.planning/research/SUMMARY.md` (or specified path)" -- the "or specified path" is vague. Who specifies? The spawning skill? The Task() description? **Fix**: Clarify that the output path comes from the Task() description and defaults to research/SUMMARY.md.
2. **check-subagent-output.js looseness**: The synthesizer check looks for ANY .md in research/ or CONTEXT.md. This means a pre-existing research file satisfies the check even if synthesizer produced nothing new. **Fix**: Check file mtime against task start time.

## Gate Coverage Gaps
1. **No gate**: Can be spawned without research documents existing. Would produce an empty synthesis. **Fix**: Advisory warning if fewer than 2 research files exist in `.planning/research/`.

## Cognitive Load Risks
1. **Findings matrix construction**: Reading 2-4 documents and building a comparison matrix is the core work. With large research documents, this may exceed context budget. **Mitigation**: Agent-specific anti-pattern #7 "DO NOT repeat full content" helps.
2. **200-line limit**: Easy to exceed if many contradictions need documenting. **Mitigation**: Self-enforced but measurable.

## Cross-Agent Handoff Issues
1. **Synthesizer -> Planner**: Planner consumes SUMMARY.md. If synthesizer marks items `[NEEDS DECISION]`, planner must handle this. But planner has no documented behavior for `[NEEDS DECISION]` flags. **Fix**: Add planner instruction for handling unresolved decisions from synthesis.
2. **Input format contract**: Synthesizer expects confidence levels (HIGH/MEDIUM/LOW) and source tags (S1-S6) from researcher. If researcher omits these, synthesizer's Step 3 (Resolve Contradictions) can't apply priority rules. Contract is implicit, not enforced.

## Priority Fixes
- [ ] P2: Add planner handling for `[NEEDS DECISION]` flags from synthesis
- [ ] P2: Document explicit input format contract with researcher (confidence + source tags)
- [ ] P3: Tighten check-subagent-output.js to validate recency of output files
- [ ] P3: Clarify output path specification mechanism
