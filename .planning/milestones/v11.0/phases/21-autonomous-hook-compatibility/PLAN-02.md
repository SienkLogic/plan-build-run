---
phase: "21-autonomous-hook-compatibility"
plan: "21-02"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plan-build-run/bin/lib/roadmap.cjs"
  - "plugins/pbr/skills/autonomous/SKILL.md"
must_haves:
  truths:
    - "ROADMAP CLI update-status and update-plans succeed for all progress table formats (2-col and 3-col)"
    - "When speculative plans are swapped in after staleness, checkpoint manifest is re-initialized with new plan IDs"
  artifacts:
    - "roadmap.cjs findRoadmapRow handles '| N. Name | X/Y | Status |' 3-column format correctly"
    - "autonomous SKILL.md 3c-stale section calls checkpointInit after re-planning"
  key_links:
    - "roadmap.cjs _findColumnIndex correctly detects Plans Complete column in 3-column header"
    - "autonomous staleness re-plan path re-initializes checkpoint manifest before build starts"
implements: []
provides:
  - "roadmap CLI: reliable update for v9.0+ 3-column progress table format"
  - "checkpoint manifest re-init: speculative plan swap triggers manifest reset"
consumes: []
---

<task id="21-02-T1" type="auto" tdd="false" complexity="medium">
<name>Harden roadmap.cjs findRoadmapRow for 3-column progress table format</name>
<read_first>
plan-build-run/bin/lib/roadmap.cjs
</read_first>
<files>
plan-build-run/bin/lib/roadmap.cjs
</files>
<action>
1. Read `plan-build-run/bin/lib/roadmap.cjs`. Focus on `findRoadmapRow` (around line 126) and `_findColumnIndex` (around line 173).

2. The v9.0+ ROADMAP.md progress tables use this 3-column format:
   ```
   | Phase | Plans Complete | Status |
   |-------|---------------|--------|
   | 21. Autonomous Hook Compatibility | 0/? | Pending |
   ```
   The phase column contains the full string "21. Autonomous Hook Compatibility" — the number AND name in one cell.

3. Verify `findRoadmapRow` handles this correctly. The existing regex `col.match(/^0*(\d+)\./)` at line 139 should match "21. Autonomous Hook Compatibility" → extract "21". If this already works (confirmed by manual test), add a comment above the regex explaining this handles the v9+ merged-name format:
   ```js
   // Handles v9+ format: "| 21. Phase Name | X/Y | Status |" (number+name merged)
   // as well as legacy formats: "| 21 | Phase Name | ... |" (separate columns)
   ```

4. In `roadmapUpdateStatus`, the fallback path (when `_findColumnIndex` returns -1) uses hardcoded column index 5 via `updateTableRow(lines[rowIdx], 5, newStatus)`. In the 3-column format, Status is column index 2 (0-based after phase col). Fix the fallback to detect column count:
   ```js
   // Fallback: detect column count to pick correct index
   const colCount = parts.filter(p => p.trim()).length - 1; // exclude empty leading/trailing
   const fallbackIdx = colCount <= 3 ? 3 : 5; // 3-col table: Status at raw index 3; legacy 6-col: index 5
   lines[rowIdx] = updateTableRow(lines[rowIdx], fallbackIdx - 1, newStatus);
   ```

5. Similarly in `roadmapUpdatePlans`, the fallback uses hardcoded `updateTableRow(lines[rowIdx], 3, newPlans)`. For a 3-column table (`| Phase | Plans Complete | Status |`), Plans Complete is at raw pipe-split index 2. The dynamic detection via `_findColumnIndex(lines, rowIdx, /plans?\s*complete/i)` should already handle this. If the column header scan finds "Plans Complete", it returns the correct index. Verify `_findColumnIndex` scans backward to the nearest header row correctly for the 3-col format.

6. Add a unit test case comment in `roadmapUpdateStatus` and `roadmapUpdatePlans` noting the 3-column format is supported, referencing the v9+ milestone format.

7. Run the verification manually:
   ```bash
   node -e "
   const r = require('./plan-build-run/bin/lib/roadmap.cjs');
   // Test on live ROADMAP (Phase 21 exists in 3-col format)
   const res = r.roadmapUpdateStatus('21', 'planned', '.planning');
   console.log(JSON.stringify(res));
   "
   ```
   Confirm `success: true`. Then restore: `roadmapUpdateStatus('21', 'Pending', '.planning')`.
