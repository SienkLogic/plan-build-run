<!-- canonical: ../../pbr/references/git-integration.md -->
# Git Integration Reference

Plan-Build-Run's commit conventions, commit points, branching strategy, and hook scripts.

---

## Commit Message Format

```
{type}({phase}-{plan}): {description}
```

### Components

| Part | Description | Example |
|------|-------------|---------|
| `{type}` | Conventional commit type | `feat`, `fix`, `test` |
| `{phase}` | Phase number (zero-padded) | `02` |
| `{plan}` | Plan number | `01` |
| `{description}` | Imperative, lowercase description | `implement discord oauth client` |

The format is configurable via `config.json` at `git.commit_format`. The default is `{type}({phase}-{plan}): {description}`.

### Full Example
```
feat(02-01): implement discord oauth client
```

---

## Commit Types

| Type | When to Use | Example |
|------|------------|---------|
| `feat` | New feature or functionality | `feat(02-01): implement discord oauth client` |
| `fix` | Bug fix (including during execution) | `fix(02-01): handle null user profile from discord api` |
| `refactor` | Code restructuring, no behavior change | `refactor(02-01): extract token validation into helper` |
| `test` | Adding or modifying tests | `test(02-01): add failing tests for discord oauth flow` |
| `docs` | Documentation changes | `docs(03-02): add api endpoint documentation` |
| `chore` | Build config, dependencies, tooling | `chore(01-01): configure typescript and eslint` |
| `style` | Formatting, whitespace (no logic change) | `style(02-01): fix import ordering` |

---

## Special Commit Scopes

Beyond the standard `{phase}-{plan}` scope, Plan-Build-Run recognizes these additional patterns:

| Pattern | When Used | Example |
|---------|-----------|---------|
| `{type}(quick-{NNN})` | Quick-task commits via `/pbr:quick` | `feat(quick-001): add health endpoint` |
| `docs(planning)` | Planning document commits | `docs(planning): add phase 3 plans` |
| `wip: {desc}` or `wip({area}): {desc}` | Work-in-progress (use sparingly) | `wip(auth): partial oauth implementation` |
| Merge commits | Git merge operations | `Merge branch 'plan-build-run/phase-02-auth'` |

---

## Commit Body (Optional)

For commits that need explanation, add a body after a blank line:

```
feat(02-01): implement discord oauth client

- Uses discord-oauth2 library for token exchange
- Stores tokens in httpOnly cookies for security
- Supports identify and email OAuth scopes

Deviation: Added null check for user.email (Rule 3 -- critical gap)
```

---

## Commit Points

Plan-Build-Run defines strict rules about WHEN commits happen:

### One Task = One Commit

Each successfully completed plan task gets exactly one atomic commit. No more, no less.

### TDD Tasks = Three Commits

TDD tasks (`tdd="true"`) produce exactly 3 commits following Red-Green-Refactor:

```
test(02-01): RED - add failing tests for auth middleware
feat(02-01): GREEN - implement auth middleware to pass tests
refactor(02-01): REFACTOR - extract token verification helper
```

### Commit Preconditions

A commit is created only when:
1. All `<action>` steps in the task are complete
2. All `<verify>` commands pass with exit code 0
3. Only files listed in the task's `<files>` element are staged (plus deviation-required files)

### Deviation Commits

When an executor applies a deviation rule during a task, the deviation is included in the same task commit (not a separate commit):

```
# Rule 1 auto-fix: rolled into the task's commit
# Rule 2 auto-install: package.json/lock added to same commit
# Rule 3 critical gap: null check added in same commit
```

---

## Atomic Commit Rules

1. **One task = one commit** (TDD tasks get 3)
2. **Commit only after verify passes** -- never commit broken code
3. **Stage only files listed in `<files>`** plus any deviation-required files
4. **Never use `git add .` or `git add -A`** -- stage specific files
5. **Include all files from the task** -- do not leave modified files unstaged
6. **Commit message must describe what was done** -- not just the task name
7. **Use the configured commit format** -- from `config.json` `git.commit_format`

---

## Staging Examples

