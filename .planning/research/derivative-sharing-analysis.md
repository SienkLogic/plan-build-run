# Derivative Plugin Sharing Analysis

> Research date: 2026-03-06
> Scope: PBR (pbr), Cursor (cursor-pbr), GitHub Copilot (copilot-pbr)
> Purpose: Analyze all sharing mechanisms to reduce cross-plugin sync burden
> North star: Thin wrappers — derivatives become minimal (platform-specific frontmatter only)

## Current State

Three nearly-identical plugin copies:

- `plugins/pbr/` — Claude Code (~10,077 lines across 27 SKILL.md files)
- `plugins/cursor-pbr/` — Cursor (~10,050 lines)
- `plugins/copilot-pbr/` — GitHub Copilot CLI (~10,033 lines)

~30,160 total lines. Skill bodies are 99%+ identical. Only frontmatter differs:

| Field | pbr | cursor-pbr | copilot-pbr |
|---|---|---|---|
| `allowed-tools` | Present | Absent | Absent |
| `argument-hint` | Present | Present | Absent |
| Variable prefix | `${CLAUDE_PLUGIN_ROOT}` | `${PLUGIN_ROOT}` | `${PLUGIN_ROOT}` |
| Agent phrasing | "subagent" | "agent" | "agent" |

A diff of `explore/SKILL.md` between pbr and cursor-pbr: the entire diff is ONE line
(`allowed-tools`). Between pbr and copilot-pbr: two lines. The body is 100% identical.

## Mechanism 1: Symlinks

**How:** cursor-pbr/skills/plan/SKILL.md → ../pbr/skills/plan/SKILL.md

**Dev workflow:** Works for `--plugin-dir` local testing. One source, zero drift in dev.

**Distribution:** BREAKS. Plugin cache copies symlinks but resolves them — the target
(`../pbr/skills/plan/SKILL.md`) is outside the plugin directory being copied. After cache
copy, the symlink target does not exist.

**Verdict:** Dev-only. Cannot be the distribution strategy unless paired with a build step
that materializes files before publishing.

**Impact on dev-sync agent:** dev-sync would create/maintain symlinks instead of copying.
Much simpler for local dev; still needs a generate step for distribution.

**Impact on cross-plugin-compat tests:** Tests would verify symlinks point to correct targets
(simple), not that content matches (implicit via symlink).

## Mechanism 2: Relative Paths in plugin.json

**How:** `plugin.json` component paths reference files via `./` within the plugin.

**Limitation:** No mechanism for plugin A to reference files in plugin B via `plugin.json`.
The spec requires all paths to stay within the plugin directory.

**Verdict:** NOT viable for cross-plugin sharing at the plugin manifest level.

## Mechanism 3: Variable Substitution in SKILL.md

**Available variables in SKILL.md body:**

- `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`
- `${CLAUDE_SESSION_ID}`
- `${CLAUDE_SKILL_DIR}`

**What's missing:** No install-time variable substitution mechanism. There is no
`${PLATFORM}` or `${PLUGIN_ROOT}` variable that gets set differently per derivative.
The `${PLUGIN_ROOT}` used by cursor-pbr and copilot-pbr works because Claude Code expands
it — but it differs from pbr's `${CLAUDE_PLUGIN_ROOT}`.

**Critical gap:** No native way to substitute `allowed-tools` presence/absence or variable
name differences at install time. A shared SKILL.md body would either hardcode one platform's
variable name or require a build step to generate per-platform variants.

**Verdict:** Partial. `${CLAUDE_SKILL_DIR}` is a win for co-located resources (see Plan 62-02).
But cross-platform variable name differences (CLAUDE_PLUGIN_ROOT vs PLUGIN_ROOT) cannot be
bridged by variable substitution alone.

## Mechanism 4: Plugin Inheritance / Composition

**Status:** Claude Code has NO plugin inheritance model. Plugins are independent units.
One plugin cannot extend or import from another.

**Verified by:** Absence in official documentation, confirmed via plugin spec.

**Verdict:** NOT viable. No such mechanism exists.

## Mechanism 5: Build-time Generation (Thin Wrapper Architecture)

**How:** A build script (or enhanced dev-sync agent) generates cursor-pbr and copilot-pbr
from pbr source at publish/commit time.

**What the generator does:**

