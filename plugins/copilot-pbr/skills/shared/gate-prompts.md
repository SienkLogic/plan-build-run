<!-- canonical: ../../../pbr/skills/shared/gate-prompts.md -->
# Gate Prompt Patterns

> Referenced by: plan, build, import, scan, review, milestone, config, status, resume, quick, begin, discuss, explore, debug skills
> Purpose: Reusable AskUserQuestion patterns for structured gate checks

These patterns provide consistent, structured prompts for user decision points. Skills reference these patterns by name to ensure all gate checks use the same format.

## Rules

- `header` must be max 12 characters
- `multiSelect` is always `false` for gate checks
- Always handle the "Other" case (user typed a freeform response instead of selecting)

---

## Pattern: approve-revise-abort

3-option gate for plan approval, gap-closure approval.

```
Use AskUserQuestion:
  question: "Approve these {noun}?"
  header: "Approve?"
  options:
    - label: "Approve"          description: "Proceed with {action}"
    - label: "Request changes"  description: "Discuss adjustments before proceeding"
    - label: "Abort"            description: "Cancel this operation"
  multiSelect: false
```

---

## Pattern: yes-no

Simple 2-option confirmation for re-planning, rebuild, replace plans, commit.

```
Use AskUserQuestion:
  question: "{Specific question about the action}"
  header: "Confirm"
  options:
    - label: "Yes"  description: "{What happens if yes}"
    - label: "No"   description: "{What happens if no}"
  multiSelect: false
```

---

## Pattern: stale-continue

2-option refresh gate for staleness warnings, timestamp freshness.

```
Use AskUserQuestion:
  question: "{Artifact} may be outdated. Refresh or continue?"
  header: "Stale"
  options:
    - label: "Refresh"          description: "Update before proceeding (recommended)"
    - label: "Continue anyway"  description: "Proceed with current version"
  multiSelect: false
```

---

## Pattern: yes-no-pick

3-option selection for seed selection, item inclusion.

```
Use AskUserQuestion:
  question: "Include {items} in planning?"
  header: "Include?"
  options:
    - label: "Yes, all"     description: "Include all matching items"
    - label: "Let me pick"  description: "Choose which items to include"
    - label: "No"           description: "Proceed without these items"
  multiSelect: false
```

---

## Pattern: multi-option-failure

4-option failure handler for build failures.

```
Use AskUserQuestion:
  question: "Plan {id} failed. How should we proceed?"
  header: "Failed"
  options:
    - label: "Retry"     description: "Re-run this plan's executor"
    - label: "Skip"      description: "Mark as skipped, continue to next wave"
    - label: "Rollback"  description: "Undo commits, revert to last good state"
    - label: "Abort"     description: "Stop the entire build"
  multiSelect: false
```

---

## Pattern: multi-option-escalation

4-option escalation for review escalation (max AskUserQuestion supports).

```
Use AskUserQuestion:
  question: "Phase {N} has failed verification {attempt} times. How should we proceed?"
  header: "Escalate"
  options:
    - label: "Accept gaps"  description: "Mark as complete-with-gaps and move on"
    - label: "Re-plan"      description: "Go back to /pbr:plan with gap context"
    - label: "Debug"        description: "Spawn /pbr:debug to investigate root causes"
    - label: "Retry"        description: "Try one more verification cycle"
  multiSelect: false
```

Note: AskUserQuestion supports max 4 options. The original review escalation had 5 options (accept-gaps/re-plan/debug/override/retry). The "override" option is folded into the post-selection flow: if user selects "Accept gaps", offer a follow-up AskUserQuestion asking whether to accept all gaps or pick specific ones (the "override" behavior).

---

## Pattern: multi-option-gaps

4-option gap handler for review gaps-found.

```
Use AskUserQuestion:
  question: "{count} verification gaps need attention. How should we proceed?"
  header: "Gaps"
  options:
    - label: "Auto-fix"  description: "Diagnose root causes and create fix plans (recommended)"
    - label: "Override"   description: "Accept specific gaps as false positives"
    - label: "Manual"     description: "I'll fix these myself"
    - label: "Skip"       description: "Save results for later"
  multiSelect: false
```

---

## Pattern: multi-option-priority

4-option priority selection for milestone gap priority.

```
Use AskUserQuestion:
  question: "Which gaps should we address?"
  header: "Priority"
  options:
    - label: "Must-fix only"   description: "Address critical/high gaps only"
    - label: "Must + should"   description: "Address critical, high, and medium gaps"
    - label: "Everything"      description: "Address all gaps including low priority"
    - label: "Let me pick"     description: "Choose specific gaps to address"
  multiSelect: false
```

---

## Pattern: settings-category-select

4-option menu for configuration category selection (config skill).

```
Use AskUserQuestion:
  question: "What would you like to configure?"
  header: "Configure"
  options:
    - label: "Depth"          description: "quick/standard/comprehensive"
    - label: "Model profile"  description: "quality/balanced/budget/adaptive"
    - label: "Features"       description: "Toggle workflow features and gates"
    - label: "Git settings"   description: "branching strategy, commit mode"
  multiSelect: false
```

Note: Original 7 categories condensed to 4. "Models" (per-agent) merged into "Model profile". "Gates" and "Parallelization" merged into "Features". After selection, show a category-specific follow-up AskUserQuestion.

---

## Pattern: toggle-confirm

2-option confirmation for enabling/disabling boolean features (config skill).

```
Use AskUserQuestion:
  question: "Enable {feature_name}?"
  header: "Toggle"
  options:
    - label: "Enable"   description: "Turn this feature on"
    - label: "Disable"  description: "Turn this feature off"
  multiSelect: false
```

---

## Pattern: model-profile-select

4-option selection for model profile presets (config skill).

