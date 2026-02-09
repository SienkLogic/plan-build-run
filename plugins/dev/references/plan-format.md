# Plan Format Reference

Complete reference for the XML task specification used in Towline plan files.

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
| `provides` | NO | array | What this plan exports for other plans to consume (classes, endpoints, modules) |
| `consumes` | NO | array | What this plan needs from prior plans. Format: `"Thing (from plan XX-YY)"` |
| `dependency_fingerprints` | NO | object | Hashes of dependency phase SUMMARY.md files at plan-creation time. Used to detect stale plans. |

---

## Task Types

### Standard Auto Task

```xml
<task id="02-01-T1" type="auto">
  <name>Create Discord OAuth client module</name>
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
  <verify>
    npx tsc --noEmit
    ls src/auth/discord.ts
    ls src/auth/types.ts
  </verify>
  <done>Discord OAuth client module exists and compiles without errors</done>
</task>
```

### TDD Task

```xml
<task id="02-01-T2" type="auto" tdd="true">
  <name>Implement auth middleware with TDD</name>
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
  <verify>
    npm test -- --grep "auth middleware"
  </verify>
  <done>Auth middleware rejects invalid tokens and passes valid tokens</done>
</task>
```

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

## The 5 Mandatory Elements

Every task MUST have ALL 5. No exceptions.

| Element | Purpose | Rules |
|---------|---------|-------|
| `<name>` | What the task does | Imperative verb phrase. Short. |
| `<files>` | Files touched | One per line. Actual file paths. |
| `<action>` | How to do it | Numbered steps. Specific. Code snippets for complex work. |
| `<verify>` | How to check | Executable shell commands. Or checkpoint format. |
| `<done>` | How to know it worked | Observable user/system behavior. Maps to a must-have. |

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