1. Copy SKILL.md body (no transformation needed)
2. Strip `allowed-tools` line (cursor-pbr, copilot-pbr)
3. Strip `argument-hint` line (copilot-pbr only)
4. Substitute `${CLAUDE_PLUGIN_ROOT}` → `${PLUGIN_ROOT}` (cursor-pbr, copilot-pbr)
5. Substitute "subagents" → "agents" phrasing (cursor-pbr, copilot-pbr)

**Current state:** dev-sync agent does steps 1-5 manually today. It's a "copy and transform"
agent. A generator would automate this at commit time (pre-commit hook or CI).

**Distribution:** Works. Generated files are real files in each plugin directory. No symlinks,
no magic — what's committed is what gets installed.

**Verdict:** VIABLE and recommended as the thin wrapper north star.

## Thin Wrapper North Star Assessment

**Definition:** Derivatives (cursor-pbr, copilot-pbr) contain ONLY the platform-specific
differences. The shared body lives in pbr/ and is generated into derivatives.

**In practice this means:**

- `plugins/cursor-pbr/skills/*/SKILL.md` would be generated files (not hand-maintained)
- The generator is the source of truth; derivatives are build outputs
- dev-sync agent becomes a "generate and commit" step, not a "copy and hand-edit" step

**What stays platform-specific (not shareable):**

- SKILL.md frontmatter differences (allowed-tools, argument-hint)
- Variable name differences (CLAUDE_PLUGIN_ROOT vs PLUGIN_ROOT)
- Agent phrasing differences (subagents vs agents)
- Agent file extensions (.md vs .agent.md for copilot)
- hooks.json (copilot uses bash/powershell fields instead of command)

**What becomes shared (generated from pbr/):**

- Entire SKILL.md body (99%+ of content)
- Effectively all 27 skill bodies — ~30,000 lines reduced to one source

## Impact on dev-sync Agent

**Current role:** Takes changes from pbr/ → applies platform-specific transforms → writes
to cursor-pbr/ and copilot-pbr/. Manual step invoked by developer.

**Under generator architecture:**

- dev-sync becomes a wrapper around a generator script
- Generator runs deterministically: given pbr/ input, produces cursor-pbr/ and copilot-pbr/ output
- dev-sync agent prompt becomes much simpler: "run the generator"
- Generator can also run in pre-commit hook to prevent committing un-synced derivatives

**Under symlink architecture (dev-only):**

- dev-sync creates/updates symlinks instead of copying
- Must still generate real files for distribution (separate step)
- Adds complexity: two modes (dev with symlinks, dist with real files)

## Impact on cross-plugin-compat Tests

**Current:** `cross-plugin-compat.test.js` verifies three copies have matching content
(after expected differences). Tests are high-maintenance when skills change.

**Under generator architecture:**

- Tests shift to: "generator produces correct output for given input"
- Less testing of the three plugin directories against each other
- More testing of the generator's transform logic
- Snapshot tests: given pbr/skills/plan/SKILL.md, generated cursor-pbr version matches expected

**Under symlink architecture:**

- Tests verify symlinks point to correct targets
- Content tests become implicit (same file → always match)

## Recommendation

### Near-term (this milestone): Document and prepare

- The thin wrapper architecture is the clear north star
- No implementation yet (deferred per CONTEXT.md)
- Phase 62 SKILL.md migration (Plan 62-02) is compatible with the generator approach —
  `${CLAUDE_SKILL_DIR}` paths work the same in all three plugin variants

### Future phase: Implement generator

1. Write a Node.js generator script (`scripts/generate-derivatives.js`)
2. Generator reads pbr/ SKILL.md files, applies transforms, writes cursor-pbr/ and copilot-pbr/
3. Add generator to pre-commit hook for automatic sync
4. Update cross-plugin-compat tests to test generator output
5. Deprecate manual dev-sync agent (or simplify it to just run the generator)

### Decision: Symlinks are a dev convenience only

Use symlinks for local experimentation. Do not build the architecture on symlinks as they
break marketplace distribution. Generator is the right path.

### Decision: Variable substitution is not sufficient alone

`${CLAUDE_SKILL_DIR}` is a real win for co-located resources. But cross-platform variable
name differences require either a generator or accepted redundancy (status quo). There is no
native Claude Code mechanism for install-time variable substitution.
