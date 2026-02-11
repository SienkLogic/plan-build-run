# Phase Research: Discussion & Discovery Upgrades

> Research conducted: 2026-02-10
> Research date: 2026-02-10
> Mode: phase-research
> Phase: 17-discussion-and-discovery-upgrades
> Confidence: HIGH
> Sources consulted: 5

## User Constraints

No CONTEXT.md found for this phase.

## Phase Goal

Replace multi-option questioning in 4 skills (begin, discuss, explore, debug) with AskUserQuestion for structured decision capture. This extends the pattern established in Phase 15 (gate checks) and Phase 16 (settings and routing) into the interactive conversation skills.

## Implementation Approach

### Recommended Approach

Convert numbered-list option presentations and implicit multi-option scenarios into explicit AskUserQuestion tool calls with proper option structure. Each skill has distinct conversion points with different characteristics.

**Key Principle**: AskUserQuestion is for structured option selection only, not freeform text input. Maintain the conversational nature of these skills while adding structure where clear choices exist.

**Steps**:

1. Begin skill (4 conversion points, 1 already present)
2. Discuss skill (multiple conversion points for gray areas)
3. Explore skill (2 conversion points, AskUserQuestion already in allowed-tools)
4. Debug skill (3 conversion points)

### Skill-by-Skill Analysis

#### Begin Skill Analysis

**Current state**: [S0] allowed-tools does NOT include AskUserQuestion

**Conversion points identified**:

1. **Step 2 workflow preferences** (lines 96-131) — MAJOR CONVERSION
   - 5 separate preference questions (mode, depth, parallelization, git branching, commit planning docs)
   - Currently: "Ask: {question text}" with inline description of options
   - Should convert to: 5 separate AskUserQuestion calls
   - Note: Line 96 says "Use AskUserQuestion or direct conversation" but AskUserQuestion isn't in allowed-tools

2. **Step 4 research decision** (lines 154-156) — SIMPLE YES/NO
   - "Ask: 'I'd like to research...' OK to proceed?"
   - Currently: plain text question
   - Should convert to: yes-no pattern from gate-prompts.md

3. **Step 10b initial commit** (lines 406-410) — SIMPLE YES/NO
   - "Ask: 'Everything look good? Want me to commit...?'"
   - Currently: plain text question with yes/no response
   - Should convert to: yes-no pattern from gate-prompts.md

4. **Step 8 roadmap approval** (lines 318-321) — CONDITIONAL, USES GATE
   - "If gates.confirm_roadmap is true: present the roadmap to the user for approval"
   - Currently: implicit approval flow
   - Should convert to: approve-revise-abort pattern from gate-prompts.md
   - Note: This is a gate check, already covered by Phase 15 pattern

**New patterns needed for begin**:

- **depth-select**: 3 options (quick/standard/comprehensive) with detailed descriptions
- **mode-select**: 2 options (interactive/autonomous)
- **git-strategy-select**: 3 options (none/phase/milestone)
- **commit-docs-select**: 2 options (yes/no)
- **parallelization-select**: 2 options (enabled/disabled)

**Special considerations**:
- The workflow preferences section (Step 3) is the most critical conversion — it's the primary configuration capture point
- Each preference should be a separate AskUserQuestion with clear descriptions
- The depth selection matches the success criteria requirement: "depth selection uses AskUserQuestion (quick/standard/comprehensive)"

#### Discuss Skill Analysis

**Current state**: [S0] allowed-tools does NOT include AskUserQuestion

**Conversion points identified**:

1. **Step 2 existing CONTEXT.md handling** (lines 70-71) — SIMPLE CHOICE
   - "Continue and overwrite, or append new decisions?"
   - Currently: "Use AskUserQuestion to let the user choose"
   - AskUserQuestion not available!
   - Should convert to: 3-option pattern (overwrite/append/cancel)

