# PBR Style Guide

## Commit Messages

### Format

```
type(scope): description
```

### Types

| Type | When |
|------|------|
| `feat` | New capability |
| `fix` | Bug fix |
| `test` | Tests only (TDD RED phase) |
| `refactor` | Restructure without behavior change (TDD REFACTOR phase) |
| `docs` | Documentation, comments, metadata |
| `chore` | Config, dependencies, tooling setup |
| `enhancement` | Improve existing functionality |

### Scope Conventions

- Phase work: `feat(03-02): implement auth middleware`
- Quick tasks: `docs(quick-001): update README`
- Subsystem: `fix(discuss-phase): update STATE.md after context`
- Tooling: `chore(tooling): add build script`

### Description Rules

- Imperative mood: "add", "fix", "update" — not "added", "fixes", "updated"
- Lowercase first word (no capital after colon)
- No period at end
- Brief and technical — describe what changed, not why (that goes in the PR)
- Max ~72 characters

### Anti-Patterns

- `fix: stuff` — too vague
- `feat(03-02): Added new feature for user authentication system` — too long, past tense, capital
- `fix: resolve issue #123` — no issue numbers in commits
- `chore: update` — says nothing

### Good Examples

```
feat(03-02): add JWT token refresh endpoint
fix(execute-phase): wire phase complete after all plans finish
test(hooks): add decimal phase boundary tests
refactor(tooling): deduplicate loadHookConfig across hooks
docs: create CONTRIBUTING.md
chore: add hooks to npm test script
```

## Language & Tone

### In Workflow Files

- Direct and imperative: "Check if CONTEXT.md exists" not "You should check..."
- No filler: skip "Please note that..." or "It's important to..."
- Concrete over abstract: "Read STATE.md line 3" not "Consult the project state"

### In Agent Prompts

- Prescriptive: tell agents exactly what to do and what to produce
- Include output format: "Write to: .planning/research/STACK.md"
- Include quality gates: checkboxes the agent must satisfy

### In User-Facing Output

- Brief banners for stage transitions
- Tables for structured data
- Copy-paste commands for next steps
- No emoji unless user requests it

## Code Style

### Hook Files (JavaScript)

- CommonJS (`require`/`module.exports`) — Node.js 16+ compatibility
- Silent failure: hooks must never block on their own errors
- Config-gated: check `.planning/config.json` before activating
- Shared utilities from `hook-logger.js` — no duplicated helpers
- JSON on stdin, JSON on stdout (Claude Code hook protocol)

### pbr-tools.js

- All file mutations through `atomicWrite()` or `lockedFileUpdate()`
- JSON output via `output(obj, raw)` helper
- Error reporting via `error(msg)` (writes to stderr, exits 1)
- Commands prefixed with `cmd` (e.g., `cmdPhaseComplete`)
