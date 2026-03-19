---
phase: "21-autonomous-hook-compatibility"
plan: "21-02"
status: complete
tasks_completed: 2
tasks_total: 2
commits:
  - "2bb9aa31"
  - "b08ee23e"
provides:
  - "roadmap CLI: reliable update for v9.0+ 3-column progress table format"
  - "checkpoint manifest re-init: speculative plan swap triggers manifest reset"
requires: []
key_files:
  - "plan-build-run/bin/lib/roadmap.cjs: v9+ format comments and column-count-aware fallback in roadmapUpdateStatus/roadmapUpdatePlans"
  - "plugins/pbr/skills/autonomous/SKILL.md: checkpoint re-init step in 3c-stale after re-plan"
deferred: []
must_haves:
  - "ROADMAP CLI update-status and update-plans succeed for all progress table formats (2-col and 3-col): DONE"
  - "When speculative plans are swapped in after staleness, checkpoint manifest is re-initialized with new plan IDs: DONE"
  - "roadmap.cjs findRoadmapRow handles 3-column format correctly: DONE"
  - "autonomous SKILL.md 3c-stale section calls checkpointInit after re-planning: DONE"
  - "roadmap.cjs _findColumnIndex correctly detects Plans Complete column in 3-column header: DONE"
  - "autonomous staleness re-plan path re-initializes checkpoint manifest before build starts: DONE"
self_check:
  passed: 6
  failed: 0
  retries: 0
deviations: []
requirements_completed: []
metrics:
  duration_minutes: 2.1
  start_time: "2026-03-19T04:14:56.928Z"
  end_time: "2026-03-19T04:17:02.846Z"
---

## Task Results

| Task | Status | Commit | Files |
|------|--------|--------|-------|
| 21-02-T1: Harden roadmap.cjs findRoadmapRow for 3-col format | done | 2bb9aa31 | plan-build-run/bin/lib/roadmap.cjs |
| 21-02-T2: Wire checkpoint manifest re-init into autonomous staleness swap | done | b08ee23e | plugins/pbr/skills/autonomous/SKILL.md |

## Deviations

None

## Self-Check: PASSED

- All key_files exist on disk
- All commits present in git log
- roadmapUpdateStatus('21', 'test', '.planning') returns {success: true}
- grep confirms v9+ format comments and checkpoint init in target files