2. **Step 4 gray area presentations** (lines 108-129) — PATTERN GENERATOR
   - Each gray area presents 2-4 options plus "Let Claude decide"
   - Currently: numbered list format with pros/cons
   - Should convert to: AskUserQuestion with dynamic option count
   - Critical: This is THE core interaction model for discuss skill

3. **Step 5 follow-up questions** (lines 136-147) — MULTIPLE STRUCTURED QUESTIONS
   - 4 follow-up questions per gray area
   - Currently: "Use AskUserQuestion for each"
   - AskUserQuestion not available!
   - Each needs proper AskUserQuestion structure

**New patterns needed for discuss**:

- **context-handling**: 3 options (overwrite/append/cancel)
- **gray-area-option**: Dynamic template for presenting gray area choices with "Let Claude decide" always as an option
- Follow-up questions are YES/NO types mostly, can reuse yes-no pattern

**Special considerations**:
- The gray area presentation (Step 4) is the core of the discuss skill
- Each gray area is unique — pattern must support dynamic option generation
- Follow-ups are structured but varied — some yes/no, some require custom options
- The skill explicitly calls for AskUserQuestion in Steps 2, 4, and 5 but doesn't have it in allowed-tools

#### Explore Skill Analysis

**Current state**: [S0] allowed-tools DOES include AskUserQuestion (line 4)

**Conversion points identified**:

1. **Mid-conversation research decision** (lines 110-136) — ALREADY IMPLEMENTED
   - Line 110: "Ask the user via AskUserQuestion: 'I'm not sure about the best approach...'"
   - This is already a proper AskUserQuestion usage
   - No conversion needed, but should verify pattern consistency

2. **Output routing confirmation** (lines 161-197) — POTENTIAL CONVERSION
   - Step 2 "Propose Outputs" presents suggested outputs
   - Currently: plain text proposal with "Want to adjust, add, or remove?"
   - Should consider: AskUserQuestion with options for "Approve", "Adjust", "Add more", "Remove some"
   - Note: Step 3 says "The user confirms, modifies, removes, or adds outputs"

**New patterns needed for explore**:

- **output-routing-confirm**: 4 options (approve all/adjust/add more/remove some)

**Special considerations**:
- Explore already uses AskUserQuestion for research decisions
- Output routing (Step 3) is currently freeform conversation — adding structure here may reduce flexibility
- This is the LEAST prescriptive of the 4 skills — over-structuring would damage its exploratory nature
- Consider: only convert if clear benefit, maintain conversational flow as primary

#### Debug Skill Analysis

**Current state**: [S0] allowed-tools does NOT include AskUserQuestion

**Conversion points identified**:

1. **Step 1 active session selection** (lines 50-63) — PERFECT ASKUSERQUESTION CANDIDATE
   - Presents active debug sessions as numbered list
   - "Which would you like?"
   - Currently: implied numbered selection
   - Should convert to: AskUserQuestion with dynamic session options + "Start new session"

2. **Step 2a symptom gathering** (lines 78-91) — FREEFORM, DO NOT CONVERT
   - 5 symptom questions: expected, actual, reproduction, onset, scope
   - These are freeform text answers, not option selection
   - This is explicitly NOT an AskUserQuestion use case
   - FALSE POSITIVE — leave as plain text questions

3. **Step 3 checkpoint response** (lines 236-240) — MULTI-OPTION DECISION
   - "Ask user via AskUserQuestion"
   - 3 options: "Continue investigating?", "Provide additional information?", "Try a different approach?"
   - Currently: text describes using AskUserQuestion but tool not available
   - Should convert to: 3-option pattern (continue/provide-info/try-different)

**New patterns needed for debug**:

- **debug-session-select**: Dynamic template for session selection + "Start new session"
- **debug-checkpoint**: 3 options (continue/provide-info/try-different)

