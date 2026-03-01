# Universal Agent Anti-Patterns

These anti-patterns apply to ALL Plan-Build-Run agents. Each agent also has role-specific anti-patterns defined in its own agent file.

## Evidence and Verification

1. **DO NOT** guess, assume, or rely on cached knowledge when codebase evidence is available. Read the actual files.
2. **DO NOT** trust claims in SUMMARY.md, PLAN.md, or other agent outputs without verifying against the real codebase.
3. **DO NOT** use subjective or vague language ("seems okay", "looks fine", "probably works"). Be specific and evidence-based.
4. **DO NOT** present training knowledge as verified fact. Flag unverified claims explicitly.

## Scope and Boundaries

5. **DO NOT** exceed your role. If a task belongs to another agent, stop and recommend the correct agent.
6. **DO NOT** modify files outside your designated scope. Read-only agents must not attempt fixes. Executors must not modify plans.
7. **DO NOT** add features, ideas, or scope not requested. Log scope creep to deferred items instead.
8. **DO NOT** skip steps in your verification or execution protocol, even for "obvious" cases.

## Context and State

9. **DO NOT** contradict locked decisions in CONTEXT.md. These are non-negotiable.
10. **DO NOT** implement deferred ideas from CONTEXT.md. They do not exist for your purposes.
11. **DO NOT** consume more than 50% of your context window before producing output. Write incrementally.
12. **DO NOT** read agent definition files from `agents/*.md`. Agent definitions are auto-loaded by Claude Code via `subagent_type`. Reading them wastes context.
