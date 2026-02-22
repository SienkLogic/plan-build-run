# Audit: pbr:planner

## Agent Overview
- Lines: 189 | Model: inherit | Tools: Read, Write, Bash, Glob, Grep, WebFetch
- Spawned by: `/pbr:plan`, `/pbr:review` (gap closure), `/pbr:begin` (roadmap), `/pbr:milestone`
- Gate validation: `checkReviewPlannerGate` (review skill requires VERIFICATION.md), `checkPlanExecutorGate` (plan skill cannot spawn executor -- protects planner from accidentally executing), `checkMilestoneCompleteGate` (milestone complete)
- Output validation: `check-subagent-output.js` checks for PLAN*.md in phase dir

## Instruction Analysis
| Section | Clarity | Skip Risk | Issue |
|---------|---------|-----------|-------|
| Operating Modes (4 modes) | High | Low | Clear trigger/output mapping |
| Goal-Backward Methodology | High | Med | "Derive three categories" requires reading multiple files first -- LLM may shortcut |
| Plan Structure | Med | Low | References `references/plan-format.md` -- good delegation but adds a Read step |
| Complexity Annotation | High | Med | Heuristics table is clear but "first match wins" may be misapplied for edge cases |
| Dependency Graph Rules | High | Low | Explicit no-circular-deps rule |
| Planning Process (6 steps) | Med | Med | Step 6 self-check is a checklist with 7 items -- high skip risk under load |
| Gap Closure Mode | Med | Med | "Increment plan numbers from existing plans" -- no formula given for the increment |
| Revision Mode | High | Low | Clear 3-step process |
| Context Optimization | High | Low | Frontmatter-first assembly is well-specified |
| Output Budget | High | Low | Token limits are explicit |
| Milestone grouping | Med | Med | "Consider splitting into multiple milestones" is vague -- when exactly? |

## Output Format Gaps
1. **Plan file naming**: Agent says `{phase}-{NN}-PLAN.md` in Mode 1, but MEMORY.md warns "Plan files MUST be named `PLAN-{NN}.md`" because `checkBuildExecutorGate` regex `/^PLAN.*\.md$/i` requires filename to START with "PLAN". **This is a LIVE BUG in the agent definition.** The planner instructions contradict the gate regex. **Fix**: Change Mode 1 output path to `.planning/phases/{NN}-{phase-name}/PLAN-{MM}.md`.
2. **Summary section**: "Append a `## Summary` section per `references/plan-format.md` (under 500 tokens)" -- this is the only mention of the Summary section. Easy to miss. **Fix**: Make it a numbered step in the Planning Process.
3. **Roadmap template**: Mode 4 references `templates/ROADMAP.md.tmpl` but doesn't specify the exact frontmatter schema the template expects.

## Gate Coverage Gaps
1. **No gate for planner spawned from begin skill**: `checkReviewPlannerGate` only fires when active skill is "review". When `/pbr:begin` spawns planner for roadmap creation, there's no gate validating prerequisites (e.g., that research exists). Low risk since begin skill handles this in its own flow.
2. **No gate preventing planner from being spawned without phase goal**: Planner needs a phase goal to derive must-haves. If spawned with ambiguous instructions, it may produce plans without must-haves. **Fix**: Advisory warning in `validate-task.js` if description lacks phase/goal context.
3. **Gap closure planner has no gate verifying VERIFICATION.md status is `gaps_found`**: The `checkReviewPlannerGate` checks VERIFICATION.md exists but not that its status is `gaps_found`. Planner could be spawned for gap closure on an already-passed phase.

## Cognitive Load Risks
1. **Self-check checklist (Step 6)**: 7 checkbox items after plan creation. Classic "I already wrote the plan, surely it's fine" skip pattern. **Mitigation**: `check-plan-format.js` PostToolUse hook validates plan files after write, partially covering this.
2. **Complexity annotation on every task**: Easy to default everything to "medium" rather than applying the heuristic table. **Mitigation**: Plan-checker D2 could validate complexity annotations.
3. **Context compliance verification**: "Before writing plans, verify every locked decision in CONTEXT.md has a corresponding task" -- requires cross-referencing two documents. LLM may skip. **Mitigation**: Plan-checker D7 catches this.

## Cross-Agent Handoff Issues
1. **CRITICAL: Plan filename convention mismatch**: Planner says `{phase}-{NN}-PLAN.md`, executor/gate expects `PLAN-{NN}.md`. This is documented in MEMORY.md as a known issue but NOT fixed in the agent definition. The planner will produce files the gate can't find.
2. **must_haves format**: Planner writes `must_haves` in YAML frontmatter; verifier reads via `pbr-tools.js must-haves`. If planner uses different YAML structure (nested lists vs flat), verifier parsing may fail silently.
3. **Wave assignment**: Planner assigns waves but executor processes tasks "sequential order" -- wave information is planning metadata only, not execution ordering. This is correct but could confuse if multiple plans exist.

## Priority Fixes
- [ ] P1: **Fix plan filename convention** -- change agent to produce `PLAN-{MM}.md` not `{phase}-{NN}-PLAN.md`. This is a known live bug per MEMORY.md.
- [ ] P2: Add plan Summary section as explicit numbered step in Planning Process
- [ ] P2: Add gate check for VERIFICATION.md status in gap closure flow
- [ ] P3: Specify milestone splitting criteria more precisely
- [ ] P3: Validate complexity annotations in plan-checker
