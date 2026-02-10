# Wave-Based Execution

How Towline parallelizes plan execution within a phase while respecting dependencies.

---

## What Are Waves?

Waves are dependency-based groupings of plans within a phase. Plans in the same wave have no dependencies on each other and can execute in parallel. Plans in later waves depend on earlier waves completing first.

```
Wave 1: [plan-01, plan-02]      (no dependencies, can run in parallel)
Wave 2: [plan-03]               (depends on wave 1 plans)
Wave 3: [plan-04, plan-05]      (depends on wave 2)
```

## How Wave Numbers Are Assigned

Wave numbers come from the `depends_on` field in each plan's YAML frontmatter:

```yaml
---
plan: "03-01"
wave: 1
depends_on: []          # No dependencies → Wave 1
---
```

```yaml
---
plan: "03-03"
wave: 2
depends_on: [03-01]     # Depends on Wave 1 plan → Wave 2
---
```

**Rules**:
- Wave 1 plans must have `depends_on: []`
- Wave 2+ plans must depend only on plans from earlier waves
- No plan depends on a plan in the same wave (that would require sequential execution within the wave)

## Execution Order

1. All Wave 1 plans execute (in parallel if enabled)
2. Wait for all Wave 1 plans to complete
3. All Wave 2 plans execute (in parallel if enabled)
4. Repeat until all waves complete

## Parallelization Config

Controlled by `config.json`:

```json
{
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "max_concurrent_agents": 3
  }
}
```

| Setting | Effect |
|---------|--------|
| `enabled: false` | All plans execute sequentially, regardless of wave |
| `plan_level: true` | Plans within a wave run in parallel |
| `max_concurrent_agents` | Cap on simultaneous executor agents (default: 3) |

When `enabled: false` or `plan_level: false`, plans execute one at a time within each wave, in plan ID order.

## Git Lock Handling

When multiple executors run in parallel, git lock conflicts can occur. Executors handle this with a retry pattern:

```bash
git commit -m "message" || (sleep 2 && git commit -m "message") || (sleep 2 && git commit -m "message")
```

Maximum 3 attempts with 2-second delays between retries.

## Checkpoint Manifest

The build skill tracks wave progress in `.checkpoint-manifest.json`:

```json
{
  "plans": ["03-01", "03-02", "03-03"],
  "checkpoints_resolved": ["03-01", "03-02"],
  "wave": 2,
  "commit_log": [...],
  "last_good_commit": "abc1234"
}
```

On crash/resume, the manifest tells the build skill which plans are complete and which wave to resume from.
