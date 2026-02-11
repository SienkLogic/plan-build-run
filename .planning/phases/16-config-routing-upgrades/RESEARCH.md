# Phase Research: Config & Routing Upgrades

> Research conducted: 2026-02-10
> Research date: 2026-02-10
> Mode: phase-research
> Phase: 16-config-routing-upgrades
> Confidence: HIGH

## User Constraints

No CONTEXT.md found for this project. This is an internal plugin improvement phase within the Towline development system.

## Phase Goal

Replace settings menus and "what next" routing decisions in 5 skills (config, status, continue, resume, quick) with AskUserQuestion to provide consistent structured UI across the plugin.

This phase builds on Phase 15's work establishing AskUserQuestion patterns in gate-prompts.md. The goal is to extend structured prompts from gate checks (yes/no decisions) to settings configuration and workflow routing (multi-option menus).

## Implementation Approach

### Overview

All 5 skills currently use text-based prompts with numbered lists or bullet options. Users respond by typing numbers, selections, or freeform text. This creates inconsistent UX and harder-to-parse interactions.

Phase 16 will convert these to AskUserQuestion with standardized patterns, similar to how Phase 15 converted gate checks.

### Conversion Summary by Skill

| Skill | Conversion Points | Complexity | New Patterns Needed |
|-------|------------------|------------|---------------------|
| **config** | 2 locations | Medium | 2 new patterns |
| **status** | 1 location | Low | 1 new pattern |
| **continue** | 1 location | Low | 0 (reuse existing) |
| **resume** | 2 locations | Medium | 1 new pattern |
| **quick** | 2 locations | Low | 1 new pattern |

**Total**: 8 conversion points, 5 new patterns needed for gate-prompts.md

---

## Detailed Findings Per Skill

### 1. config Skill

**File**: `plugins/dev/skills/config/SKILL.md`

#### Conversion Point 1: Category Selection Menu (Lines 72-79)

**Current Implementation**:
```
Then ask: "What would you like to change?" with options:
- Depth (quick/standard/comprehensive)
- Models (per-agent model selection)
- Model profile (quality/balanced/budget/adaptive — sets all models at once)
- Features (toggle individual features)
- Gates (toggle confirmation gates)
- Parallelization settings
- Git settings (branching strategy, mode)
```

**Problem**: This is a text prompt expecting typed response. No structured selection.

**Suggested AskUserQuestion**:
```yaml
question: "What would you like to configure?"
header: "Configure"
options:
  - label: "Depth"           description: "quick/standard/comprehensive"
  - label: "Model profile"   description: "quality/balanced/budget/adaptive"
  - label: "Features"        description: "Toggle workflow features"
  - label: "Git settings"    description: "branching strategy, commit format"
multiSelect: false
```

**Rationale**: AskUserQuestion supports max 4 options. The 7 original options need to be condensed or split into primary (4) + follow-up.

**Recommended approach**:
- Primary 4-option menu: Depth, Model profile, Features, Git settings
- Remove "Models" (covered by "Model profile")
- Remove "Gates" and "Parallelization" as separate categories (fold into "Features" or create follow-up if needed)
- After user selects category, show category-specific AskUserQuestion

**Pattern Name**: `settings-category-select`

**Confidence**: HIGH [S0] — based on gate-prompts.md patterns and existing AskUserQuestion usage in 6 skills from Phase 15

---

#### Conversion Point 2: Toggle Confirmations (Implied, throughout Step 4)

**Current Implementation**: Step 4 "Apply Changes" is text-based. The skill presumably asks for specific values after category selection.

**Suggested AskUserQuestion for boolean toggles**:
```yaml
question: "Enable {feature_name}?"
header: "Enable?"
options:
  - label: "Enable"   description: "Turn this feature on"
  - label: "Disable"  description: "Turn this feature off"
multiSelect: false
```

**Pattern Name**: `toggle-confirm`

**Suggested AskUserQuestion for model selection**:
```yaml
question: "Select model profile"
header: "Profile"
options:
  - label: "Quality"   description: "opus for all agents (highest cost)"
  - label: "Balanced"  description: "sonnet/inherit mix (default)"
  - label: "Budget"    description: "haiku for all agents (lowest cost)"
  - label: "Adaptive"  description: "sonnet planning, haiku execution"
multiSelect: false
```