**Special considerations**:
- The symptom gathering (Step 2a) uses AskUserQuestion in the text but those are freeform questions — DO NOT convert
- Only Steps 1 and 3 have true multi-option scenarios
- The debug skill explicitly says "use AskUserQuestion" in Step 3 but doesn't have it in allowed-tools

### Pattern Reuse Analysis

From gate-prompts.md, these existing patterns can be reused:

| Existing Pattern | Reuse In Skill | For What |
|------------------|----------------|----------|
| yes-no | begin, explore | Research decision, commit confirmation |
| approve-revise-abort | begin | Roadmap approval gate |

New patterns needed (total: 11):

1. **depth-select** (begin) — 3 options: quick/standard/comprehensive
2. **mode-select** (begin) — 2 options: interactive/autonomous
3. **git-strategy-select** (begin) — 3 options: none/phase/milestone
4. **commit-docs-select** (begin) — 2 options: yes/no
5. **parallelization-select** (begin) — 2 options: enabled/disabled
6. **context-handling** (discuss) — 3 options: overwrite/append/cancel
7. **gray-area-option** (discuss) — dynamic 2-4 options + "Let Claude decide"
8. **output-routing-confirm** (explore) — 4 options: approve all/adjust/add more/remove some
9. **research-now-or-later** (explore) — 2 options: research now/save for later
10. **debug-session-select** (debug) — dynamic sessions + "Start new session"
11. **debug-checkpoint** (debug) — 3 options: continue/provide-info/try-different

### Conversion Point Summary

| Skill | Conversion Points | Patterns Needed | AskUserQuestion Already Present? |
|-------|-------------------|-----------------|----------------------------------|
| begin | 4 | 5 new + 2 reused | NO |
| discuss | 3 | 2 new + reuse yes-no | NO |
| explore | 2 | 2 new + reuse yes-no | YES |
| debug | 2 (not 3) | 2 new | NO |

**Total**: 11 conversion points across 4 skills, 11 new patterns required

### False Positives Identified

From Phase 16 learning: not everything that looks like a question should use AskUserQuestion.

**Confirmed false positives in this phase**:

1. **Debug Step 2a symptom gathering** (lines 78-91) — These are freeform text questions about expected/actual behavior, reproduction steps, etc. NOT option selection.
2. **Explore Socratic conversation** (throughout) — The conversational questioning (lines 77-91) is deliberately open-ended. Converting to structured options would destroy the exploratory nature.
3. **Discuss follow-up questions** (Step 5) — Some follow-ups like "Should {feature} also handle {edge case}?" are yes/no (CAN convert), but questions like "How polished should this be?" may need freeform answers depending on context.

### Edge Cases and Complications

1. **Dynamic option generation** (discuss gray areas, debug session list):
   - AskUserQuestion requires static option count at definition time
   - Must generate options dynamically based on runtime state
   - Pattern: Define template structure, skill fills in at runtime

2. **Conditional menus** (begin roadmap approval):
   - Only shown if `gates.confirm_roadmap` is true
   - Pattern is already established from Phase 15 gates

3. **Follow-up question sequences** (discuss Step 5):
   - 4 follow-ups per gray area
   - Each is a separate AskUserQuestion call
   - Must maintain conversation flow between calls

4. **Existing AskUserQuestion usage** (explore):
   - Already uses AskUserQuestion for research decision (line 110)
   - Must ensure new conversions match existing style
   - Verify that existing usage follows Phase 16 pattern

5. **Max 4 options limit**:
   - Begin has 5 workflow preferences — must present sequentially, not as one menu
   - Debug session selection could exceed 4 sessions — use pagination pattern from phase-16 pause-point-select

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| AskUserQuestion | Core tool | Structured option selection | All 4 skills |
| gate-prompts.md | Current | Pattern reference | Pattern definitions |

## Pitfalls for This Phase

1. **Over-structuring conversational skills** [S0]: The discuss and explore skills are deliberately conversational. Converting every question to AskUserQuestion will make them feel rigid and robotic. Only convert genuine multi-option decision points.

