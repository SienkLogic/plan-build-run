# Wave Execution Model

Plans within a phase are grouped into **waves** for execution ordering. Plans in the same wave are independent and can run in parallel; plans in later waves depend on earlier ones.

## Wave Assignment Rules

| Rule | Description |
|------|-------------|
| Wave 1 | Plans with `depends_on: []` — no prerequisites |
| Wave N+1 | Plans that depend on any Wave N plan |
| No self-wave deps | A plan cannot depend on another plan in the same wave |
| No circular deps | Dependency graph must be a DAG |

## Parallelization

The build skill spawns multiple executor `Task()` calls for same-wave plans when `config.parallelization` allows it. Default: sequential (one executor at a time). When parallel:

- Each executor operates on its own files (enforced by `files_modified` non-overlap within a wave)
- Git commits are serialized — only one executor commits at a time via lock file
- If a lock conflict occurs, retry up to 3 times with 2s delay

## Git Lock Handling

Parallel executors share one git index. The build skill uses a lock file (`.planning/.git-commit-lock`) to serialize commit operations:

1. Executor completes task, stages files
2. Acquires lock (atomic `fs.writeFileSync` with `wx` flag)
3. Commits
4. Releases lock (deletes file)

If lock acquisition fails, wait 2s and retry (max 3 attempts).

## Checkpoint Manifests

Between waves, the build skill writes a checkpoint manifest via:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.cjs checkpoint init {phase-slug} --plans "{plan-ids}"
```

The manifest tracks: which plans completed, their commit SHAs, provides/consumes resolution, and session affinity. The next wave reads this to verify prerequisites are met.

## Failure Handling

| Scenario | Action |
|----------|--------|
| One plan in wave fails | Other same-wave plans continue; dependent waves are blocked |
| All plans in wave fail | Phase marked `partial`; build skill reports to user |
| Checkpoint task blocks | Wave pauses; user action required before continuing |
| Executor hits context limit | Progress file written; `continue` skill resumes from last task |

Partial wave completion is recorded in STATE.md. The build skill can re-run failed plans without re-executing successful ones.
