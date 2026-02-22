# Audit: pbr:researcher

## Agent Overview
- Lines: 171 | Model: sonnet | Tools: Read, Glob, Grep, WebFetch, WebSearch, mcp__context7__resolve-library-id, mcp__context7__get-library-docs, Bash
- Spawned by: `/pbr:plan` (phase research), `/pbr:begin` (project research), `/pbr:explore`
- Gate validation: None specific in validate-task.js
- Output validation: `check-subagent-output.js` checks for .md files in `.planning/research/`; skill-specific: plan researcher also checks phase-level RESEARCH.md

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Source Hierarchy (S0-S6) | High | Low | Clear priority ordering |
| Confidence Levels | High | Low | 4 levels with criteria |
| Operating Modes (3 modes) | High | Low | Clear trigger/output mapping |
| Research Process (5 steps) | High | Med | Step 3 iterative cycle (3 max) is well-bounded but LLM may do 1 cycle and declare "COMPLETE" |
| Context Budget per cycle | High | Low | Explicit percentage allocations |
| Output Formats (3 templates) | Med | Med | References 3 template files -- 3 Reads before writing |
| S0 Local-First rule | High | Med | Checking local research first requires discipline; LLM may jump to WebSearch |
| Attribution rules | High | Med | "Every factual claim needs a source tag" -- tedious, likely degraded under load |

## Output Format Gaps
1. **MCP tools may not be available**: Tools list includes `mcp__context7__resolve-library-id` and `mcp__context7__get-library-docs`. If Context7 MCP server isn't running, these tools will fail. The agent has no fallback instructions for MCP unavailability. **Fix**: Add "If Context7 MCP tools are unavailable, skip S1 sources and note the gap."
2. **Output path ambiguity in Mode 1**: "`.planning/research/{topic-slug}.md`" -- who determines the topic-slug? The researcher chooses it. No naming convention specified. **Fix**: Add slug convention (e.g., lowercase, hyphens, max 30 chars).
3. **Template paths use `${CLAUDE_PLUGIN_ROOT}`**: Three different template files must be read. If any template is missing, researcher has no inline fallback. **Fix**: Add minimal inline format as fallback.

## Gate Coverage Gaps
1. **No gate at all**: Researcher can be spawned from any context. Since it's primarily read-only (writes to .planning/research/), risk is low -- worst case is wasted tokens.
2. **check-subagent-output.js checks research/ broadly**: It looks for ANY .md file in research/. If researcher writes a file with wrong name, it still passes. No content validation.

## Cognitive Load Risks
1. **Source attribution on every claim**: The most likely degradation under cognitive load. After 2+ research cycles, the LLM will start omitting `[S2]` tags. **Mitigation**: Prompt-only; no hook enforcement possible for content quality.
2. **3-cycle maximum**: LLM may declare COMPLETE after cycle 1 to save effort, even with INSUFFICIENT coverage. The "EVALUATE" phase is self-assessed. **Mitigation**: Plan-checker D7 partially catches research gaps that propagate to plans.
3. **Context budget per cycle**: 25% + 10% + 5% = 40% for research, leaving 60% for output. If cycle 1 reads many large files, budget is blown. **Mitigation**: Budget rules are explicit but self-enforced.

## Cross-Agent Handoff Issues
1. **Researcher -> Planner**: Planner reads research output. If researcher uses Mode 1 (project research to `.planning/research/`), planner may not know which file to read -- no manifest of research outputs. **Fix**: Consider a research index file.
2. **Researcher -> Synthesizer**: Synthesizer expects "2-4 research documents" with confidence levels and source tags. If researcher omits these, synthesizer can't apply its resolution priority. Contract is implicit.
3. **Phase research output path**: Mode 2 writes to `.planning/phases/{NN}-{phase-name}/RESEARCH.md`. The phase directory must exist before the researcher writes. Who creates it? The plan skill? Not specified. **Fix**: Add "Create phase directory if it doesn't exist" or document prerequisite.

## Priority Fixes
- [ ] P2: Add MCP tool unavailability fallback instructions
- [ ] P2: Specify topic-slug naming convention for research output files
- [ ] P2: Document who creates phase directory before researcher writes RESEARCH.md
- [ ] P3: Add minimal inline output format as template fallback
- [ ] P3: Consider research index/manifest for multi-file research outputs