**Pattern Name**: `model-profile-select`

**Confidence**: MEDIUM [S0+S6] — AskUserQuestion structure is confirmed, but the config skill doesn't explicitly document the current toggle flow

---

### 2. status Skill

**File**: `plugins/dev/skills/status/SKILL.md`

#### Conversion Point 1: Smart Routing Suggestions (Lines 206-258)

**Current Implementation** (Lines 246-258):
```
Next step:
--> {suggested command} -- {brief explanation}

If multiple reasonable next actions exist, show up to 3:

Suggested next steps:
--> {primary suggestion} -- {explanation}
--> {alternative 1} -- {explanation}
--> {alternative 2} -- {explanation}
```

**Problem**: This is display-only text. User must type the command manually. No structured selection.

**Suggested AskUserQuestion**:
```yaml
question: "What would you like to do next?"
header: "Next Step"
options:
  - label: "{primary action}"    description: "{explanation}"
  - label: "{alternative 1}"     description: "{explanation}"
  - label: "{alternative 2}"     description: "{explanation}"
  - label: "Something else"      description: "Enter a custom command"
multiSelect: false
```

**Rationale**:
- The skill already has logic for determining the "most logical next action" (lines 209-243)
- Currently it only displays suggestions; AskUserQuestion would let the user select and execute
- The skill would need to handle execution after selection (currently it's read-only)

**WARNING**: This conversion changes the skill's behavior from read-only to potentially executable. The skill metadata says `allowed-tools: Read, Glob, Grep` — no Task, Bash, or Write. This means:
- Option 1: Keep status read-only, use AskUserQuestion to display suggestions but don't execute
- Option 2: Expand allowed-tools to include Task, and route to the selected skill

**Recommendation**: Option 1 (display-only). Use AskUserQuestion to let user pick which suggestion to copy, but don't auto-execute. Or change this entirely — use a follow-up prompt: "Run this command now?" (yes/no pattern).

**Pattern Name**: `action-routing`

**Confidence**: MEDIUM [S0+S2] — Pattern is clear, but behavior change needs design decision

---

### 3. continue Skill

**File**: `plugins/dev/skills/continue/SKILL.md`

#### Conversion Point 1: None (auto-routing skill)

**Analysis**: The continue skill is **fully automated** — it reads state and executes the next action without asking. Lines 23-24: *"Do, don't ask. Read STATE.md, determine the next action, and execute it."*

The skill uses `Skill()` delegation (lines 56-63) to spawn other skills. There are no user prompts for routing decisions.

**Exception — Hard Stops** (lines 81-89): When auto-continue must stop, it explains why and tells the user what to do. But this is informational text, not a menu.

**Conclusion**: No conversion needed for continue skill. It already operates without user menus.

**Pattern Name**: N/A

**Confidence**: HIGH [S0] — Skill definition explicitly states "no prompts, no decisions"

---

### 4. resume Skill

**File**: `plugins/dev/skills/resume/SKILL.md`

#### Conversion Point 1: Multiple Pause Points Selection (Lines 96-106)

**Current Implementation**:
```markdown
**If multiple found:**
- Present to user via AskUserQuestion:
  ```
  Found multiple pause points:
  1. Phase {A} -- paused {date}
  2. Phase {B} -- paused {date}

  Which would you like to resume?
  ```
- Use the selected one.
```

**Status**: ALREADY USES AskUserQuestion! But the example shows text format, not structured AskUserQuestion syntax.

**Suggested AskUserQuestion** (corrected):
```yaml
question: "Found multiple pause points. Which would you like to resume?"
header: "Resume"
options:
  - label: "Phase {A}"  description: "Paused {date}"
  - label: "Phase {B}"  description: "Paused {date}"
  - label: "Phase {C}"  description: "Paused {date}"  # if exists
  - label: "Phase {D}"  description: "Paused {date}"  # if exists
multiSelect: false
```

**Challenge**: AskUserQuestion supports max 4 options. If more than 4 pause points exist, need a fallback:
- Show 4 most recent + "Show more" option
- Or show text list and ask user to type phase number

**Pattern Name**: `pause-point-select`

**Confidence**: HIGH [S0] — Skill already references AskUserQuestion, just needs proper syntax

---

#### Conversion Point 2: Recovery Position Confirmation (Lines 221-235)

**Current Implementation** (Lines 63-64 in Step 3a):
```markdown
3. Display the resume context:
...
(text-based display, no interaction)
```

**Later** (Lines 155-159):
```markdown
5. Present the next action from the continue-here file:

Next step:
--> {suggested command} -- {explanation from continue-here}
```

**Problem**: Same as status skill — displays suggestion but doesn't offer structured selection.

**Suggested AskUserQuestion**:
```yaml
question: "Resume with this action?"
header: "Resume"
options:
  - label: "Yes"              description: "Execute {suggested command}"
  - label: "Choose different" description: "Pick a different action"
  - label: "Just show status" description: "Don't execute, show me /dev:status"
multiSelect: false
```

**Pattern Name**: Can reuse `yes-no` pattern from gate-prompts.md, or create `resume-action-confirm`

**Confidence**: MEDIUM [S0+S6] — Pattern is clear but may change resume skill from read-only to executable (same issue as status)

---

### 5. quick Skill

**File**: `plugins/dev/skills/quick/SKILL.md`

#### Conversion Point 1: Scope Validation (Lines 52-72)

**Current Implementation**:
```markdown
Then warn the user:

This looks like it might be bigger than a quick task. Quick tasks work best for:
- Bug fixes
- Small feature additions
...

Would you like to proceed as a quick task, or use `/dev:plan` for a full planning cycle?

Use AskUserQuestion to let the user decide. If they want to proceed, continue.
```

**Status**: ALREADY MENTIONS AskUserQuestion! But doesn't show the structure.

**Suggested AskUserQuestion**:
```yaml
question: "This task looks complex. Proceed as quick task or use full planning?"
header: "Scope"
options:
  - label: "Quick task"   description: "Execute as lightweight task"
  - label: "Full plan"    description: "Use /dev:plan for proper planning"
  - label: "Revise"       description: "Let me rewrite the task description"
multiSelect: false
```

**Pattern Name**: `scope-confirm`

**Confidence**: HIGH [S0] — Skill already references AskUserQuestion at line 72

---

#### Conversion Point 2: Get Task Description (Lines 45-51)

**Current Implementation**:
```markdown
If `$ARGUMENTS` is empty:
- Ask user via AskUserQuestion: "What do you need done? Describe the task in a sentence or two."
```

**Status**: ALREADY USES AskUserQuestion!

**Problem**: This is asking for **freeform text input**, not a selection. AskUserQuestion is for structured options, not text input.

**Recommended approach**: This should remain a **plain text prompt**, NOT converted to AskUserQuestion. AskUserQuestion is not appropriate for freeform task descriptions.

**Pattern Name**: N/A (preserve as freeform)

**Confidence**: HIGH [S0+S1] — AskUserQuestion is for selections, not text input

---

#### Conversion Point 3: Clarifying Questions (Lines 268-273)

**Current Implementation**:
```markdown
### Task description is too vague
- Ask clarifying questions via AskUserQuestion:
  - "Which file(s) need to change?"
  - "What should the end result look like?"
  - "Is there a specific error to fix?"
```

**Status**: ALREADY MENTIONS AskUserQuestion, but these are **open-ended questions** expecting text answers.

**Recommendation**: Same as Conversion Point 2 — these should be **plain text prompts**, not AskUserQuestion. You can't use AskUserQuestion for "Which file(s) need to change?" when the answer is arbitrary text.

**Pattern Name**: N/A (preserve as freeform)

**Confidence**: HIGH [S0+S1]

---

## New Patterns Needed for gate-prompts.md

Based on the analysis above, add these 5 new patterns to `plugins/dev/skills/shared/gate-prompts.md`:

### 1. settings-category-select

**Purpose**: Multi-category configuration menu (config skill)

```markdown
## Pattern: settings-category-select

4-option menu for configuration category selection.

Use AskUserQuestion:
  question: "What would you like to configure?"
  header: "Configure"
  options:
    - label: "Depth"           description: "quick/standard/comprehensive"
    - label: "Model profile"   description: "quality/balanced/budget/adaptive"
    - label: "Features"        description: "Toggle workflow features"
    - label: "Git settings"    description: "branching strategy, commit format"
  multiSelect: false
```

### 2. toggle-confirm

**Purpose**: Enable/disable boolean feature (config skill)

```markdown
## Pattern: toggle-confirm

2-option confirmation for enabling/disabling features.

Use AskUserQuestion:
  question: "Enable {feature_name}?"
  header: "Toggle"
  options:
    - label: "Enable"   description: "Turn this feature on"
    - label: "Disable"  description: "Turn this feature off"
  multiSelect: false
```

### 3. model-profile-select

**Purpose**: Model profile selection (config skill)

```markdown
## Pattern: model-profile-select

4-option selection for model profile presets.

Use AskUserQuestion:
  question: "Select model profile"
  header: "Profile"
  options:
    - label: "Quality"   description: "opus for all agents (highest cost)"
    - label: "Balanced"  description: "sonnet/inherit mix (default)"
    - label: "Budget"    description: "haiku for all agents (lowest cost)"
    - label: "Adaptive"  description: "sonnet planning, haiku execution"
  multiSelect: false
```

### 4. action-routing

**Purpose**: Display and select suggested next actions (status, resume skills)

```markdown
## Pattern: action-routing

Up to 4 suggested next actions with selection.

Use AskUserQuestion:
  question: "What would you like to do next?"
  header: "Next Step"
  options:
    - label: "{primary action}"    description: "{explanation}"
    - label: "{alternative 1}"     description: "{explanation}"
    - label: "{alternative 2}"     description: "{explanation}"
    - label: "Something else"      description: "Enter a custom command"
  multiSelect: false

Note: Dynamically generate options from workflow state. The "Something else" option
allows users to break out of suggested actions.
```

### 5. pause-point-select

**Purpose**: Select from multiple resume points (resume skill)

```markdown
## Pattern: pause-point-select

Up to 4 pause points with selection (resume skill).

Use AskUserQuestion:
  question: "Found multiple pause points. Which would you like to resume?"
  header: "Resume"
  options:
    - label: "Phase {A}"  description: "Paused {date}"
    - label: "Phase {B}"  description: "Paused {date}"
    - label: "Phase {C}"  description: "Paused {date}"
    - label: "Phase {D}"  description: "Paused {date}"
  multiSelect: false

Note: If more than 4 pause points exist, show the 4 most recent and add a
"Show earlier" option that re-prompts with the next 4.
```

### 6. scope-confirm

**Purpose**: Confirm task scope (quick skill)

```markdown
## Pattern: scope-confirm

3-option confirmation for quick task scope validation.

Use AskUserQuestion:
  question: "This task looks complex. Proceed as quick task or use full planning?"
  header: "Scope"
  options:
    - label: "Quick task"   description: "Execute as lightweight task"
    - label: "Full plan"    description: "Use /dev:plan for proper planning"
    - label: "Revise"       description: "Let me rewrite the task description"
  multiSelect: false
```

---

## What to Preserve as Freeform

These prompts should **NOT** be converted to AskUserQuestion — they require text input, not selections:

1. **quick skill — task description input** (line 50): "What do you need done?" — expects arbitrary task description
2. **quick skill — clarifying questions** (lines 268-273): "Which file(s) need to change?" — expects file paths or details
3. **config skill — value input**: When setting depth, model, or git mode via arguments — these are typed values, not selections

**Rule**: Use AskUserQuestion for **fixed options** (yes/no, menu selections, routing). Use plain text prompts for **freeform input** (task descriptions, file paths, custom values).

---

## Behavioral Changes Required

### status Skill: Execute vs. Display-Only

**Current**: Read-only skill, displays suggestions as text
**After conversion**: Two options:
1. **Display-only with AskUserQuestion**: Show options, user selects, skill displays "Run this: `/dev:build 2`" but doesn't execute
2. **Executable with routing**: Add Task to allowed-tools, use Skill() to execute the selected action

**Recommendation**: Option 2 (executable). This makes `/dev:status` more useful — it becomes "what should I do next?" with one-click execution.

**Required change**: Add `Task` to `allowed-tools` in status/SKILL.md frontmatter.

### resume Skill: Execute vs. Display-Only

**Current**: Read-only skill (allowed-tools: Read, Write, Glob, Grep)
**After conversion**: Same two options as status

**Recommendation**: Option 2 (executable). Resume already suggests next actions; let user pick and execute in one step.

**Required change**: Add `Task` to `allowed-tools` in resume/SKILL.md frontmatter. Note: `Write` is already allowed (for STATE.md reconciliation).

---

## Conversion Complexity Assessment

### Simple (1-2 conversion points, clear patterns)

- **status**: 1 routing menu, straightforward action-routing pattern
- **continue**: 0 conversions (fully automated)

### Medium (2-3 conversion points, some design decisions)

- **config**: 2 menus (category + toggles), need to handle follow-up flows
- **resume**: 2 menus (pause points + action confirm), need to handle executable behavior change

### Complex (edge cases, behavioral changes)

- **quick**: 1 real conversion (scope-confirm), but must preserve freeform prompts. Easy to accidentally convert text input to AskUserQuestion.

---

## Implementation Order

Recommended order for conversion:

1. **Add 6 new patterns to gate-prompts.md** — establish reusable patterns first
2. **status skill** — simplest conversion, 1 location, establishes action-routing pattern
3. **quick skill** — moderate complexity, careful to preserve freeform input
4. **resume skill** — 2 locations, similar to status but with multi-select handling
5. **config skill** — most complex, 2 locations with follow-up flows

**Skip**: continue skill (no conversions needed)

---

## Testing Strategy

After each skill conversion:

1. **Syntax validation**: Run `/dev:help {skill}` to ensure SKILL.md parses correctly
2. **Option count validation**: Verify all AskUserQuestion blocks have ≤4 options
3. **Header length validation**: Verify all `header` fields are ≤12 characters
4. **Pattern reference validation**: Verify all pattern names in skills match gate-prompts.md
5. **Freeform preservation**: Verify text input prompts weren't converted to AskUserQuestion
6. **Behavioral testing**: For status and resume, verify allowed-tools includes Task if executable behavior is enabled

**Regression testing**: Run all existing tests (`npm test`) after conversions. AskUserQuestion changes should not break existing workflows.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Converting text input to AskUserQuestion | MEDIUM | HIGH | Explicitly document which prompts must stay freeform |
| Breaking read-only skills (status, resume) | LOW | MEDIUM | Add Task to allowed-tools, test routing behavior |
| Exceeding 4-option limit | MEDIUM | LOW | Split into primary + follow-up or consolidate options |
| Inconsistent pattern names | LOW | LOW | Validate all pattern references against gate-prompts.md |
| User confusion from behavior change | MEDIUM | MEDIUM | Document new routing behavior in skill descriptions |

---

## Open Questions

1. **Should status/resume execute actions or just suggest?** — Recommendation: Execute (more useful), but needs allowed-tools update
2. **How to handle >4 pause points in resume?** — Recommendation: Show 4 most recent + "Show earlier" option
3. **Should config show all 7 categories or consolidate to 4?** — Recommendation: Consolidate to 4 primary (Depth, Model profile, Features, Git), make others sub-menus or less prominent
4. **Do we need follow-up AskUserQuestion for config sub-menus?** — Yes, after selecting "Features" category, show feature toggles as another AskUserQuestion

---

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S0 | Local Prior Research | .planning/phases/15-gate-check-upgrades/ (Phase 15 established AskUserQuestion patterns) | HIGH |
| S0 | Codebase | plugins/dev/skills/{config,status,continue,resume,quick}/SKILL.md | HIGH |
| S0 | Codebase | plugins/dev/skills/shared/gate-prompts.md | HIGH |
| S6 | Training Knowledge | AskUserQuestion 4-option limit, header 12-char limit | MEDIUM |
