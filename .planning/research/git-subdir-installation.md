# git-subdir Installation for Plan-Build-Run

> Research date: 2026-03-06
> Scope: PBR plugin (plugins/pbr/) only
> Purpose: Evaluate whether git-subdir plugin source enables simpler PBR installation
> Verdict: VIABLE — see Recommendation section

## What is git-subdir?

`git-subdir` is a Claude Code plugin source type for marketplace entries. It allows pointing to
a subdirectory within a git repository using sparse/partial cloning, minimizing bandwidth.

Schema:

```json
{
  "name": "plan-build-run",
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/SienkLogic/plan-build-run.git",
    "path": "plugins/pbr",
    "ref": "main",
    "sha": "a1b2c3d4..."
  }
}
```

Fields: url (required), path (required subdirectory), ref (branch/tag), sha (exact pin).

## Why This Matters for PBR

PBR lives in a monorepo with three plugin variants, tests, and a dashboard. Without git-subdir,
installation requires cloning the entire repo and running manual install steps. git-subdir would
allow `path: "plugins/pbr"` to install only the PBR plugin — sparse-cloning ~30% of the repo.

## Cache Model and Self-Containment

Claude Code copies the plugin subdirectory to:
`~/.claude/plugins/cache/{marketplace}/{name}/{version}/`

After copy, `${CLAUDE_PLUGIN_ROOT}` resolves to this cache directory. All references inside
the plugin must resolve within that directory.

PBR's `plugins/pbr/` directory is self-contained:

- `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}/scripts/...` (resolves to cached scripts/)
- All scripts use relative `require()` calls within `scripts/` (e.g., `require('./pbr-tools.js')`)
- `references/`, `templates/`, `agents/`, `skills/` all live inside `plugins/pbr/`
- No files referenced via paths that traverse outside `plugins/pbr/`

## Edge Cases Analysis

### 1. Hook script path resolution

hooks.json bootstrap: `require(require('path').resolve(r, 'scripts', 'run-hook.js'))`
where `r` is `CLAUDE_PLUGIN_ROOT`. After cache copy, this resolves to the cached `scripts/`.
**Result: Works correctly.**

### 2. Internal require() calls in scripts

Scripts use `require('./hook-logger')`, `require('./pbr-tools')`, etc. — all relative within
`scripts/`. After cache copy, all scripts land in the same directory.
**Result: Works correctly.**

### 3. MSYS path issue on Windows

The hooks.json bootstrap already converts `/d/Repos/...` MSYS paths to `D:\Repos\...`.
After cache installation, `CLAUDE_PLUGIN_ROOT` is a native Windows path — the MSYS conversion
remains a harmless no-op safety net.
**Result: Works correctly.**

### 4. Version pinning

`ref: "v3.0.0"` pins to a tag; `sha: "abc..."` pins to an exact commit. Cache invalidation
triggers when `version` in `plugin.json` changes. Users on a branch ref get updates when the
marketplace entry's SHA changes.
**Result: Both pin modes supported. Tag-based is recommended for stability.**

### 5. Tests and dashboard excluded

`tests/` and `dashboard/` are outside `plugins/pbr/`. After git-subdir install, users receive
plugin files only — no test infrastructure, no dashboard npm tree. The dashboard skill installs
its own deps at runtime (`npm install --prefix dashboard/`), but the `dashboard/` source
directory itself is not present.
**Implication:** Dashboard would be non-functional for git-subdir installs unless the dashboard
is moved into `plugins/pbr/` or distributed separately. This is a significant constraint.

### 6. No subdirectory support for `github` source type

The `github` source type (short `owner/repo` form) does NOT support a `path` field. Only the
`git-subdir` source type (full URL) supports subdirectory paths. Issue #20268 in
anthropics/claude-code tracks this gap.

### 7. Marketplace requirement

git-subdir is used inside a marketplace entry — it cannot be used directly via `/plugin install`.
PBR needs a `marketplace.json` to expose this install path. Options:

- Add `.claude-plugin/marketplace.json` at repo root listing the PBR plugin
- Reference with `extraKnownMarketplaces` in the repo's `.claude/settings.json`
- Publish to Claude Code's official marketplace (requires review process)

### 8. Sparse clone bandwidth

git-subdir uses sparse checkout. For PBR's monorepo, this avoids cloning ~70% of the repo
(tests/, dashboard/, cursor-pbr/, copilot-pbr/). Significant bandwidth saving for first install.

## Required Marketplace Setup

To ship git-subdir as an install path, PBR would need:

1. A `marketplace.json` file (location TBD — repo root `.claude-plugin/marketplace.json` or
   a separate standalone marketplace repo).
2. Register the marketplace via `extraKnownMarketplaces` in `.claude/settings.json` so Claude
   Code surfaces it to users automatically.
3. Manage version tags consistently (tags like `v3.0.0` on the repo that git-subdir can reference).

## Recommendation

**git-subdir is viable for PBR plugin installation** with one significant caveat: the dashboard
would not be available to git-subdir installs in its current location.

**If shipping this path:**

- Short-term: Document that dashboard requires manual clone; git-subdir installs get all PBR
  workflow features but not the dashboard UI.
- Long-term: Consider moving the dashboard entrypoint into `plugins/pbr/` (the Express app
  could remain in `dashboard/` but referenced via a skill that downloads/builds it at first run).

**Recommended approach if proceeding:**

1. Create `.claude-plugin/marketplace.json` at repo root
2. Add `extraKnownMarketplaces` to the repo's `.claude/settings.json`
3. Pin releases via git tags matching `plugin.json` version
4. Document dashboard limitation clearly in the marketplace description

**Next step**: This research informs a future implementation phase. No code changes in Phase 62.
