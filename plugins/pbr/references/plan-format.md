# Plan Format Reference

Complete reference for the XML task specification used in Plan-Build-Run plan files.

---

## Plan File Structure

Every plan file has two sections:
1. **YAML Frontmatter** — metadata about the plan
2. **XML Tasks** — the executable task specifications

---

## YAML Frontmatter

```yaml
---
phase: "02-authentication"
plan: "02-01"
type: "feature"
wave: 1
depends_on: []
files_modified:
  - "src/auth/discord.ts"
  - "src/middleware/auth.ts"
autonomous: true
discovery: 1
gap_closure: false
must_haves:
  truths:
    - "User can authenticate via Discord OAuth"
    - "JWT token is set in httpOnly cookie"
  artifacts:
    - "src/auth/discord.ts: >50 lines"
    - "src/middleware/auth.ts: >30 lines"
  key_links:
    - "Auth middleware applied to protected routes"
    - "Login button calls authenticateWithDiscord()"
provides:
  - "AuthService class"
  - "POST /api/auth/login endpoint"
  - "requireAuth() middleware"
consumes:
  - "Database connection (from plan 01-01)"
implements:
  - "REQ-F-001"
  - "REQ-F-002"
closes_issues:
  - 42
  - 57
---
```

### Frontmatter Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `phase` | YES | string | Phase directory name (e.g., "02-authentication") |
| `plan` | YES | string | Plan ID: `{phase_num}-{plan_num}` (e.g., "02-01") |
| `type` | YES | enum | `feature`, `bugfix`, `refactor`, `infrastructure`, `docs` |
| `wave` | YES | int | Execution wave (1 = independent, 2+ = has deps) |
| `depends_on` | YES | array | Plan IDs that must complete first. `[]` if Wave 1. |
| `files_modified` | YES | array | All files this plan creates or modifies |
| `autonomous` | YES | bool | `true` if no human checkpoints |
| `discovery` | NO | int | Research level: 0=skip, 1=quick, 2=standard, 3=deep. Default: 1 |
| `gap_closure` | NO | bool | `true` if this is a gap-closure plan. Default: false |
| `must_haves` | YES | object | Goal-backward derivation |
| `must_haves.truths` | YES | array | Observable truths that must be true when done |
| `must_haves.artifacts` | YES | array | Files/modules that must exist. Append `: >N lines` for size hints. |
| `must_haves.key_links` | YES | array | Connections between components. Append `: grep command` for verification. |

### Criterion Language as Steering

Must-have wording directly steers executor behavior — criteria are implicit instructions, not just evaluation rubrics. The executor reads must-haves as goals to achieve, so vague criteria produce vague implementations.

**Vague patterns to avoid:**

| Pattern | Problem | Concrete alternative |
|---------|---------|---------------------|
| "should be good" | No observable threshold | "responds in <200ms for 95th percentile" |
| "properly handles errors" | Subjective | "returns HTTP 4xx with JSON {error, code} body on invalid input" |
| "clean code" | Aesthetic judgment | "functions <30 lines, no eslint violations" |
| "responsive design" | Unmeasurable | "renders correctly at 375px, 768px, 1440px widths" |
| "performant" | No baseline | "page load <2s on 3G throttle" |
| "secure" | Too broad | "all user input sanitized via DOMPurify before render" |
| "well-tested" | No coverage target | "unit tests cover all exported functions, >80% branch coverage" |

**Good criterion characteristics:**

- Contains a specific number, threshold, or observable behavior
- Can be verified by a grep, test, or CLI command
- Describes WHAT the user or system observes, not HOW the code looks

| `provides` | NO | array | What this plan exports for other plans to consume (classes, endpoints, modules) |
| `consumes` | NO | array | What this plan needs from prior plans. Format: `"Thing (from plan XX-YY)"` |
| `implements` | YES (WARNING if absent) | array | REQ-IDs from REQUIREMENTS.md or ROADMAP this plan addresses. Primary traceability field. |
| `requirement_ids` | NO | array | DEPRECATED — use `implements:` instead. Kept for backward compat. |
| `dependency_fingerprints` | NO | object | Hashes of dependency phase SUMMARY.md files at plan-creation time. Used to detect stale plans. |
| `data_contracts` | NO | array | Cross-boundary parameter mappings for calls where arguments originate from external boundaries. Format: `"param: source (context) [fallback]"` |
| `closes_issues` | NO | number[] | GitHub issue numbers to close when this plan's final commit lands. Default: `[]` |

> **Note:** The `implements` field is mandatory for new plans. The plan-checker validates that listed IDs trace to ROADMAP phase items. Existing plans without `implements` receive a WARNING (not a blocker) during the transition period.

### Data Contracts

