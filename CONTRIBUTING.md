# Contributing to Towline

Thank you for your interest in contributing to Towline! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/towline.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`
5. Load the plugin locally: `claude --plugin-dir .`

## What You Can Contribute

| Contribution Type | What to Do | Files Touched |
|-------------------|-----------|---------------|
| New skill | Create `skills/my-skill/SKILL.md` + supporting files | 1 directory (no existing files changed) |
| New agent | Create `agents/towline-my-agent.md` | 1 file |
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

3. Test your skill: `claude --plugin-dir . "/dev:my-skill"`

### Adding or Modifying an Agent

1. Create or edit a markdown file in `agents/`:
   ```
   agents/towline-my-agent.md
   ```

2. Include valid YAML frontmatter:
   ```yaml
   ---
   name: towline-my-agent
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
- Use `path.join()` for file paths
- Handle missing files gracefully
- Read hook input from stdin where appropriate
- Exit codes: 0 = success, 2 = block (for PreToolUse hooks)

### Skills & Agents
- Markdown files with YAML frontmatter
- No hardcoded paths; use relative references within the plugin
- Follow existing formatting conventions (check `skills/shared/ui-formatting.md`)

### Tests
- Jest test files in `tests/` directory
- Name pattern: `{script-name}.test.js`
- Tests must pass on Windows, macOS, and Linux

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

## Code of Conduct

Be respectful. Be constructive. Focus on the work.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
