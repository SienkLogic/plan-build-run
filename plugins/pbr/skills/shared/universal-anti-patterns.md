# Universal Anti-Patterns

Rules that apply to ALL skills. Individual skills may have additional skill-specific anti-patterns listed in their own SKILL.md.

> Referenced by: all skills with Context Budget or Anti-Patterns sections

---

## Context Budget Rules (apply to every skill)

These rules prevent context rot -- quality degradation as the context window fills up.

1. **Never** read agent definition files (`agents/*.md`) -- `subagent_type` auto-loads them. Reading agent definitions into the orchestrator wastes main context for content that is automatically injected into subagent sessions.
2. **Never** inline large files into Task() prompts -- tell agents to read files from disk instead. Agents have their own 200k token context windows.
3. **Read depth scales with context window** — check `context_window_tokens` in `.planning/config.json`. At < 500000: read only frontmatter, status fields, or summaries from subagent output. At >= 500000 (1M model): full body reads are permitted when content is needed for inline decisions. See `skills/shared/context-budget.md` § "Read Depth by Context Window" for the complete table.
4. **Delegate** heavy work to Task() subagents -- the orchestrator routes, it does not build, analyze, research, investigate, or verify.
5. **Proactive pause warning**: If you have already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/pbr:pause` to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

## File Reading Rules (apply to every skill)

6. **SUMMARY.md read depth scales with context window** — at context_window_tokens < 500000: read frontmatter only from prior phase SUMMARYs. At >= 500000: full body reads are permitted for direct-dependency phases. Transitive dependencies (2+ phases back) remain frontmatter-only regardless of context window.
7. **Never** read full PLAN.md files from other phases -- only current phase plans.
8. **Never** read `.planning/logs/` files -- only the health skill reads these.
9. **Do not** re-read full file contents when frontmatter is sufficient -- frontmatter contains status, key_files, commits, and provides fields. Exception: at context_window_tokens >= 500000, re-reading a full body is acceptable when the orchestrator needs semantic content, not just structural metadata.

## Task/Subagent Rules (apply to every skill)

10. **Never** invoke `Skill()` inside a `Task()` subagent -- the Skill tool is not available in subagent contexts. Subagents spawned by `Task()` cannot resolve `/pbr:*` skill prefixes, so `Skill({ skill: "pbr:plan" })` will silently fail. Instead, chain skills at the orchestrator level (return control to the orchestrator, then call `Skill()` from there). For subagent work, use `subagent_type: "pbr:{agent}"` which auto-loads agent definitions.
11. **NEVER** use non-PBR agent types (`general-purpose`, `Explore`, `Plan`, `Bash`, `feature-dev`, etc.) -- ALWAYS use `subagent_type: "pbr:{agent}"` (e.g., `pbr:researcher`, `pbr:executor`, `pbr:general`). PBR agents have project-aware prompts, audit logging, and workflow context. Generic agents bypass all of this. A PreToolUse hook **blocks** non-PBR agent spawns by default. Exceptions: (a) bare `Task()` with no `subagent_type` for lightweight read-only briefings (see context-loader-task pattern), (b) if the user says "use native agents", add `[native]` to the Task description to bypass the block for that call.

## Questioning Anti-Patterns (apply to every skill)

Reference: `references/questioning.md` for the full anti-pattern list.

20. **Do not** walk through checklists -- checklist walking (asking items one by one from a list) is the #1 anti-pattern. Instead, use progressive depth: start broad, dig where interesting.
21. **Do not** use corporate speak -- avoid jargon like "stakeholder alignment", "synergize", "deliverables". Use plain language: "who needs to approve?", "work together", "what you'll ship".
22. **Do not** apply premature constraints -- don't narrow the solution space before understanding the problem. Ask about the problem first, then constrain.

## State Consolidation Anti-Patterns (apply to every skill)

23. **Do not** write to `.planning/CONTEXT.md` -- context is now merged into PROJECT.md ## Context section. Write to PROJECT.md instead.
24. **Do not** write to `.planning/HISTORY.md` -- history is now merged into STATE.md ## History section. Use `historyAppend()` which targets STATE.md.
25. **Do not** check for `mode === 'auto'` -- the correct value is `mode === 'autonomous'`. The schema defines `"autonomous"`, not `"auto"`.
26. **No direct Write/Edit to STATE.md or ROADMAP.md for mutations.** Always use `pbr-tools state update <field> <value>` or `roadmap update-status <phase> <status>` for mutations. Direct Write tool usage bypasses `lockedFileUpdate()` and is unsafe in multi-session environments. Exception: first-time creation of STATE.md from template (e.g., during `/pbr:begin`) is allowed.

## Behavioral Rules (apply to every skill)

11. **Do not** re-litigate decisions that are already locked in CONTEXT.md (or PROJECT.md ## Context section) -- respect locked decisions unconditionally.
12. **Do not** create artifacts the user did not approve -- always confirm before writing new planning documents.
13. **Do not** modify files outside the skill's stated scope -- check the "Files Created/Modified" table in each skill.
14. **Do not** suggest multiple next actions without clear priority -- one primary suggestion, alternatives listed secondary.
15. **Do not** use `git add .` or `git add -A` -- stage specific files only.
15b. **Do not** write STATE.md frontmatter or Current Position body section directly using Write/Edit -- use `pbr-tools.js` CLI commands (`state update`, `state patch`, `state advance-plan`, `phase complete`) which keep frontmatter and body in sync atomically. Exception: Accumulated Context sections (Decisions, Blockers, Todos) may be edited directly.
16. **Do not** include sensitive information (API keys, passwords, tokens) in planning documents or commits.

## Error Recovery Rules (apply to every skill)

17. **Git lock detection**: Before any git operation, if it fails with "Unable to create lock file", check for stale `.git/index.lock` and advise the user to remove it (do not remove automatically — another process may hold it legitimately).
18. **Config fallback awareness**: `configLoad()` returns `null` silently on invalid JSON. If your skill depends on config values, check for null and warn the user: "config.json is invalid or missing — running with defaults. Run `/pbr:health` to diagnose."
19. **Partial state recovery**: If STATE.md references a phase directory that doesn't exist, do not proceed silently. Warn the user and suggest `/pbr:health` to diagnose the mismatch.
