---
phase: "19-shared-file-write-safety"
plan: "19-03"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plan-build-run/bin/pbr-tools.cjs"
  - "plan-build-run/bin/lib/state.cjs"
  - "plugins/pbr/skills/milestone/SKILL.md"
must_haves:
  truths:
    - "Running 'pbr-tools.js state reconcile' resets phases_total and current_phase in STATE.md to match the actual ROADMAP.md phase count and current milestone"
    - "The reconcile command removes phantom phase rows from the ROADMAP.md Progress table that no longer have corresponding phase directories"
    - "milestone/SKILL.md NEXT UP section mentions 'state reconcile' as a post-archival cleanup command"
  artifacts:
    - "pbr-tools.cjs handles 'state reconcile' subcommand calling stateReconcile(planningDir)"
    - "stateReconcile() function in state.cjs (or pbr-tools.cjs) that re-derives phase counts from ROADMAP.md and cleans phantom phases"
  key_links:
    - "milestone/SKILL.md references pbr-tools.js state reconcile in its post-completion cleanup steps"
implements: []
provides:
  - "pbr-tools state reconcile command for post-milestone state cleanup"
consumes:
  - "ROADMAP.md phase structure (reads to derive correct counts)"
  - "STATE.md (reads and patches fields)"
---

<task id="19-03-T1" type="auto" tdd="false" complexity="medium">
<name>Implement stateReconcile() and wire into pbr-tools.cjs</name>
<read_first>
plan-build-run/bin/pbr-tools.cjs
plan-build-run/bin/lib/state.cjs
plugins/pbr/scripts/lib/state.js
plugins/pbr/scripts/lib/roadmap.js
</read_first>
<files>
plan-build-run/bin/pbr-tools.cjs
plan-build-run/bin/lib/state.cjs
</files>
<action>
Add `state reconcile` subcommand to pbr-tools.cjs.

**Step 1: Implement stateReconcile() in plan-build-run/bin/lib/state.cjs**

Add a new exported function `stateReconcile(planningDir)` that:

1. Reads `STATE.md` frontmatter using the existing `stateLoad(planningDir)` helper.
2. Reads `ROADMAP.md` content to extract:
   - The active milestone's phase list (phases in the current in-progress milestone section)
   - Total phase count for the active milestone
   - The lowest-numbered phase whose status is NOT `complete`, `verified`, or `shipped` — this is the correct `current_phase`
3. Reads the `.planning/phases/` directory to get the list of actual phase directories on disk (those with `NN-` prefix matching `\d{2}-`).
4. Computes corrections:
   - `phases_total`: count of phases in active milestone from ROADMAP.md
   - `current_phase`: lowest non-complete phase number from ROADMAP.md active milestone
   - phantom phases: ROADMAP.md Progress table rows whose phase number has no corresponding directory in `.planning/phases/`
5. Applies corrections to STATE.md using `lockedFileUpdate()` (NOT direct writeFileSync):
   - Patch `phases_total` if it differs from computed value
   - Patch `current_phase` if it differs from computed value
   - Log each correction made
6. Returns a result object: `{ corrected: boolean, changes: string[], phantoms: string[] }`

**Phantom phase handling:** For the MVP, log phantom phase rows to the result `phantoms` array but do NOT automatically remove them from ROADMAP.md — removal is destructive and requires user confirmation. The CLI output will report phantoms so the user can manually review.

**Step 2: Wire into pbr-tools.cjs**

Find the block where `state` subcommands are dispatched (around line 677 in pbr-tools.cjs). Add a new case:

```js
} else if (command === 'state' && subcommand === 'reconcile') {
  const result = lib.stateReconcile(planningDir);
  if (result.changes.length > 0) {
    console.log('Reconciled STATE.md:');
    result.changes.forEach(c => console.log('  ' + c));
  } else {
    console.log('STATE.md is consistent with ROADMAP.md — no changes needed.');
  }
  if (result.phantoms.length > 0) {
    console.log('Phantom ROADMAP phases (no directory on disk):');
    result.phantoms.forEach(p => console.log('  ' + p));
    console.log('Review and remove manually if no longer needed.');
  }
```

