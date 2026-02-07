# Commit Conventions

Atomic commit format and rules for Towline executors.

---

## Commit Format

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

### Full example
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

## Commit Body (optional)

For commits that need explanation, add a body:

```
feat(02-01): implement discord oauth client

- Uses discord-oauth2 library for token exchange
- Stores tokens in httpOnly cookies for security
- Supports identify and email OAuth scopes

Deviation: Added null check for user.email (Rule 3 — critical gap)
```

---

## TDD Commits

TDD tasks produce exactly 3 commits:

```
# RED — failing tests
test(02-01): add failing tests for auth middleware

# GREEN — passing implementation
feat(02-01): implement auth middleware to pass tests

# REFACTOR — clean up
refactor(02-01): extract token verification helper
```

---

## Deviation Commits

When an executor applies a deviation rule, the commit notes it:

```
# Rule 1: Bug fix
fix(02-01): fix token expiry comparison (auto-fix during execution)

# Rule 2: Missing dependency
chore(02-01): install jsonwebtoken package (auto-installed)

# Rule 3: Critical gap
fix(02-01): add null check for user profile response (critical gap)
```

---

## Atomic Commit Rules

1. **One task = one commit** (TDD tasks get 3)
2. **Commit only after verify passes** — never commit broken code
3. **Stage only files listed in `<files>`** plus any deviation-required files
4. **Never use `git add .` or `git add -A`** — stage specific files
5. **Include all files from the task** — don't leave modified files unstaged
6. **Commit message must describe what was done** — not just the task name
7. **Use the configured commit format** — from config.json `git.commit_format`

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
