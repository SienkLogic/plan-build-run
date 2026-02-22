# Audit: pbr:codebase-mapper

## Agent Overview
- Lines: 114 | Model: sonnet | Tools: Read, Bash, Glob, Grep, Write
- Spawned by: `/pbr:begin` (explore skill), `/pbr:explore`
- Gate validation: None specific in validate-task.js
- Output validation: `check-subagent-output.js` checks for .md files in `.planning/codebase/`

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Focus Areas (4) | High | Low | Clear focus -> output file mapping |
| Exploration Process (4 steps) | High | Low | Cross-platform note is valuable |
| Forbidden Files | High | Low | Explicit blocklist |
| Output Budget | High | Low | Per-file token limits |
| Quality Standards (5 items) | High | Med | "Read at least 5-10 key files per focus area" -- may be skipped for small projects |

## Output Format Gaps
1. **Template dependency**: All output relies on reading `.tmpl` files. 4 focus areas x 2 files = 8 possible templates. If templates are missing, agent has no inline fallback format. **Fix**: Add minimal inline schema per focus area.
2. **Focus area received per invocation**: "ONE focus area per invocation" but no validation of the focus parameter. If an invalid focus is passed, agent has no error handling instruction. **Fix**: Add "If focus is not one of tech/arch/quality/concerns, report error and exit."
3. **`.planning/codebase/` creation**: "create if needed" is mentioned but not a CRITICAL step. Could be skipped. **Mitigation**: Low risk since Write tool will create parent directories.

## Gate Coverage Gaps
1. **No gate**: Can be spawned from any context. Low risk since output goes to `.planning/codebase/` which is non-destructive.
2. **No validation of focus parameter**: Invalid focus area passes silently.

## Cognitive Load Risks
1. **Reading 5-10 files per focus area**: This is context-heavy. For a large codebase, the agent may read fewer files and produce shallow analysis. **Mitigation**: Quality Standard #3 is explicit but self-enforced.
2. **Two output files per focus**: Agent must produce 2 files per invocation. Second file may be less thorough. **Mitigation**: Token budgets per file help.

## Cross-Agent Handoff Issues
1. **Codebase-mapper -> Researcher**: Researcher checks `.planning/codebase/STACK.md` for technology stack. If codebase-mapper hasn't run the `tech` focus yet, STACK.md won't exist. No error handling in researcher for missing STACK.md. **Fix**: Researcher should handle missing STACK.md gracefully.
2. **Codebase-mapper -> Verifier**: Verifier reads `.planning/codebase/STACK.md` for stub detection patterns. Same missing-file concern as above.

## Priority Fixes
- [ ] P2: Add inline fallback format for when templates are missing
- [ ] P3: Add focus parameter validation instruction
- [ ] P3: Document dependency: researcher/verifier expect STACK.md from codebase-mapper