When a task's `<action>` includes calls across module boundaries where arguments come from external sources (hook stdin, env vars, API params, config files), document the parameter-to-source mapping in `data_contracts` frontmatter and in the `<action>` step itself.

Example frontmatter:

```yaml
data_contracts:
  - "sessionId: data.session_id (hook stdin) [undefined in CLI context]"
  - "config: configLoad(planningDir) (disk) [resolveConfig(undefined)]"
```

Example in `<action>`:

```
3. Call classifyArtifact(llmConfig, planningDir, content, fileType, data.session_id)
   Data contract: sessionId ← data.session_id from hook stdin (undefined in CLI context)
```

**When to apply:** Any call where caller and callee are in different modules AND at least one argument originates from an external boundary. Internal helper calls within the same module do not need contracts.

---

## Summary Section

Every plan file MUST end with a `## Summary` section after all XML tasks. This section provides a compact overview (~500 tokens) for injection into executor prompts, avoiding the need to inline the full plan (~1,500 tokens).

Format:

```
## Summary

**Plan {plan_id}**: {1-sentence description of what this plan does}

**Tasks:**
1. {task_id}: {task name} -- {files touched}
2. {task_id}: {task name} -- {files touched}
3. {task_id}: {task name} -- {files touched}

**Key files:** {comma-separated list of all files_modified}

**Must-haves:** {comma-separated list of truths from frontmatter}

**Provides:** {comma-separated list from provides field}

**Consumes:** {comma-separated list from consumes field, or "None"}
```

The Summary section is generated by the planner agent at plan creation time. It is a denormalized view of plan metadata -- if the plan is revised, the Summary must also be updated.

---

## Outer XML Wrappers

Plan files support optional XML wrapper elements that provide structure beyond YAML frontmatter and individual `<task>` blocks. These wrappers enable cleaner extraction and validation of plan sections.

### Structure

The complete plan file structure with wrappers:

```
---
(YAML frontmatter)
---

<objective>
1-2 sentence description of what this plan achieves.
</objective>

<tasks>

<task id="..." type="auto" complexity="medium">
  ...
</task>

<task id="..." type="auto" complexity="medium">
  ...
</task>

</tasks>

<verification>
1. `command` -- what it checks
2. `command` -- what it checks
</verification>

## Summary
...
```

### Wrapper Elements

| Element | Purpose | Content |
|---------|---------|---------|
| `<objective>` | Plan goal statement | 1-2 sentences describing what this plan achieves. Replaces a `## Objective` markdown heading. |
| `<tasks>` | Task container | Wraps all `<task>` elements. Enables clean regex extraction: `/<tasks>([\s\S]*?)<\/tasks>/` |
| `<verification>` | Verification strategy | Numbered verification commands with descriptions. Replaces free-form verification sections. |

### Backward Compatibility

Both markdown headings (legacy) and XML wrappers (preferred) are accepted. New plans SHOULD use XML wrappers. Old plans without wrappers continue to parse correctly — the task parser falls back to scanning the entire file body when no `<tasks>` wrapper is found.

### Additional Optional Wrappers

Plans may also include these optional wrapper elements:

- `<context>` — References to context files (e.g., `@.planning/PROJECT.md`)
- `<success_criteria>` — High-level success criteria (distinct from per-task `<acceptance_criteria>`)

---

## Task Types

### Standard Auto Task

```xml
<task id="02-01-T1" type="auto" complexity="medium">
  <name>Create Discord OAuth client module</name>
  <read_first>
    src/auth/types.ts
  </read_first>
  <files>
    src/auth/discord.ts
    src/auth/types.ts
  </files>
  <action>
    1. Create file `src/auth/types.ts`
       - Export interface `DiscordUser` with fields: id, username, avatar, email
       - Export interface `AuthTokens` with fields: accessToken, refreshToken, expiresAt

    2. Create file `src/auth/discord.ts`
       - Import `OAuth2Client` from `discord-oauth2`
       - Import `DiscordUser`, `AuthTokens` from `./types`
       - Export async function `authenticateWithDiscord(code: string): Promise<DiscordUser>`
         - Create OAuth2Client with DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET from env
         - Exchange authorization code for access token
         - Fetch user profile: GET /api/users/@me
         - Return DiscordUser object
       - Export function `getDiscordAuthUrl(): string`
         - Build OAuth2 URL with scopes: identify, email
         - Include DISCORD_REDIRECT_URI from env

    3. Add to `.env.example`:
       DISCORD_CLIENT_ID=
       DISCORD_CLIENT_SECRET=
       DISCORD_REDIRECT_URI=http://localhost:3000/auth/callback
  </action>
  <acceptance_criteria>
    grep -q "authenticateWithDiscord" src/auth/discord.ts
    grep -q "DiscordUser" src/auth/types.ts
    test -f src/auth/discord.ts
  </acceptance_criteria>
  <verify>
    <automated>
      npx tsc --noEmit
      ls src/auth/discord.ts
      ls src/auth/types.ts
    </automated>
  </verify>
  <done>Discord OAuth client module exists and compiles without errors</done>
</task>
```

