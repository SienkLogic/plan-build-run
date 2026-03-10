# Contributing to Plan-Build-Run

## Branch Naming

All work goes through branches. Use these prefixes:

| Prefix | Use |
|--------|-----|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring (no behavior change) |
| `hotfix/` | Urgent production fixes |

Examples: `feat/context-budget-tracking`, `fix/decimal-phase-padding`, `hotfix/broken-transition`

## Commit Format

```
type(scope): description
```

**Types:** `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `enhancement`

**Scopes:**
- Phase work: `(03-02)` — phase-plan number
- Quick tasks: `(quick-001)`
- Tooling: `(tooling)`, `(tests)`, `(agents)`
- Workflow names: `(discuss-phase)`, `(execute-phase)`

**Rules:**
- Imperative mood: "add feature" not "added feature"
- No issue numbers in commit messages — reference issues only in the PR body
- No co-author mentions (Claude, Anthropic, etc.)
- Stage files individually — never `git add .`
- One commit per logical change

## Pull Request Format

```markdown
## What
[1-2 sentences describing the change]

## Why
[Motivation — what problem this solves or what it enables]

## Testing
[How to verify — commands to run, things to check]

## Breaking Changes
[Any incompatible changes, or "None"]
```

## Workflow

1. Create a branch from `main` with the appropriate prefix
2. Make changes with atomic commits
3. Open a PR with the format above
4. Merge after review

Direct commits to `main` are only acceptable for trivial typo fixes by maintainers.

## Development Setup

```bash
git clone https://github.com/glittercowboy/get-shit-done.git
cd get-shit-done
npm install        # Install dev dependencies
npm test           # Run all tests
```

## Testing

Tests use Node.js built-in test runner (`node:test`):

- **CLI tests:** `plan-build-run/bin/pbr-tools.test.js` — 274 tests for pbr-tools commands
- **Hook tests:** `hooks/hooks.test.js` — 12 tests for safety-critical hooks

Run all tests:
```bash
npm test
```

Run a specific test file:
```bash
node --test hooks/hooks.test.js
```

## Project Structure

```
commands/pbr/          # Slash command definitions (skill entry points)
plan-build-run/
  agents/              # Agent role definitions (markdown)
  bin/pbr-tools.js     # CLI tool (6600+ lines) — deterministic operations
  workflows/           # Multi-step workflow instructions
  templates/           # Document templates
  schemas/             # JSON schemas for validation
hooks/                 # Claude Code hooks (PreToolUse, PostToolUse, etc.)
```

## Hook Development

Hooks follow the Claude Code hook protocol: JSON on stdin, JSON on stdout.

```javascript
// PreToolUse hook — can block tool execution
process.stdout.write(JSON.stringify({ decision: 'block', reason: '...' }));
process.exit(2); // exit code 2 = hard block

// PostToolUse hook — informational only (cannot block)
process.stderr.write('Warning message');
process.exit(0);
```

Shared utilities are in `hooks/hook-logger.js` — use `loadHookConfig()` and `logHookExecution()` instead of duplicating config/logging code.

## Release Process

1. Update version in `package.json`
2. Add entry to `CHANGELOG.md` under `[Unreleased]`
3. Run `npm test` to verify
4. Merge to main
5. Tag release: `git tag v{version}`
