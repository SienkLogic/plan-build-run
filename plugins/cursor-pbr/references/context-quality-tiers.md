# Context Quality Tiers

Behavioral guidance for agents based on context window utilization.

## Tier Definitions

| Tier | Context Used | Quality | Guidance |
|------|-------------|---------|----------|
| PEAK | 0-30% | Full capacity | Explore freely, read broadly, take time to understand |
| GOOD | 30-50% | High capacity | Be selective with reads, skip non-essential exploration |
| DEGRADING | 50-70% | Declining capacity | Write incrementally, finish current task, skip nice-to-haves |
| POOR | 70%+ | Critical | Finish current task IMMEDIATELY and return. No new reads. |

## Behavioral Rules Per Tier

### PEAK (0-30%)
- Read all relevant files before making changes
- Explore adjacent code for patterns and conventions
- Write comprehensive commit messages
- Full self-check protocols

### GOOD (30-50%)
- Read only files directly relevant to current task
- Skip exploratory reads of "nice to have" context
- Standard commit messages
- Standard self-check

### DEGRADING (50-70%)
- Write changes incrementally (don't accumulate large diffs)
- Skip optional verification steps
- Brief commit messages
- Abbreviated self-check (key_files only)

### POOR (70%+)
- STOP exploring. Finish the current task only.
- Write SUMMARY.md immediately if executor
- Return completion marker immediately
- Do NOT start new tasks or reads

## Agent-Specific Overrides

- **Researcher**: At DEGRADING, write findings immediately rather than accumulating
- **Executor**: At DEGRADING, complete current task then return CHECKPOINT
- **Verifier**: At DEGRADING, check existence only (skip substantiveness/wiring layers)
- **Planner**: At GOOD, reduce task detail level; at DEGRADING, finish current plan file only