> **Verify block forms**: The `<automated>` wrapper (Option A) is preferred — it enables machine-parsing
> for `auto_checkpoints` mode. Plain-text verify commands without the wrapper (Option B) remain valid
> for backward compatibility. Both forms are supported by the executor.

### TDD Task

```xml
<task id="02-01-T2" type="auto" tdd="true" complexity="medium">
  <name>Implement auth middleware with TDD</name>
  <read_first>
    src/auth/discord.ts
    src/auth/types.ts
  </read_first>
  <files>
    src/middleware/auth.ts
    tests/middleware/auth.test.ts
  </files>
  <action>
    RED:
    1. Create `tests/middleware/auth.test.ts`
       - Test: "rejects request without token" — expect 401
       - Test: "rejects request with invalid token" — expect 401
       - Test: "passes request with valid token" — expect next() called

    GREEN:
    2. Create `src/middleware/auth.ts`
       - Export function `requireAuth(req, res, next)`
       - Extract JWT from httpOnly cookie
       - Verify token with jsonwebtoken
       - If valid: attach user to req, call next()
       - If invalid: respond 401

    REFACTOR:
    3. Extract token verification into `verifyToken()` helper
  </action>
  <acceptance_criteria>
    grep -q "requireAuth" src/middleware/auth.ts
    grep -q "rejects request without token" tests/middleware/auth.test.ts
    test -f src/middleware/auth.ts
  </acceptance_criteria>
  <verify>
    npm test -- --grep "auth middleware"
  </verify>
  <done>Auth middleware rejects invalid tokens and passes valid tokens</done>
</task>
```

### Feature Task (TDD Variant)

Feature tasks add a `<feature>` element for structured TDD planning. The element contains two required children:

- **`<behavior>`** — the observable outcome from the user's perspective. Maps directly to a `must_haves.truths` entry.
- **`<implementation>`** — the technical approach at a high level (which files, patterns, or algorithms to use).

Prose structure (illustrative — not a live task block to avoid validator false-positives):

```
task id="02-01-T3" type="auto" tdd="true" complexity="medium"
  name: Implement rate limiter for OAuth endpoint
  files: src/middleware/rate-limit.ts / tests/middleware/rate-limit.test.ts
  feature:
    behavior: OAuth endpoint rejects more than 5 requests per minute per IP with HTTP 429
    implementation: Token-bucket algorithm; Redis-backed counter with TTL; express-rate-limit wrapper
  action:
    RED: Write failing tests for 429 response at >5 req/min
    GREEN: Implement token-bucket middleware using Redis
    REFACTOR: Extract counter logic to RateLimitStore class
  verify:
    automated: npm test -- --grep "rate limiter"
  done: Rate limiter rejects excessive OAuth requests with 429
```

The `<feature>` element is optional — standard TDD tasks without it are still valid. Use `<feature>` when the planner wants to record the behavior/implementation split explicitly for traceability.

## Checkpoint System

Plans use 3 checkpoint types for human-in-the-loop interaction. Most plans have zero checkpoints — only use them when the plan explicitly requires human input.

| Type | Frequency | Purpose | Executor Action |
|------|-----------|---------|-----------------|
| `checkpoint:human-verify` | ~90% of checkpoints | User verifies output | Show what was built, ask "looks good?" |
| `checkpoint:decision` | ~9% of checkpoints | User chooses between options | Present options with context, wait for selection |
| `checkpoint:human-action` | ~1% of checkpoints | User does something outside Claude | Explain what's needed, wait for confirmation |

### Structured Checkpoint Return Format

When an executor encounters a checkpoint task, it MUST return a completion marker with structured data:

```text
## CHECKPOINT: {TYPE}

<checkpoint>
  <type>{human-verify|decision|human-action}</type>
  <task_id>{plan_id}-T{N}</task_id>
  <description>{what this checkpoint is about}</description>
  <what_built>{for human-verify: summary of what was built}</what_built>
  <verify_steps>{for human-verify: numbered steps to verify}</verify_steps>
  <options>{for decision: lettered options with descriptions}</options>
  <required_action>{for human-action: what the user needs to do}</required_action>
  <resume_signal>{what response means "proceed"}</resume_signal>
</checkpoint>
```

Not all fields apply to all types. Use only the relevant fields for the checkpoint type.

---

### Checkpoint: Human Verify