**Data contracts:**

| Parameter | Source | Context |
|-----------|--------|---------|
| `planningDir` | `process.env.PBR_PROJECT_ROOT || process.cwd() + '/.planning'` | pbr-tools.cjs main dispatch |
| ROADMAP.md path | `path.join(planningDir, 'ROADMAP.md')` | stateReconcile internals |
| phases/ path | `path.join(planningDir, 'phases')` | stateReconcile internals |
</action>
<acceptance_criteria>
grep -n "state.*reconcile\|reconcile.*state\|stateReconcile" plan-build-run/bin/pbr-tools.cjs
grep -n "stateReconcile" plan-build-run/bin/lib/state.cjs
grep -n "module.exports" plan-build-run/bin/lib/state.cjs
</acceptance_criteria>
<verify>
node -e "
const state = require('./plan-build-run/bin/lib/state.cjs');
console.assert(typeof state.stateReconcile === 'function', 'stateReconcile must be exported');
console.log('PASS: stateReconcile is exported');
"
</verify>
<done>
grep finds stateReconcile in both pbr-tools.cjs and state.cjs. The node verify command prints "PASS: stateReconcile is exported".
</done>
</task>

<task id="19-03-T2" type="auto" tdd="false" complexity="simple">
<name>Wire state reconcile into milestone/SKILL.md post-completion steps</name>
<read_first>
plugins/pbr/skills/milestone/SKILL.md
</read_first>
<files>
plugins/pbr/skills/milestone/SKILL.md
</files>
<action>
Add `state reconcile` to the milestone complete skill's post-archival cleanup section.

1. Read `milestone/SKILL.md` and locate the post-completion section — look for the step that handles STATE.md cleanup after phase archival (the step that runs after moving phase directories to the milestone archive).

2. After the existing state cleanup steps (or at the end of the cleanup sequence), add:

```markdown
**Run state reconcile after archival** to reset phases_total and current_phase to reflect the next milestone's phases:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state reconcile
```
This command re-derives phase counts from ROADMAP.md and reports any phantom phase rows (phase rows with no corresponding directory). Review and remove phantom rows manually.
```

3. Also add `state reconcile` to the `## NEXT UP` block (if one exists in milestone/SKILL.md) as a suggested post-milestone action:

```
- Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state reconcile` to verify STATE.md phase counts are correct for the next milestone
```

4. Do NOT change any other milestone skill logic.
</action>
<acceptance_criteria>
grep -n "state reconcile\|stateReconcile" plugins/pbr/skills/milestone/SKILL.md
</acceptance_criteria>
<verify>
grep -c "state reconcile" plugins/pbr/skills/milestone/SKILL.md
</verify>
<done>
grep finds "state reconcile" at least once in milestone/SKILL.md. The verify command returns a count >= 1.
</done>
</task>

## Summary

**Plan:** 19-03 | **Wave:** 1 | **Speculative:** true

### Tasks
1. **19-03-T1** — Implement `stateReconcile()` in `state.cjs` and wire `state reconcile` subcommand into `pbr-tools.cjs`
2. **19-03-T2** — Add `state reconcile` reference to `milestone/SKILL.md` post-archival cleanup steps

### Key Files
- `plan-build-run/bin/pbr-tools.cjs` (modified — new subcommand)
- `plan-build-run/bin/lib/state.cjs` (modified — new stateReconcile export)
- `plugins/pbr/skills/milestone/SKILL.md` (modified — references reconcile)

### Must-Haves
- Truths: `state reconcile` resets STATE.md phase counts to match ROADMAP.md; reports phantom phases; milestone skill references the command
- Artifacts: `stateReconcile()` exported from state.cjs; `state reconcile` dispatched in pbr-tools.cjs
- Key Links: milestone/SKILL.md references pbr-tools.js state reconcile in post-completion cleanup

### Provides / Consumes
- **Provides:** pbr-tools state reconcile command for post-milestone state cleanup
- **Consumes:** ROADMAP.md phase structure, STATE.md (reads and patches)
