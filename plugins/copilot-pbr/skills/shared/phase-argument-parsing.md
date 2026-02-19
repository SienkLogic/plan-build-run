<!-- canonical: ../../../pbr/skills/shared/phase-argument-parsing.md -->
# Phase Argument Parsing

How skills parse and validate phase number arguments from `$ARGUMENTS`.

## Parsing Rules

1. **Integer phases**: `3` → Phase 3 (standard phase)
2. **Decimal phases**: `3.1` → Phase 3.1 (inserted phase)
3. **Zero-padded**: `03` → Phase 3 (strip leading zeros for display, keep for file paths)
4. **No argument**: Use current phase from STATE.md

## Normalization

```
Input       → Normalized  → Directory Name
"3"         → 3           → 03-{slug}
"03"        → 3           → 03-{slug}
"3.1"       → 3.1         → 03.1-{slug}
""          → (current)   → (read from STATE.md)
```

## Validation

1. Phase number must be numeric (integer or decimal with one decimal place)
2. Phase must exist in ROADMAP.md (or be a valid target for insert/add)
3. Phase must be in the expected state for the operation:
   - `/pbr:plan N` — phase must not already have plans (unless re-planning)
   - `/pbr:build N` — phase must have plans
   - `/pbr:review N` — phase must have been built (SUMMARY.md files exist)

## Finding Phase Directory

```
Given phase number N:
1. List directories in .planning/phases/
2. Find directory matching pattern: {NN}-* or {N.M}-*
3. If not found, check ROADMAP.md for phase name
4. If still not found, error: "Phase N not found"
```

## Error Messages

- No argument and no current phase: "Which phase? Specify a number or run /pbr:status to see where you are."
- Phase not found: "Phase {N} not found in .planning/phases/. Run /pbr:status to see available phases."
- Wrong state: "Phase {N} hasn't been planned yet. Run /pbr:plan {N} first."
