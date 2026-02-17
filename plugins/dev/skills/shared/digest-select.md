# Digest-Select Pattern

Selective reading depth for prior phase SUMMARY.md files. Saves tokens by reading only what is needed based on the relationship to the current phase.

> Referenced by: plan, build, import skills

---

## Depth Rules

Not all prior phase SUMMARYs need the same level of detail. Use selective depth based on dependency distance:

| Relationship to current phase | Read depth |
|-------------------------------|------------|
| Direct dependency (listed in `depends_on` in ROADMAP.md) | Frontmatter + "Key Decisions" section. The subagent reads full bodies from disk in its own context. |
| 1 phase back from a dependency (transitive) | Frontmatter only (`provides`, `key_files`, `key_decisions`, `patterns`) |
| 2+ phases back | Skip entirely |

---

## Example

If planning Phase 5 which depends on Phase 4, and Phase 4 depends on Phase 3:
- Phase 4 SUMMARYs: frontmatter + "Key Decisions" section
- Phase 3 SUMMARYs: frontmatter only
- Phases 1-2 SUMMARYs: skip

This saves ~500 tokens per skipped SUMMARY for large projects.

---

## How to Determine Dependency Distance

1. Read ROADMAP.md and find the current phase's `depends_on` list
2. Those are the **direct dependencies** (distance 1) -- read frontmatter + key decisions
3. For each direct dependency, find ITS `depends_on` list -- those are **transitive** (distance 2) -- read frontmatter only
4. Everything else (distance 3+) -- skip

---

## Frontmatter Fields to Extract

When reading frontmatter only (transitive dependencies), extract these fields:

```yaml
status: complete
provides:
  - "user authentication API"
  - "session management middleware"
key_files:
  - src/auth/controller.ts
  - src/auth/middleware.ts
key_decisions:
  - "JWT with refresh tokens"
  - "bcrypt for password hashing"
patterns:
  - "repository pattern for data access"
  - "middleware chain for auth checks"
```

These fields give downstream skills enough context to build on prior work without reading the full SUMMARY body.

---

## Skill-Specific Notes

### /dev:plan
- Direct dependencies: frontmatter + "Key Decisions" section (planner reads full bodies from disk)
- Used in Step 2: Load Context

### /dev:build
- Direct dependencies (completed earlier waves): frontmatter only for prior work table
- Used in Step 6a: Spawn Executors (prior_work section of executor prompt)

### /dev:import
- Direct dependencies: full SUMMARY body (needed for conflict detection)
- Transitive: frontmatter only
- 2+ back: skip
- Used in Step 2: Load Full Project Context
