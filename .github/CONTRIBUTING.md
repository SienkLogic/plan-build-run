# Contributing to Plan-Build-Run

Thank you for your interest in contributing to Plan-Build-Run! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/plan-build-run.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`
5. Load the plugin locally: `claude --plugin-dir .`

## What You Can Contribute

| Contribution Type | What to Do | Files Touched |
|-------------------|-----------|---------------|
| New skill | Create `skills/my-skill/SKILL.md` + supporting files | 1 directory (no existing files changed) |
| New agent | Create `agents/my-agent.md` | 1 file |
| New hook | Add script to `scripts/`, add entry to `hooks/hooks.json` | 2 files |
| Bug fix in skill | Edit the specific `SKILL.md` | 1 file |
| Bug fix in script | Edit script + update test | 2 files |
| Documentation | Edit `docs/*.md` or `README.md` | 1 file |

## Development Workflow

### Adding a New Skill

1. Create a new directory under `skills/`:
   ```
   skills/my-skill/
   ├── SKILL.md           # Required: skill definition with YAML frontmatter
   └── reference-doc.md   # Optional: supporting reference docs
   ```

2. Write `SKILL.md` with proper frontmatter:
   ```yaml
   ---
   name: my-skill
   description: "What this skill does"
   allowed-tools: Read, Write, Bash, Glob, Grep
   argument-hint: "<optional-args>"
   ---
   ```

3. Test your skill: `claude --plugin-dir . "/pbr:my-skill"`

### Adding or Modifying an Agent

1. Create or edit a markdown file in `agents/`:
   ```
   agents/my-agent.md
   ```

2. Include valid YAML frontmatter:
   ```yaml
   ---
   name: my-agent
   description: "What this agent does"
   model: sonnet|inherit|haiku
   memory: none|user|project
   tools:
     - Read
     - Write
     - Bash
   ---
   ```

3. Write the agent's system prompt in the markdown body.

### Adding a Hook Script

1. Create a Node.js script in `scripts/`:
   ```
   scripts/my-hook.js
   ```

2. Add an entry to `hooks/hooks.json` mapping the lifecycle event to your script.

3. Create a test in `tests/my-hook.test.js`.

## Code Standards

### Scripts
- Node.js (not bash) for cross-platform compatibility
- Use `path.join()` for file paths — never hardcode `/` or `\`
- Handle missing files gracefully (check existence before reading)
- Read hook input from stdin where appropriate
- Exit codes: 0 = success, 2 = block (for PreToolUse hooks)
- Log via `logHook()` from `hook-logger.js`

### Skills & Agents
- Markdown files with YAML frontmatter
- No hardcoded paths; use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative references
- Follow existing formatting conventions (check `references/ui-formatting.md`)
- Never inline agent definitions into skill files — use `subagent_type` for auto-loading

### Tests
- Jest test files in `tests/` directory
- Name pattern: `{script-name}.test.js`
- Tests must pass on Windows, macOS, and Linux
- Use `tests/fixtures/fake-project/` for read-only fixture data
- Use `fs.mkdtempSync()` for mutation tests that modify files

### Commit Messages

Commit messages are enforced by a PreToolUse hook. Format:

```
{type}({scope}): {description}
```

| Type | When to use |
|------|-------------|
| `feat` | New feature or skill |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Build, CI, dependency updates |
| `wip` | Work in progress (no scope required) |

Scopes: `{NN}-{MM}` (phase-plan), `quick-{NNN}`, `planning`, `tools`, or a descriptive word.

Examples:
```
feat(03-01): add user authentication
fix(tools): handle missing STATE.md in phase-info
docs(planning): update roadmap with phase 4
test(hooks): add spawn tests for validate-commit
```

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Run validation: `npm run validate`
5. Submit a PR with a clear description

### PR Requirements
- Passing CI (tests on Windows + macOS + Linux)
- Clear description of what changed and why
- Tests for new scripts
- No breaking changes to existing skill names or behaviors (major version bump required)

## Issue Labels

- `good-first-issue` — Simple skill improvements or documentation
- `skill-proposal` — New skill ideas for community discussion
- `agent-improvement` — Agent prompt refinements
- `platform-update` — Changes needed when Claude Code adds new features
- `breaking-change` — Requires major version bump

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly. See [SECURITY.md](./SECURITY.md) for details. Do not open a public issue for security vulnerabilities.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