```
Use AskUserQuestion:
  question: "Select model profile"
  header: "Profile"
  options:
    - label: "Quality"    description: "opus for all agents (highest cost)"
    - label: "Balanced"   description: "sonnet/inherit mix (default)"
    - label: "Budget"     description: "haiku for all agents (lowest cost)"
    - label: "Adaptive"   description: "sonnet planning, haiku execution"
  multiSelect: false
```

---

## Pattern: action-routing

Up to 4 suggested next actions with selection (status, resume skills).

```
Use AskUserQuestion:
  question: "What would you like to do next?"
  header: "Next Step"
  options:
    - label: "{primary action}"   description: "{explanation}"
    - label: "{alternative 1}"    description: "{explanation}"
    - label: "{alternative 2}"    description: "{explanation}"
    - label: "Something else"     description: "Enter a different command"
  multiSelect: false
```

Note: Dynamically generate options from workflow state. The "Something else" option allows freeform input. Build 1-3 real options + always include "Something else" as the last option. If only 1 real option exists, use the yes-no pattern instead.

---

## Pattern: pause-point-select

Select from multiple resume points (resume skill).

```
Use AskUserQuestion:
  question: "Found multiple pause points. Which would you like to resume?"
  header: "Resume"
  options:
    - label: "Phase {A}"  description: "Paused {date}"
    - label: "Phase {B}"  description: "Paused {date}"
    - label: "Phase {C}"  description: "Paused {date}"
    - label: "Phase {D}"  description: "Paused {date}"
  multiSelect: false
```

Note: If more than 4 pause points exist, show the 4 most recent. The oldest option becomes "Show earlier" which re-prompts with the next batch.

---

## Pattern: scope-confirm

3-option confirmation for quick task scope validation (quick skill).

```
Use AskUserQuestion:
  question: "This task looks complex. Proceed as quick task or use full planning?"
  header: "Scope"
  options:
    - label: "Quick task"  description: "Execute as lightweight task"
    - label: "Full plan"   description: "Switch to /pbr:plan for proper planning"
    - label: "Revise"      description: "Let me rewrite the task description"
  multiSelect: false
```

---

## Pattern: depth-select

3-option depth selection for begin skill workflow preferences.

```
Use AskUserQuestion:
  question: "How thorough should planning be?"
  header: "Depth"
  options:
    - label: "Quick"           description: "3-5 phases, skip research, ~50% cheaper"
    - label: "Standard"        description: "5-8 phases with research (default)"
    - label: "Comprehensive"   description: "8-12 phases, deep research, ~2x cost"
  multiSelect: false
```

---

## Pattern: git-strategy-select

3-option git branching strategy for begin skill.

```
Use AskUserQuestion:
  question: "Git branching strategy?"
  header: "Git"
  options:
    - label: "None"                description: "Commit to current branch (default)"
    - label: "Phase branches"      description: "Create a branch per phase"
    - label: "Milestone branches"  description: "Create a branch per milestone"
  multiSelect: false
```

---

## Pattern: context-handling

3-option handler for existing CONTEXT.md in discuss skill.

```
Use AskUserQuestion:
  question: "Phase {N} already has a CONTEXT.md. How should we handle it?"
  header: "Context"
  options:
    - label: "Overwrite"  description: "Replace with new decisions"
    - label: "Append"     description: "Add new decisions below existing ones"
    - label: "Cancel"     description: "Keep existing and stop"
  multiSelect: false
```

---

## Pattern: gray-area-option

Dynamic template for presenting gray area choices in discuss skill.

```
Use AskUserQuestion:
  question: "{Gray area title}"
  header: "Decision"
  options:
    - label: "{Option 1}"        description: "{Concrete approach 1}"
    - label: "{Option 2}"        description: "{Concrete approach 2}"
    - label: "Let Claude decide"  description: "Mark as Claude's Discretion"
  multiSelect: false
```

Note: Options are generated at runtime based on phase analysis. The pattern defines the structure; the skill fills in options per gray area. Always include "Let Claude decide" as the last option. If more than 4 options are identified, split into a 2-step flow (AskUserQuestion supports max 4 options).

---

## Pattern: output-routing

4-option confirmation for explore skill output proposals.

```
Use AskUserQuestion:
  question: "How do you want to handle these proposed outputs?"
  header: "Outputs"
  options:
    - label: "Approve all"  description: "Create all suggested artifacts"
    - label: "Adjust"       description: "Modify the proposals before creating"
    - label: "Add more"     description: "I have additional outputs to capture"
    - label: "Skip"         description: "Don't create any artifacts from this session"
  multiSelect: false
```

---

## Pattern: debug-session-select

Dynamic template for debug session selection.

```
Use AskUserQuestion:
  question: "Found active debug sessions. Which would you like?"
  header: "Debug"
  options:
    - label: "#{NNN}: {title}"  description: "Started {date}, last: {hypothesis}"
    - label: "#{NNN}: {title}"  description: "Started {date}, last: {hypothesis}"
    - label: "#{NNN}: {title}"  description: "Started {date}, last: {hypothesis}"
    - label: "New session"      description: "Start a fresh debug investigation"
  multiSelect: false
```

Note: Options are generated at runtime from active debug sessions. If more than 3 active sessions exist, show the 3 most recent plus "New session" (max 4 options). Older sessions can be accessed by running `/pbr:debug` with the session number.

---

## Pattern: debug-checkpoint

3-option checkpoint response during debug investigation.

```
Use AskUserQuestion:
  question: "Investigation has reached a checkpoint. How should we proceed?"
  header: "Continue?"
  options:
    - label: "Continue"       description: "Keep investigating with current findings"
    - label: "More info"      description: "I have additional context to share"
    - label: "New approach"   description: "Try a different investigation angle"
  multiSelect: false
```
