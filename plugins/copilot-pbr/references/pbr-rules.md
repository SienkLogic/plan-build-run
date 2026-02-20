<!-- canonical: ../../pbr/references/pbr-rules.md -->
# Plan-Build-Run Rules

Authoritative rules for all Plan-Build-Run skills, agents, hooks, and workflows.
Condensed from the 3,100-line `docs/DEVELOPMENT-GUIDE.md`. When in doubt, these rules govern.

---

## Philosophy

1. **Context is precious.** The orchestrator stays lean (~15% usage). Delegate heavy work to subagents.
2. **State lives on disk.** Skills and agents communicate through `.planning/` files, not messages.
3. **Agents are black boxes.** Clear input/output contracts. Agents never read other agent definitions.
4. **Gates provide safety.** Users control pace via config toggles. Never skip a gate.
5. **One task, one commit.** Atomic commits for clean history and easy rollback.
6. **Cross-platform always.** `path.join()`, CommonJS, test on Windows/macOS/Linux.
7. **Test everything.** 70% coverage minimum. All 9 CI matrix combinations must pass.
8. **PLAN-BUILD-RUN branding only.** Always use `PLAN-BUILD-RUN ►` prefix in banners.

---

## Context Budget

9. Target 15% orchestrator context usage. Warn user at 30%.
10. **Never** read agent definitions (`agents/*.md`) in the orchestrator — `subagent_type` auto-loads them.
11. **Never** inline large files into `Task()` prompts — tell agents to read files from disk.
12. **Never** read full subagent output — read frontmatter only (first 10-20 lines).
13. Read STATE.md and config.json fully. Read ROADMAP.md by section. Read PLAN.md/SUMMARY.md/VERIFICATION.md frontmatter only.
14. Use the `limit` parameter on Read to restrict line counts.
15. Proactively suggest `/pbr:pause` when context gets heavy — before compaction, not after.
15b. **After compaction or context recovery**, always read `.planning/STATE.md` (especially the `## Session Continuity` section) before proceeding with any work. The PreCompact hook writes recovery state there automatically.

---

## State Management

16. STATE.md is the **single source of truth** for current position.
17. **Never** infer current phase from directory listings, git log, or conversation history.
18. Always read STATE.md before making state-dependent decisions.
19. Update STATE.md at: begin, plan, build, review, pause, continue, milestone.
20. **Never** commit STATE.md mid-skill — hooks handle session persistence.
21. Agents write artifacts (SUMMARY.md, VERIFICATION.md). Only the orchestrator writes STATE.md.
22. Every ROADMAP.md phase must have a matching `.planning/phases/` directory, and vice versa.
23. config.json is validated against `scripts/config-schema.json` on load.

---

## Agent Spawning

24. Always use `subagent_type: "pbr:{name}"` to spawn agents.
25. Pass file paths to agents, not file contents.
26. Agents never read other agent definition files.
27. Each agent gets a fresh 200k token context window — let them do the heavy reading.

---

## User Interaction Patterns

28. Use `AskUserQuestion` for all structured gate checks — never plain-text "Type approved" prompts.
29. AskUserQuestion is an orchestrator-only tool. It **cannot** be called from subagents (Task contexts).
30. Max 4 options per AskUserQuestion call. If more options exist, split into a 2-step flow.
31. `header` field must be max 12 characters. Keep it a single word when possible.
32. `multiSelect` is always `false` for Plan-Build-Run gate checks.
33. Always handle the "Other" case — users may type freeform text instead of selecting an option.
34. Reuse patterns from `skills/shared/gate-prompts.md` by name. Do not reinvent prompts inline.
35. Do **not** use AskUserQuestion for freeform text input (symptom gathering, Socratic discussion, open-ended questions). Use plain conversation for those.
36. Skills that do not require user interaction (continue, health, help, pause) intentionally omit AskUserQuestion from allowed-tools.

---

## Skill Authoring

37. Every SKILL.md starts with YAML frontmatter: `name`, `description`, `allowed-tools`, `argument-hint`.
38. Skills that spawn agents **must** have a `## Context Budget` section.
39. Mark each step as `(inline)` or `(delegate)` — inline for light work, delegate for analysis.
40. Reference templates and references by filename — never inline them.
41. Gate checks: read config toggle → display summary → ask user → proceed/abort/revise.
42. Use branded UI elements from `references/ui-formatting.md`.

---

## Agent Authoring

43. Every agent file starts with YAML frontmatter: `name`, `description`, `model`, `memory`, `tools`.
44. Agent name matches the agent file name (no prefix needed).
45. `tools` array: only include tools the agent actually uses.
46. Agents write artifacts to disk. They never modify STATE.md or ROADMAP.md.
47. Agent definitions are self-contained — no cross-agent references.

---

## Hook Development