```bash
# Standard task
git add src/auth/discord.ts src/auth/types.ts
git commit -m "feat(02-01): implement Discord OAuth client with token exchange"

# Task that also installed a dependency (Rule 2)
git add src/auth/discord.ts src/auth/types.ts package.json package-lock.json
git commit -m "feat(02-01): implement Discord OAuth client with token exchange"

# TDD RED
git add tests/auth/discord.test.ts
git commit -m "test(02-01): add failing tests for Discord OAuth flow"
```

---

## Git Retry Logic

If `git commit` fails with a lock error (`fatal: Unable to create ... .git/index.lock`):
1. Wait 2 seconds
2. Retry the commit
3. Maximum 3 attempts
4. If still failing after 3 attempts, report the error and stop

This commonly occurs when parallel executors compete for the git index lock.

---

## Branching Strategy

Configured via `config.json` at `git.branching`:

| Strategy | Behavior |
|----------|----------|
| `none` | All commits go directly to the current branch (default) |
| `phase` | Each phase gets its own branch: `plan-build-run/phase-{NN}-{slug}`. Squash-merged to main on completion. |
| `milestone` | Each milestone gets a branch: `plan-build-run/{milestone}-{slug}`. Merged on milestone completion. |
| `disabled` | No git operations at all. No commits, no branching. Useful for prototyping or non-git projects. |

### Phase Branching Flow

When `git.branching` is `phase`:
1. Build orchestrator creates branch: `git checkout -b plan-build-run/phase-{NN}-{slug}`
2. All executor commits go to the phase branch
3. After all plans complete and verification passes, orchestrator asks user to confirm squash merge
4. If confirmed: `git checkout main && git merge --squash plan-build-run/phase-{NN}-{slug}`
5. Phase branch is deleted after merge

Branch name templates are configured in `config.json`:
- `git.phase_branch_template`: Default `plan-build-run/phase-{phase}-{slug}`
- `git.milestone_branch_template`: Default `plan-build-run/{milestone}-{slug}`

### Git Mode

The `git.mode` field controls whether git integration is active:

| Mode | Behavior |
|------|----------|
| `enabled` | Normal operation -- commits, branching, hooks all active (default) |
| `disabled` | No git commands are run. No commits, no branching. Useful for non-git projects. |

---

## Hook Scripts

Plan-Build-Run uses Claude Code hooks (defined in `hooks/hooks.json`) to enforce conventions and track progress during execution. All hooks log via `hook-logger.js` to `.planning/.hook-log` (JSONL format, max 200 entries).

### Hook Summary

| Hook Event | Script | Purpose |
|------------|--------|---------|
| `SessionStart` | `progress-tracker.js` | Displays current project progress on session start |
| `PostToolUse` (Write/Edit) | `check-plan-format.js` | Validates plan file YAML frontmatter after writes |
| `PostToolUse` (Write/Edit) | `check-roadmap-sync.js` | Ensures ROADMAP.md stays in sync with phase changes |
| `PreToolUse` (Bash) | `validate-commit.js` | Validates commit message format before `git commit` runs |
| `PreCompact` | `context-budget-check.js` | Warns about context budget before compaction |
| `Stop` | `auto-continue.js` | Handles auto-continuation signal when session ends |
| `SubagentStart` | `log-subagent.js start` | Logs subagent spawn events |
| `SubagentStop` | `log-subagent.js stop` | Logs subagent completion events |
| `SessionEnd` | `session-cleanup.js` | Cleans up temporary state on session end |

### validate-commit.js Details

The commit validation hook (`PreToolUse` on Bash commands) enforces the commit format:
- Checks that `git commit -m "..."` messages match the pattern: `{type}({scope}): {description}`
- Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `wip`
- Allows merge commits (starting with "Merge")
- Allows quick-task, planning, and WIP scope patterns
- Blocks commits with sensitive file patterns (`.env`, `.key`, `.pem`, credentials) unless they match safe patterns (`.example`, `.template`, `.sample`, test directories)
- Exit code 2 blocks the commit; exit code 0 allows it

---

## Planning Doc Commits

When `config.json` has `planning.commit_docs: true`, the build orchestrator commits planning artifacts (SUMMARY.md, VERIFICATION.md) after all plans in a phase complete:

```
docs({phase}): add build summaries and verification
```

This keeps the planning trail in version control alongside the code it describes.