```xml
<task id="03-02-T3" type="checkpoint:human-verify">
  <name>Verify OAuth callback flow</name>
  <files>
    src/pages/auth/callback.ts
  </files>
  <action>
    1. Create the OAuth callback page at `src/pages/auth/callback.ts`
    2. Wire it to call `authenticateWithDiscord()` with the authorization code
    3. On success: set JWT cookie and redirect to dashboard
    4. On failure: redirect to login with error message
  </action>
  <verify>
    what-built: OAuth callback page that exchanges Discord auth code for JWT
    how-to-verify: |
      1. Click "Login with Discord" button
      2. Authorize the application in Discord
      3. Verify you are redirected to the dashboard
      4. Check browser cookies for JWT token
    resume-signal: "User confirms OAuth flow works end-to-end"
  </verify>
  <done>User can complete full Discord OAuth login flow</done>
</task>
```

### Checkpoint: Decision

```xml
<task id="04-01-T1" type="checkpoint:decision">
  <name>Choose database migration strategy</name>
  <files></files>
  <action>
    Present the user with the migration strategy options after research.
  </action>
  <verify>
    decision: "Which migration strategy to use for production database?"
    context: "We need to decide how to handle schema changes in production."
    options: |
      A) Prisma Migrate — automatic migrations, good for development, requires care in production
      B) Manual SQL — full control, more work, explicit about what changes
      C) TypeORM migrations — auto-generated from entities, reversible
    resume-signal: "User selects option A, B, or C"
  </verify>
  <done>Database migration strategy decided and documented in CONTEXT.md</done>
</task>
```

### Checkpoint: Human Action

```xml
<task id="05-03-T2" type="checkpoint:human-action">
  <name>Configure production environment</name>
  <files>
    .env.production
  </files>
  <action>
    1. Create `.env.production.example` with all required variables listed
    2. Document each variable's purpose in comments
  </action>
  <verify>
    what-needed: "Production environment variables must be set"
    how-to-do: |
      1. Copy `.env.production.example` to `.env.production`
      2. Fill in production values for:
         - DATABASE_URL (production database connection string)
         - DISCORD_CLIENT_ID (production Discord app)
         - DISCORD_CLIENT_SECRET (production Discord app)
         - JWT_SECRET (generate with: openssl rand -base64 32)
    resume-signal: "User confirms .env.production is configured"
  </verify>
  <done>Production environment is configured with real credentials</done>
</task>
```

---

## The 7 Mandatory Elements

Every task MUST have ALL 7. No exceptions.

| Element | Purpose | Rules |
|---------|---------|-------|
| `<name>` | What the task does | Imperative verb phrase. Short. |
| `<read_first>` | Files to read before editing | One path per line. Specific paths, no globs. Prevents blind edits. |
| `<files>` | Files touched | One per line. Actual file paths. |
| `<action>` | How to do it | Numbered steps. Specific. Code snippets for complex work. |
| `<acceptance_criteria>` | Grep-verifiable conditions | One condition per line. Shell commands returning 0/non-0. Concrete, not subjective. |
| `<verify>` | How to check | Executable shell commands (plain-text or wrapped in `<automated>`). Or checkpoint format. |
| `<done>` | How to know it worked | Observable user/system behavior. Maps to a must-have. |

> **Optional `<feature>` element**: Feature tasks (TDD variant) may add a `<feature>` element with
> `<behavior>` and `<implementation>` children for structured TDD planning. The 7 standard elements
> above are still required.

---

## read_first Field

**Purpose:** Prevents the "blind edit" anti-pattern where the executor modifies files it hasn't read.

**Content:** Actual file paths (one per line). The executor must Read each listed file before editing any files in the task. No globs or wildcards allowed — paths must be specific.

**Plan-checker validates:**

- Field exists and is non-empty for every task
- Paths are specific (no `*` wildcards)

**Planner generates:** Based on `files_modified` (existing files that will be edited) and known dependencies (types, interfaces, configs imported by the modified files).

---

## acceptance_criteria Field

**Purpose:** Built-in verification lighter than spawning a separate verifier agent. Catches structural problems immediately after task completion.

**Content:** Shell commands that return 0 on success, non-zero on failure. Common patterns:

- `grep -q "functionName" path/to/file.ts` — verify a function exists
- `test -f path/to/file.ts` — verify a file exists
- `node -e "require('./path/to/module')"` — verify a module loads

**Rules:**

- Must be concrete and grep-verifiable. No subjective conditions like "code is clean".
- Each criterion is a single shell command returning 0 (pass) or non-zero (fail).
- The executor runs these after completing each task. If any fail, deviation rules apply.

---

## Task ID Format

```
{plan_id}-T{sequential_number}

Examples:
  02-01-T1  — Phase 02, Plan 01, Task 1
  02-01-T2  — Phase 02, Plan 01, Task 2
  03-02-T1  — Phase 03, Plan 02, Task 1
```

Task IDs are unique within a phase. They are used for:
- Commit message references
- Checkpoint continuation references
- SUMMARY.md task result tracking