48. All hooks use **CommonJS** (`require`), never ES modules (`import`).
49. All hooks call `logHook()` from `hook-logger.js`. No silent exits.
50. Exit codes: `0` = allow/success, `2` = block (PreToolUse only), other = error (logged, non-blocking).
51. Hooks receive JSON on stdin, write JSON to stdout.
52. Fail gracefully: wrap in try/catch, exit 0 on parse errors.
53. Every hook in `hooks.json` must have a `statusMessage` field (gerund form: "Validating...", keep short).
54. Windows file deletion: use 3-attempt retry loop to handle AV/indexer locks.
55. Every hook script must have a corresponding `tests/{name}.test.js`.

---

## Commits

56. Format: `{type}({scope}): {description}`.
57. Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `wip`.
58. Valid scopes: `{NN}-{MM}` (phase-plan), `quick-{NNN}`, `planning`, or any lowercase word.
59. **Never** use `git add .` or `git add -A` — stage specific files only.
60. Blocked files: `.env` (not `.env.example`), `*.key`, `*.pem`, `*.pfx`, `*.p12`, `*credential*`, `*secret*` (unless in `tests/` or `*.example`).
61. TDD tasks: exactly 3 commits — RED (test), GREEN (feat), REFACTOR.
62. Executors: one atomic commit per task.

---

## Templates

63. Default syntax: `{variable}` placeholders for string substitution.
64. Only use EJS (`<%= %>`, `<% %>`) when loops or conditionals are genuinely needed.
65. Template files use `.tmpl` extension. Name matches the output file (e.g., `SUMMARY.md.tmpl` → `SUMMARY.md`).
66. Templates live in `templates/` (global), `templates/codebase/` (scan), `templates/research/` (research), or `skills/{name}/templates/` (skill-specific).

---

## File Naming

67. Skills: `plugins/pbr/skills/{skill-name}/SKILL.md` — lowercase hyphenated dir, uppercase `SKILL.md`.
68. Agents: `plugins/pbr/agents/{name}.md` — agent name matches file name.
69. Scripts: `plugins/pbr/scripts/{name}.js` — lowercase, hyphenated, CommonJS.
70. References: `plugins/pbr/references/{name}.md` — lowercase, hyphenated.
71. Tests: `tests/{script-name}.test.js` — mirrors the script name.

---

## Testing

72. Test files mirror script names: `scripts/foo.js` → `tests/foo.test.js`.
73. Use the fixture project at `tests/fixtures/fake-project/` for integration tests.
74. Hook tests: use stdin/stdout protocol with `execSync()`, timeout 5000ms, run in temp dir.
75. Coverage target: 70% branches/functions/lines/statements.
76. CI matrix: Node 18/20/22 × ubuntu/macos/windows. All 9 must pass.
77. Local pre-push: `npm run lint && npm test && npm run validate`.

---

## Cross-Platform

78. **Never** hardcode `/` or `\` — always `path.join()`.
79. Use `\n` in string literals — Node.js and Git normalize line endings.
80. In `hooks.json`, use `${CLAUDE_PLUGIN_ROOT}` — Claude Code expands this internally on all platforms.
81. **Never** use `$CLAUDE_PLUGIN_ROOT` (shell expansion is platform-dependent).
82. **Never** rely on execute bits — always invoke via `node script.js`.

---

## Dependencies & Gates

83. Check all `depends_on` plans have SUMMARY.md files before executing.
84. Checkpoint tasks (`checkpoint:human-verify`) require STOP — write partial SUMMARY.md, return metadata.
85. Respect all `gates.confirm_*` config toggles. Never auto-proceed when a gate is enabled.

---

## Logging

86. Hook scripts → `logHook()` (writes to `logs/hooks.jsonl`, max 200 entries).
87. Workflow milestones → `logEvent()` (writes to `logs/events.jsonl`, max 1,000 entries).
88. Rule of thumb: inside a hook? `logHook()`. Tracking a high-level event? `logEvent()`.

---

## Gotchas

89. JSDoc `*/` in glob patterns closes Babel comments early — use `//` line comments instead.
90. Regex anchors: use `\b` word boundaries, not `^` anchors (misses chained commands like `cd && git commit`).
91. Windows cwd locking in tests: use `cwd` option in `execSync()` instead of `process.chdir()`.
92. PLAN.md frontmatter must include all required fields: `phase`, `plan`, `type`, `wave`, `depends_on`, `files_modified`, `autonomous`, `must_haves`.

---

## Quick Reference: Never Do This

| # | Anti-Pattern | Impact |
|---|-------------|--------|
| 1 | Read agent definitions in orchestrator | Context balloons 15% → 88% |
| 2 | Inline large files into Task() prompts | Wasted orchestrator context |
| 3 | Read full subagent output | Context bloat |
| 4 | Use non-Plan-Build-Run branding | User confusion |
| 5 | Hardcode path separators | Cross-platform breakage |
| 6 | Use ES modules in hooks | Hook fails to load |
| 7 | Skip hook logging | Silent failures |
| 8 | Modify STATE.md in agents | Race conditions, corruption |
| 9 | Use `git add .` | Sensitive data leaks |
| 10 | Skip tests for new scripts | CI failures, regressions |
