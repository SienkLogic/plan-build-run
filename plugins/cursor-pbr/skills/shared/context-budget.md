<!-- canonical: ../../../pbr/skills/shared/context-budget.md -->
# Context Budget Rules

Standard rules for keeping orchestrator context lean. Reference this fragment in skills that spawn Task() subagents.

See also: `skills/shared/universal-anti-patterns.md` for the complete set of universal rules (context budget + file reading + behavioral rules).

---

## Universal Rules

Every skill that spawns agents or reads significant content must follow these rules:

1. **Never** read agent definition files (`agents/*.md`) — `subagent_type` auto-loads them
2. **Never** inline large files into Task() prompts — tell agents to read files from disk instead
3. **Minimize** reading subagent output into main context — read only frontmatter, not full content
4. **Delegate** heavy work to subagents — the orchestrator routes, it doesn't execute
5. **Before spawning agents**: If you've already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/pbr:pause` to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

## Customization

Skills should add skill-specific rules below the reference line. Common skill-specific additions:

- **build**: "Minimize reading executor output — read only SUMMARY.md frontmatter, not full content"
- **plan**: "Minimize reading subagent output — read only plan frontmatter for summaries"
- **review**: "Minimize reading subagent output — read only VERIFICATION.md frontmatter for summaries"
- **scan**: "Delegate ALL analysis to the 4 parallel codebase-mapper subagents"
- **quick**: "Never implement the task yourself — ALL code changes go through a spawned executor"
- **debug**: "Never perform investigation work yourself — delegate ALL analysis to the debugger subagent"

Format in the SKILL.md:

```markdown
## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- {Skill-specific rule 1}
- {Skill-specific rule 2}
```
