# PBR Plugin Instructions

This file is loaded by Claude Code for all PBR plugin interactions. Rules here apply globally to every skill and agent.

## Universal Anti-Patterns

All skills and agents MUST follow the anti-patterns defined in `skills/shared/universal-anti-patterns.md`. These rules apply globally to every PBR workflow and are organized into the following categories:

- **Context Budget Rules** (1-5): Prevent context rot by never reading agent definitions, never inlining large files into Task() prompts, scaling read depth with context window size, delegating heavy work to subagents, and proactively warning about context budget.
- **File Reading Rules** (6-9): Control SUMMARY.md read depth by context window, restrict cross-phase plan reads, forbid log file reads, and prefer frontmatter over full reads.
- **Task/Subagent Rules** (10-11): Never invoke Skill() inside Task(), always use `subagent_type: "pbr:{agent}"` instead of generic agent types.
- **Questioning Anti-Patterns** (20-22): No checklist walking, no corporate speak, no premature constraints.
- **State Consolidation Anti-Patterns** (23-25): No writes to deprecated CONTEXT.md or HISTORY.md, correct mode value is "autonomous" not "auto".
- **Behavioral Rules** (11-16): Respect locked decisions, confirm before creating artifacts, stay in scope, give clear priority, stage specific files, use CLI for STATE.md writes.
- **Error Recovery Rules** (17-19): Git lock detection, config fallback awareness, partial state recovery.

The canonical source is `skills/shared/universal-anti-patterns.md`. Refer to it for the full rule definitions and details.
