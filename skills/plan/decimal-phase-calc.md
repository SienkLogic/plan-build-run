# Decimal Phase Numbering

Rules for calculating decimal phase numbers when inserting phases into an existing roadmap.

---

## Core Rule

Inserted phases get decimal numbers based on their insertion position. The integer part indicates where in the sequence the phase falls, and the decimal part indicates it was inserted.

---

## Calculation

### Insert at position N

```
1. Find phase N in the roadmap
2. Check if N.1 already exists
3. If not: new phase is N.1
4. If yes: check N.2, N.3, etc. until an unused number is found
```

### Examples

**Insert between Phase 3 and Phase 4:**
```
Before: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5
After:  Phase 1, Phase 2, Phase 3, Phase 3.1, Phase 4, Phase 5
```

**Insert another between Phase 3 and Phase 4:**
```
Before: Phase 1, Phase 2, Phase 3, Phase 3.1, Phase 4, Phase 5
After:  Phase 1, Phase 2, Phase 3, Phase 3.1, Phase 3.2, Phase 4, Phase 5
```

**Insert between Phase 3.1 and Phase 3.2:**
This is NOT supported. Maximum one level of decimal insertion. If you need to insert between decimal phases, renumber the entire sequence first.

---

## Directory Naming

```
Phase 3   → .planning/phases/03-{slug}/
Phase 3.1 → .planning/phases/03.1-{slug}/
Phase 3.2 → .planning/phases/03.2-{slug}/
```

---

## Plan ID Format

Plans in decimal phases use the decimal in their ID:

```
Phase 3.1, Plan 01 → Plan ID: 3.1-01
Phase 3.1, Plan 02 → Plan ID: 3.1-02
```

---

## Execution Order

Decimal phases execute AFTER their integer parent and BEFORE the next integer:

```
Execution order: 1, 2, 3, 3.1, 3.2, 4, 5
```

Dependencies:
- Decimal phases inherit the dependencies of their integer parent by default
- Additional dependencies can be declared explicitly
- A decimal phase at N.M depends on phase N unless overridden

---

## Renumbering After Remove

When a phase is removed, subsequent phases are renumbered:

```
Before: Phase 1, Phase 2, Phase 3, Phase 3.1, Phase 4
Remove Phase 2:
After:  Phase 1, Phase 2 (was 3), Phase 2.1 (was 3.1), Phase 3 (was 4)
```

All internal references (depends_on, plan IDs, directory names) must be updated during renumbering.

---

## Constraints

1. Maximum one level of decimal numbering (no 3.1.1)
2. Decimal part is always a single digit (3.1 through 3.9)
3. Maximum 9 insertions at any position (3.1 through 3.9)
4. If 9 insertions are needed, renumber the entire roadmap instead
