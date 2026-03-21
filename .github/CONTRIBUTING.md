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
git clone https://github.com/SienkLogic/plan-build-run.git
cd plan-build-run
npm install        # Install dev dependencies
npm test           # Run all tests
npm run lint       # Run ESLint
```

## Testing

Tests use Jest (138 suites, 3650+ tests):

```bash
npm test                    # Run all tests
npm run test:coverage       # Run with coverage enforcement (70/68/70/70)
npm run test:dashboard      # Run dashboard Vitest tests
npx jest tests/my-test.js   # Run a specific test file
```

## Project Structure

```
agents/pbr-*.md            # 14 agent definitions with color-coded frontmatter
commands/pbr/              # 41 slash command registrations
plan-build-run/
  skills/                  # 28 skill definitions (SKILL.md + templates)
  scripts/pbr-tools.js        # CLI tool — deterministic operations
  references/              # Shared reference documents
  templates/               # Document templates
hooks/                     # 49 hook scripts (PreToolUse, PostToolUse, etc.)
plugins/                   # 4 derivative plugins (pbr, cursor-pbr, copilot-pbr, codex-pbr)
dashboard/                 # Vite + React 18 web dashboard
```

## Hook Development

Hooks follow the Claude Code hook protocol: JSON on stdin, JSON on stdout. All hooks must use `if (require.main === module)` guards and export `handleHttp` for hook-server integration.

```javascript
// PreToolUse hook — can block tool execution
process.stdout.write(JSON.stringify({ decision: 'block', reason: '...' }));
process.exit(2); // exit code 2 = hard block

// PostToolUse hook — informational only (cannot block)
process.stderr.write('Warning message');
process.exit(0);
```

Shared utilities: `hooks/hook-logger.js` for logging, `hooks/run-hook.js` for cross-platform hook execution.

## Release Process

1. Update version in `package.json`
2. Add entry to `CHANGELOG.md` under `[Unreleased]`
3. Run `npm test` to verify
4. Merge to main
5. Tag release: `git tag v{version}`
