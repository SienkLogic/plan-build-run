# Gate Prompt Patterns

> Referenced by: plan, build, import, scan, review, milestone skills
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
    - label: "Re-plan"      description: "Go back to /dev:plan with gap context"
    - label: "Debug"        description: "Spawn /dev:debug to investigate root causes"
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
