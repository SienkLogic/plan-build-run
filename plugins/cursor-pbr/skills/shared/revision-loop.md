<!-- canonical: ../../../pbr/skills/shared/revision-loop.md -->
# Revision Loop Pattern

Standard pattern for iterative agent revision with feedback. Used when a checker/validator finds issues and the producing agent needs to revise its output.

> Referenced by: plan, import, review skills

---

## Pattern: Check-Revise-Escalate (max 3 iterations)

This pattern applies whenever:
1. An agent produces output (plans, imports, gap-closure plans)
2. A checker/validator evaluates that output
3. Issues are found that need revision

### Flow

```
iteration = 0

LOOP:
  1. Run checker/validator on current output
  2. Read checker results
  3. If PASSED or only INFO-level issues:
     → Accept output, exit loop
  4. If BLOCKER or WARNING issues found:
     a. iteration += 1
     b. If iteration > 3:
        → Escalate to user (see "After 3 Iterations" below)
     c. Re-spawn the producing agent with checker feedback appended
     d. After revision completes, go to LOOP
```

### Re-spawn Prompt Structure

When re-spawning the producing agent for revision, append the checker feedback:

```
<checker_feedback>
{Inline the checker's issue report}
</checker_feedback>

<revision_instructions>
Address ALL BLOCKER and WARNING issues identified above.
- For each BLOCKER: make the required change
- For each WARNING: address or explain why it's acceptable
- Do NOT introduce new issues while fixing existing ones
- Preserve all content not flagged by the checker
</revision_instructions>
```

### After 3 Iterations

If issues persist after 3 revision cycles:

1. Present remaining issues to the user
2. Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
   question: "Issues remain after 3 revision attempts. Proceed with current output?"
   header: "Proceed?"
   options:
     - label: "Proceed anyway"   description: "Accept output with remaining issues"
     - label: "Adjust approach"  description: "Discuss a different approach"
3. If "Proceed anyway": accept current output and continue
4. If "Adjust approach" or "Other": discuss with user, then re-enter the producing step with updated context

### Skill-Specific Variations

| Skill | Producer Agent | Checker Agent | Revision Template |
|-------|---------------|---------------|-------------------|
| plan | planner | plan-checker | `skills/plan/templates/revision-prompt.md.tmpl` |
| import | inline (orchestrator) | plan-checker | Inline revision by orchestrator |
| review (auto-fix) | planner (gap mode) | plan-checker | Same as plan |

---

## Important Notes

- **INFO-level issues are always acceptable** -- they don't trigger revision
- **Each iteration gets a fresh agent spawn** -- don't try to continue in the same context
- **Checker feedback must be inlined** -- the revision agent needs to see exactly what failed
- **Don't silently swallow issues** -- always present the final state to the user after exiting the loop
