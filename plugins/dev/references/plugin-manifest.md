# Plugin Manifest Constraints

Hard-won knowledge about Claude Code's plugin validator behavior. These constraints are not fully documented in official docs but were discovered through testing and community reports (primarily ECC's 4 fix/revert cycles).

## plugin.json Location

The manifest file must be at `.claude-plugin/plugin.json` inside the plugin root directory.

## Required Fields

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Plugin identifier. Must match the directory name under `plugins/`. |
| `version` | string | Semver format. **Mandatory** — validator rejects without it. |
| `description` | string | Human-readable description shown in plugin listings. |

## Component Discovery

Claude Code auto-discovers components from well-known directories:

| Directory | Discovered As | Format |
|-----------|--------------|--------|
| `agents/` | Agent definitions | Markdown with YAML frontmatter |
| `skills/` | Slash commands | Each subdirectory has SKILL.md |
| `hooks/` | Lifecycle hooks | hooks.json with hook entries |
| `commands/` | Command mappings | Markdown files mapping to skills |
| `contexts/` | Behavioral profiles | Markdown files |
| `templates/` | Template files | NOT auto-discovered (loaded by skills via Read) |
| `references/` | Reference docs | NOT auto-discovered (loaded by skills via Read) |

## Critical Constraints

### 1. hooks field must NOT be in plugin.json

Hooks are auto-loaded from `hooks/hooks.json` by convention. Including a `hooks` field in plugin.json causes a **duplicate registration error** that silently breaks all hooks.

### 2. Agent paths must be explicit file paths

If you list agents in plugin.json (optional — they're auto-discovered), each entry must be a full file path like `agents/towline-executor.md`, not a directory path like `agents/`.

### 3. All component fields must be arrays

Even if there's only one value, use an array:
```json
{
  "agents": ["agents/my-agent.md"]  // correct
  "agents": "agents/my-agent.md"    // WRONG — validator rejects
}
```

### 4. version is mandatory

The validator rejects plugin.json files without a `version` field. Use semver format: `"2.0.0"`.

### 5. Windows installs are less forgiving

Windows is stricter about:
- Path separators (use forward slashes in plugin.json, even on Windows)
- File permissions (no execute bit needed for .js scripts — `node` invokes them directly)
- Case sensitivity (Windows is case-insensitive but the validator may not be)

## Towline's Current Manifest

Towline's plugin.json is intentionally minimal — it relies on auto-discovery for all components:

```json
{
  "name": "dev",
  "version": "2.0.0",
  "description": "Towline — Context-engineered development workflow...",
  "author": { "name": "SienkLogic", "email": "..." },
  "homepage": "https://github.com/SienkLogic/towline",
  "license": "MIT"
}
```

No `agents`, `skills`, `hooks`, `commands`, or `contexts` fields are declared — all are auto-discovered from their directories.

## Validation Checklist (Pre-Publish)

Before publishing to the marketplace:
1. `npm run validate` passes (checks plugin.json, skills, agents, hooks, contexts)
2. `hooks` field is NOT in plugin.json
3. `version` field matches the git tag being published
4. All hook scripts are accessible via `${CLAUDE_PLUGIN_ROOT}` paths
5. CI passes on all three platforms (ubuntu, windows, macos)