</action>
<acceptance_criteria>
grep -q "v9+ format" plan-build-run/bin/lib/roadmap.cjs
node -e "const r=require('./plan-build-run/bin/lib/roadmap.cjs');const res=r.roadmapUpdateStatus('21','test','.planning');process.exit(res.success?0:1)" && node -e "const r=require('./plan-build-run/bin/lib/roadmap.cjs');r.roadmapUpdateStatus('21','Pending','.planning')"
</acceptance_criteria>
<verify>
grep -n "v9\+ format\|3-col\|colCount" plan-build-run/bin/lib/roadmap.cjs
node -e "const r=require('./plan-build-run/bin/lib/roadmap.cjs');console.log(JSON.stringify(r.roadmapUpdateStatus('21','planned','.planning')));r.roadmapUpdateStatus('21','Pending','.planning')"
</verify>
<done>
`plan-build-run/bin/lib/roadmap.cjs` has a comment in `findRoadmapRow` explaining v9+ 3-column format support. `roadmapUpdateStatus('21', 'planned', '.planning')` returns `{success: true}`. Fallback column detection is column-count-aware.
</done>
</task>

<task id="21-02-T2" type="auto" tdd="false" complexity="medium">
<name>Wire checkpoint manifest re-init into autonomous SKILL.md staleness swap path</name>
<read_first>
plugins/pbr/skills/autonomous/SKILL.md
plugins/pbr/skills/build/SKILL.md
</read_first>
<files>
plugins/pbr/skills/autonomous/SKILL.md
</files>
<action>
1. Read `plugins/pbr/skills/autonomous/SKILL.md`. Locate Step 3c-stale (staleness check after build completes).
2. Locate the re-plan path (step 5b in 3c-stale) where speculative plans are deleted and re-planned:
   ```
   - Delete the speculative PLAN-*.md files for Phase C
   - Log: `Phase {N} had {count} deviation(s) -- re-planning Phase {C}`
   - Re-invoke planner synchronously: Skill({ skill: "pbr:plan", args: "{C} --auto" })
   ```
3. After the `Skill({ skill: "pbr:plan", ... })` call succeeds, insert this step:
   ```
   - Re-initialize checkpoint manifest for Phase C with the new plan IDs:
     ```bash
     # Collect new PLAN-*.md filenames from .planning/phases/{CC}-{slug}/
     # Extract plan IDs from frontmatter (plan: field) of each new PLAN file
     node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js checkpoint init {CC}-{slug} {plan-ids}
     ```
     This ensures the build skill starts with accurate plan tracking when Phase C is built.
   ```
4. Also add a note at the top of 3c-stale explaining WHY checkpoint re-init is needed:
   ```
   Note: When speculative plans are replaced (re-planned), the checkpoint manifest from a prior
   speculative run (if any) becomes stale. Re-initialize it immediately after re-planning so
   that the build skill does not try to skip plans that no longer exist.
   ```
5. Read `plugins/pbr/skills/build/SKILL.md` lines around the checkpoint init section (Step 5b) to confirm the CLI command format: `pbr-tools.js checkpoint init {slug} {plan-ids}` — use the exact invocation pattern from build/SKILL.md.
6. Do not change the staleness check logic itself — only add the checkpoint re-init step after successful re-plan.
</action>
<acceptance_criteria>
grep -q "checkpoint init" plugins/pbr/skills/autonomous/SKILL.md
grep -q "Re-initialize checkpoint manifest" plugins/pbr/skills/autonomous/SKILL.md
</acceptance_criteria>
<verify>
grep -n "checkpoint\|Re-initialize\|manifest" plugins/pbr/skills/autonomous/SKILL.md | head -20
</verify>
<done>
`plugins/pbr/skills/autonomous/SKILL.md` Step 3c-stale includes a checkpoint re-initialization step after successful re-plan, with the correct `pbr-tools.js checkpoint init` CLI command format. A note explains why re-init is needed.
</done>
</task>

## Summary

**Plan ID:** 21-02 | **Wave:** 1 | **Speculative:** true

**Tasks:**
1. `21-02-T1` — Harden `findRoadmapRow` in roadmap.cjs for v9+ 3-column progress table format with a comment and column-count-aware fallback
2. `21-02-T2` — Wire checkpoint manifest re-initialization into autonomous SKILL.md's staleness swap path

**Key files:**
- `plan-build-run/bin/lib/roadmap.cjs` — comment clarifies v9+ format support; fallback column detection made column-count-aware
- `plugins/pbr/skills/autonomous/SKILL.md` — staleness re-plan path now re-inits checkpoint manifest

**Must-haves:**
- ROADMAP CLI works for 3-column progress tables (v9+ format)
- Checkpoint manifest stays current when speculative plans are swapped

**Provides:** `roadmap CLI 3-col format` + `checkpoint manifest re-init on swap`
**Consumes:** nothing (Wave 1, parallel with PLAN-01)
