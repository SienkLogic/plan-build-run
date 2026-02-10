# Error Reporting Fragment

Standard error display formats for all skills. Reference `references/ui-formatting.md` for the full brand guide.

## Recoverable Error

For errors that don't halt the workflow — skill can suggest a fix or retry:

```
⚠ Warning: {short description}

{1-2 line explanation of what went wrong}

To fix: {actionable instruction}
```

Example:
```
⚠ Warning: STATE.md is 180 lines (limit: 150)

The state file has grown beyond the recommended size, which increases context usage on load.

To fix: Run /dev:health to compact the Accumulated Context section.
```

## Fatal Error

For errors that stop execution — skill cannot continue:

```
✗ Error: {short description}

{1-2 line explanation}

What to try:
  1. {first suggestion}
  2. {second suggestion}
  3. {fallback — often /dev:health or manual fix}
```

Example:
```
✗ Error: PLAN.md not found for phase 03

No plan files exist in .planning/phases/03-auth/. The executor cannot run without a plan.

What to try:
  1. Run /dev:plan 3 to create a plan first
  2. Check if the phase directory exists: ls .planning/phases/03-*
  3. Run /dev:health to check planning directory integrity
```

## Validation Error

For format or schema validation failures (config, plan format, commit message):

```
✗ Validation failed: {what was validated}

Issues:
  - {specific issue 1}
  - {specific issue 2}

Expected format: {brief format description or example}
```

## Hook Block Message

For PreToolUse hooks that reject a tool call:

```
Blocked: {short reason}

{explanation}

{how to fix or alternative approach}
```

This format is used by validate-commit.js and check-dangerous-commands.js. The `decision: "block"` and `reason` fields in the JSON output follow this pattern.
