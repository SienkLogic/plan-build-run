# Error Reporting — Standard Format

Use the branded error box for all blocking errors. Present the box, explain what happened, and give a specific fix action.

## Error Box Format

```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

{one-line description of what went wrong}

**To fix:** {specific action the user should take}
```

## Warning Format (non-blocking)

```
⚠ {one-line warning}
  {optional detail or suggestion}
```
Continue execution after showing a warning.

## Common Error Patterns

### Phase not found
Message: "Phase {N} not found in ROADMAP.md."
Fix: "Run `/pbr:status` to see available phases."

### Missing prerequisites (no REQUIREMENTS.md or ROADMAP.md)
Message: "Project not initialized. Missing REQUIREMENTS.md or ROADMAP.md."
Fix: "Run `/pbr:begin` first."

### No plans found for phase
Message: "Phase {N} has no plans."
Fix: "Run `/pbr:plan {N}` first."

### Dependency phase not complete
Message: "Phase {N} depends on Phase {M}, which is not complete."
Fix: "Build Phase {M} first with `/pbr:build {M}`."

### Planner agent failure
Message: "Planner agent failed for Phase {N}."
Fix: "Try again with `/pbr:plan {N} --skip-research`. Check `.planning/CONTEXT.md` for conflicting constraints."

### Checker loops (3+ iterations without pass)
Message: "Plan checker failed to pass after 3 revision iterations for Phase {N}."
Fix: "Review the remaining issues below and decide whether to proceed or revise manually. Run `/pbr:plan {N}` to restart planning from scratch."
After displaying: present remaining issues and ask user to decide (proceed or intervene).

### Research agent failure
Display as WARNING (non-blocking): "Research agent failed. Planning without phase-specific research. This may result in less accurate plans."
Continue to the planning step.

## Usage

In skill files, replace repeated error box content with:
"Display a branded error box — use the format from `skills/shared/error-reporting.md`, pattern: {pattern name}."
