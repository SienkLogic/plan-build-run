# Universal Anti-Patterns

Rules that apply to ALL skills. Individual skills may have additional skill-specific anti-patterns listed in their own SKILL.md.

> Referenced by: all skills with Context Budget or Anti-Patterns sections

---

## Context Budget Rules (apply to every skill)

These rules prevent context rot -- quality degradation as the context window fills up.

1. **Never** read agent definition files (`agents/*.md`) -- `subagent_type` auto-loads them. Reading agent definitions into the orchestrator wastes main context for content that is automatically injected into subagent sessions.
2. **Never** inline large files into Task() prompts -- tell agents to read files from disk instead. Agents have their own 200k token context windows.
3. **Minimize** reading subagent output into main context -- read only frontmatter, status fields, or summaries. Never read full SUMMARY.md, VERIFICATION.md, or RESEARCH.md bodies into the orchestrator unless specifically needed for inline presentation.
4. **Delegate** heavy work to Task() subagents -- the orchestrator routes, it does not build, analyze, research, investigate, or verify.
5. **Proactive pause warning**: If you have already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/pbr:pause` to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

## File Reading Rules (apply to every skill)

6. **Never** read full SUMMARY.md bodies from prior phases -- read frontmatter only (unless the skill specifically requires body content for presentation).
7. **Never** read full PLAN.md files from other phases -- only current phase plans.
8. **Never** read `.planning/logs/` files -- only the health skill reads these.
9. **Do not** re-read full file contents when frontmatter is sufficient -- frontmatter contains status, key_files, commits, and provides fields.

## Behavioral Rules (apply to every skill)

10. **Do not** re-litigate decisions that are already locked in CONTEXT.md -- respect locked decisions unconditionally.
11. **Do not** create artifacts the user did not approve -- always confirm before writing new planning documents.
12. **Do not** modify files outside the skill's stated scope -- check the "Files Created/Modified" table in each skill.
13. **Do not** suggest multiple next actions without clear priority -- one primary suggestion, alternatives listed secondary.
14. **Do not** use `git add .` or `git add -A` -- stage specific files only.
15. **Do not** include sensitive information (API keys, passwords, tokens) in planning documents or commits.
