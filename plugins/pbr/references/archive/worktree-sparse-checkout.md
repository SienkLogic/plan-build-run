# Worktree Sparse Checkout Reference

## Overview

Agents with `isolation: worktree` in their frontmatter run in a temporary git worktree, giving them a clean working tree isolated from the main session. By default, the full repository is checked out in the worktree. For large repos, the `worktree.sparse_paths` config property limits what gets checked out, reducing disk usage and improving worktree creation speed.

## Agents Using `isolation: worktree`

| Agent | Purpose |
|-------|---------|
| verifier | Runs verification in an isolated worktree to avoid polluting the main working tree |

## Configuration

Add `worktree.sparse_paths` to `.planning/config.json`:

```json
{
  "worktree": {
    "sparse_paths": ["src/**", "tests/**", "package.json", ".planning/**"]
  }
}
```

- **Empty array** (default): Full checkout. The entire repo is materialized in the worktree.
- **Non-empty array**: Only files matching the listed glob patterns are materialized. All other paths appear as missing in the worktree's working tree.
- **Always include `.planning/**`** so agents can read state files (STATE.md, ROADMAP.md, plans, summaries).

## How It Works

When a worktree-isolated agent is spawned, the following sequence occurs:

1. `git worktree add <path> HEAD` -- creates a new worktree linked to the current commit
2. `cd <path> && git sparse-checkout set --no-cone <patterns>` -- restricts the working tree to matching paths
3. The agent runs in the sparse worktree with only the specified files visible
4. On completion, the worktree is cleaned up with `git worktree remove <path>`

> **Note:** This config property is forward-looking. Currently, Claude Code creates full worktrees. The `sparse_paths` property will be consumed when Claude Code adds sparse checkout support to its worktree creation, or by a PBR hook that wraps worktree creation.

## Recommended Patterns

| Pattern | Purpose |
|---------|---------|
| `src/**` | Application source code |
| `tests/**` | Test files |
| `package.json` | Dependency manifest |
| `*.config.*` | Config files at root |
| `.planning/**` | PBR state and plans (always include) |

### Example: Node.js Project

```json
{
  "worktree": {
    "sparse_paths": [
      "src/**",
      "tests/**",
      "package.json",
      "tsconfig.json",
      "*.config.*",
      ".planning/**"
    ]
  }
}
```

### Example: Monorepo (Single Package)

```json
{
  "worktree": {
    "sparse_paths": [
      "packages/my-app/**",
      "package.json",
      "pnpm-workspace.yaml",
      ".planning/**"
    ]
  }
}
```

## Limitations

- **Git history is not reduced.** Sparse checkout only affects the working tree -- the full git history is still present in `.git`. For very large repos with large histories, shallow clones would also help but are not yet supported.
- **No-cone mode.** The `--no-cone` flag is used for full glob support. Cone mode (directory-based) is faster but less flexible.
- **Agent must stay within sparse paths.** If an agent tries to read or write a file outside the sparse set, the file will not exist in the worktree. The agent would need to be re-spawned with broader patterns.