2. **Freeform questions misidentified as AskUserQuestion candidates** [S0]: Debug symptom gathering looks like it should use AskUserQuestion because it's a numbered list, but the answers are freeform text. Do NOT convert.

3. **Dynamic options exceeding 4-option limit** [S0]: Debug session selection and discuss gray areas can have >4 options. Must implement pagination or batching pattern from Phase 16.

4. **Breaking existing AskUserQuestion usage in explore** [S0]: Explore already uses AskUserQuestion. Ensure new patterns don't conflict with existing usage style.

5. **Inconsistent pattern naming** [S0]: 14 existing patterns + 11 new = 25 total patterns in gate-prompts.md. Must maintain consistent naming convention (verb-noun-noun or context-action).

6. **Sequential vs. single-menu presentation** [S0]: Begin has 5 preferences. Presenting as 5 sequential AskUserQuestion calls is correct, but the user experience must feel natural, not like filling out a form. Add conversational bridging text between calls.

7. **Frontmatter updates forgotten** [S0]: Must add "AskUserQuestion" to allowed-tools in begin, discuss, and debug. Explore already has it. Missing this will cause runtime errors.

## Testing Strategy

### Unit Tests (if applicable)

No unit tests — these are skill definition changes, not hook scripts.

### Manual Verification

After implementation:

1. **Begin skill**:
   - Run `/dev:begin` in a fresh project
   - Verify all 5 workflow preferences use AskUserQuestion with proper option structure
   - Verify depth selection matches success criteria (quick/standard/comprehensive)
   - Verify research decision and commit confirmation use yes-no pattern

2. **Discuss skill**:
   - Run `/dev:discuss 1`
   - Verify existing CONTEXT.md handling uses AskUserQuestion
   - Verify gray area presentations use AskUserQuestion with 2-4 options + "Let Claude decide"
   - Verify follow-up questions use structured options

3. **Explore skill**:
   - Run `/dev:explore` and `/dev:explore auth`
   - Verify existing research decision AskUserQuestion still works
   - Verify output routing uses AskUserQuestion
   - Verify conversational flow is NOT over-structured

4. **Debug skill**:
   - Run `/dev:debug` with existing sessions
   - Verify session selection uses AskUserQuestion
   - Verify symptom gathering remains freeform (NOT AskUserQuestion)
   - Create a checkpoint scenario, verify checkpoint response uses AskUserQuestion

5. **gate-prompts.md**:
   - Verify all 11 new patterns are added
   - Verify pattern structure matches existing patterns
   - Verify header length ≤12 chars for all new patterns

### Cross-skill Consistency

- Compare begin depth-select, discuss gray-area-option, and debug session-select structures
- Verify all patterns follow the 12-char header limit
- Verify all patterns have multiSelect: false (no multi-select in this phase)
- Verify all skills reference patterns by name, not inline

## Open Questions

1. Should explore output routing (Step 3) be converted to AskUserQuestion? It's currently "Want to adjust, add, or remove?" which could be structured, but the flexibility of freeform conversation may be more valuable.

2. For begin workflow preferences, should all 5 questions be presented sequentially, or grouped into a category menu like config skill does? Sequential is more conversational but potentially tedious.

3. Should the debug checkpoint pattern include a "Provide additional information" option, or should that be a freeform conversation prompt? The skill text (line 237) suggests it's an option, but providing information is inherently freeform.

4. How should discuss handle >4 gray areas in a single phase? The skill says "Identify 3-4 gray areas" (line 93), but what if 5 exist? Present sequentially or batch?

## Sources

| # | Type | Location | Confidence |
|---|------|----------|------------|
| S0 | Project files | plugins/dev/skills/{begin,discuss,explore,debug}/SKILL.md | HIGH |
| S0 | Project files | plugins/dev/skills/shared/gate-prompts.md | HIGH |
| S0 | Project context | Phase 15 and 16 patterns and learnings | HIGH |
