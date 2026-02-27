# Plan Authoring Guide

Quality guidelines for writing executable plans. Used by planner and plan-checker.

---

## Action Writing Guidelines

The `<action>` element is the most important part of the plan. It must be specific enough that the executor agent can follow it mechanically without making design decisions.

### Good Action
```xml
<action>
1. Create file `src/auth/discord.ts`
2. Import `OAuth2Client` from `discord-oauth2` package
3. Export async function `authenticateWithDiscord(code: string): Promise<User>`
   - Create OAuth2Client with env vars: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
   - Exchange authorization code for access token
   - Fetch user profile from Discord API: GET /api/users/@me
   - Return User object with fields: id, username, avatar, email
4. Export function `getDiscordAuthUrl(): string`
   - Build OAuth2 authorization URL with scopes: identify, email
   - Include redirect URI from env: DISCORD_REDIRECT_URI
   - Return the URL string
5. Add to `.env.example`:
   DISCORD_CLIENT_ID=
   DISCORD_CLIENT_SECRET=
   DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback
</action>
```

### Bad Action
```xml
<action>
Set up Discord OAuth authentication.
</action>
```

### Action Rules

1. **Number the steps** -- executor follows them in order
2. **Name specific files** -- never say "create necessary files"
3. **Name specific functions/exports** -- never say "implement the auth logic"
4. **Include type signatures** -- when the project uses TypeScript
5. **Reference existing code** -- when modifying files, say what to modify
6. **Include code snippets** -- for complex patterns or configurations
7. **Specify environment variables** -- with example values
8. **Note error handling** -- only when it's a critical part of the task

---

## Verify Command Guidelines

The `<verify>` element must contain commands that the executor can run to check the task is complete.

### Good Verify
```xml
<verify>
npx tsc --noEmit
npm run test -- --grep "discord auth"
ls -la src/auth/discord.ts
</verify>
```

### Bad Verify
```xml
<verify>
Check that authentication works.
</verify>
```

### Verify Rules

1. **Must be executable** -- actual shell commands, not descriptions
2. **Must be deterministic** -- same result every time if code is correct
3. **Prefer automated checks** -- type checking, tests, linting
4. **Include existence checks** -- `ls` for created files
5. **Include build checks** -- `npx tsc --noEmit` for TypeScript
6. **Avoid interactive commands** -- no commands requiring user input

---

## Done Condition Guidelines

The `<done>` element describes the observable outcome, not the implementation activity.

### Good Done
- "User can authenticate via Discord OAuth and is redirected to dashboard"
- "Auth middleware rejects invalid tokens and passes valid tokens"
- "All 12 unit tests pass for the auth module"

### Bad Done
- "Code was written"
- "File was created"
- "Feature is implemented"

### Done Rules

1. **Maps to a must-have** -- every done condition traces back to a frontmatter must-have
2. **Observable** -- describes a state of the system, not an activity
3. **Falsifiable** -- you can check whether it's true or false
4. **User-oriented** -- prefer "user can..." over "code does..."

---

## Scope Limits

### Per-Plan Limits

| Constraint | Limit | Rationale |
|-----------|-------|-----------|
| Tasks per plan | **2-3** | Keeps plans atomic and recoverable |
| Files per plan | **5-8** | Limits blast radius of failures |
| Dependencies | **3 max** | Avoids deep dependency chains |

### When to Split

- More than 3 tasks? Split.
- More than 8 files? Split.
- Tasks in different functional areas? Split.
- Some tasks need human checkpoints, others don't? Split into autonomous and checkpoint plans.

### Split Signals

| Signal | Action |
|--------|--------|
| >3 tasks needed | Split by subsystem -- one plan per subsystem |
| Multiple unrelated subsystems | One plan per subsystem |
| >5 files per task | Task is too big -- break it down |
| Checkpoint + implementation in same plan | Separate the checkpoint into its own plan |
| Discovery research + implementation | Separate plans -- research plan first |

---

## Discovery Levels

When a plan requires research before execution, set the `discovery` field in plan frontmatter. Default is 1 for most plans.

| Level | Name | Description | Executor Behavior |
|-------|------|-------------|-------------------|
| 0 | Skip | No research needed | Execute immediately |
| 1 | Quick | Fast verification | Check official docs for 1-2 specific questions |
| 2 | Standard | Normal research | Spawn researcher for phase research |
| 3 | Deep | Extensive investigation | Full research cycle before execution |

### Level 0 -- Skip
**When to use**: Simple refactors, documentation updates, file renames, configuration tweaks, or any task where the implementation approach is unambiguous from the plan's `<action>` steps alone.

### Level 1 -- Quick (default)
**When to use**: Standard feature work where the technology is known but specific API signatures, config options, or version-specific behavior need a quick check.

### Level 2 -- Standard
**When to use**: Work involving unfamiliar libraries, new integration patterns, or approaches the executor hasn't seen in this codebase before.

### Level 3 -- Deep
**When to use**: High-risk or architecturally significant work where getting the approach wrong would require substantial rework.

---

## TDD Decision Heuristic

When assigning `tdd="true"` or `tdd="false"` on a task, apply this test:

> **Can you write `expect(fn(input)).toBe(output)` before writing `fn`?**
> Yes → `tdd="true"`. No → `tdd="false"`.

### When TDD Adds Value

- Pure functions and data transformations
- Business logic with defined inputs/outputs
- API response parsing and validation
- State machines and workflow transitions
- Utility functions and helpers

### When to Skip TDD

- UI rendering and layout (test after)
- Configuration and environment setup
- Glue code wiring modules together
- Simple CRUD with no business logic
- File system operations and I/O plumbing
- One-off scripts and migrations

When the global config `features.tdd_mode: true` is set, all tasks default to TDD. The planner should still set `tdd="false"` on tasks matching the skip list above — the global flag is a project preference, not a mandate for every task.

---

## Dependency Graph Rules

### File Conflict Detection

Two plans CONFLICT if their `files_modified` lists overlap. Conflicting plans:
- MUST be in different waves (cannot run in parallel)
- MUST have explicit `depends_on` relationship
- Later plan's `<action>` must reference what the earlier plan produces

### Circular Dependencies

**NEVER create circular dependencies.** If you detect a potential cycle, restructure the plans to break it. Common resolution: merge the circular plans into one, or extract the shared dependency into its own plan.

---

## Context Fidelity Checklist

Before writing plan files, verify context compliance:

1. **Locked decision coverage**: For each locked decision in CONTEXT.md, identify the task that implements it.
2. **Deferred idea exclusion**: Scan all tasks -- no task should implement a deferred idea.
3. **Discretion area handling**: Each "Claude's Discretion" item should be addressed in at least one task.
