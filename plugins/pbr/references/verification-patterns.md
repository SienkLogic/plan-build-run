# Goal-Backward Verification Patterns

Reference patterns for deriving verification criteria from goals. Used by the planner to create `<verify>` and `<done>` elements, and by the verifier to check phase completion.

---

## The Four-Layer Check

Every must-have is verified through up to four layers, checked in order:

### Layer 1: Existence

Does the artifact exist?

```bash
# File existence
ls -la src/auth/discord.ts

# Module export existence
grep -q "export.*authenticateWithDiscord" src/auth/discord.ts

# Database table existence
npx prisma db execute --stdin <<< "SELECT 1 FROM users LIMIT 1"

# Route existence
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/login
```

### Layer 2: Substantiveness

Is the artifact more than a stub?

```bash
# File has real content (not just exports)
wc -l src/auth/discord.ts  # Should be > 10 lines for a real implementation

# Function has a body (not just a signature)
grep -A5 "authenticateWithDiscord" src/auth/discord.ts | grep -q "return"

# Test file has actual test cases
grep -c "it(" tests/auth.test.ts  # Should be > 0

# API returns real data (not just 200 OK)
curl -s http://localhost:3000/api/health | jq '.status' | grep -q "ok"
```

### Layer 3: Wiring

Are components connected to each other?

```bash
# Module is imported where needed
grep -q "from.*auth/discord" src/routes/auth.ts

# Middleware is applied to routes
grep -q "requireAuth" src/routes/protected.ts

# Database is configured in app init
grep -q "prisma" src/app.ts

# Environment variables are referenced
grep -q "DISCORD_CLIENT_ID" src/auth/discord.ts
```

### Layer 4: Functional

Does the artifact actually work when executed?

```bash
# Tests pass
npm test -- --testPathPattern auth
pytest tests/test_auth.py -v

# Build succeeds
npm run build
npx tsc --noEmit

# API returns correct data
curl -s http://localhost:3000/api/auth/login -X POST -d '{"code":"test"}' | jq '.token'

# CLI produces expected output
node src/cli.js --help | grep -q "Usage:"
```

**When to apply L4:** Only when automated verification commands exist (test suites, build scripts, API endpoints with test data). Skip for items requiring manual/visual testing. L4 is optional — artifacts passing L1-L3 without available automated tests are reported as `PASSED (L3 only)`.

---

## Verification by Feature Type

### API Endpoint

```
Existence:   curl returns non-404 status
Substance:   curl returns expected response shape (correct fields)
Wiring:      endpoint calls the right service, middleware is applied
Functional:  POST/GET with test data returns correct response, error cases handled
```

### Database Schema

```
Existence:   table/collection exists, can query without error
Substance:   columns/fields match specification, constraints are applied
Wiring:      application code references the schema, migrations run cleanly
Functional:  CRUD operations work end-to-end, constraints reject invalid data
```

### Authentication

```
Existence:   auth routes exist, auth module exports functions
Substance:   login flow returns token, invalid creds return error
Wiring:      protected routes use auth middleware, tokens are validated
Functional:  auth tests pass (valid token, expired token, missing token, malformed token)
```

### UI Component

```
Existence:   component file exists, exports default component
Substance:   component renders expected elements (test or visual check)
Wiring:      component is imported in parent, receives correct props, routes to it
Functional:  component tests pass, build succeeds with component included
```

### Configuration

```
Existence:   config file exists, environment variables documented
Substance:   config values are used (not dead code), defaults are sensible
Wiring:      application reads config at startup, config changes take effect
Functional:  app starts with config, missing config produces clear error message
```

---

## Verify Command Patterns

### TypeScript/JavaScript

```bash
# Type checking
npx tsc --noEmit

# Unit tests
npm test
npm test -- --grep "pattern"
npx jest path/to/test

# Linting
npx eslint src/auth/

# Build check
npm run build
```

### Python

```bash
# Type checking
mypy src/

# Unit tests
pytest tests/
pytest tests/test_auth.py -v
pytest -k "test_login"

# Linting
flake8 src/
pylint src/auth/
```

### General

```bash
# File existence
ls -la path/to/file

# Content check
grep -q "pattern" path/to/file

# HTTP endpoint
curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/path

# Process running
pgrep -f "process-name"

# Port listening
netstat -an | grep LISTEN | grep PORT
```

---

## Done Condition Patterns

### Good Done Conditions (Observable, Falsifiable)

- "User can log in with Discord and see their dashboard"
- "API returns paginated list of items with correct total count"
- "Database migration creates users table with all required columns"
- "Protected routes return 401 without valid JWT"
- "Build completes without TypeScript errors"

### Bad Done Conditions (Vague, Not Falsifiable)

- "Authentication is implemented" (how do you test this?)
- "Code is clean" (subjective)
- "Database is set up" (what does "set up" mean?)
- "Tests pass" (which tests? what do they test?)
- "File was created" (created with what content?)

### Transformation Rule

```
Bad:  "Authentication is implemented"
Good: "User can complete Discord OAuth flow and receive a valid JWT"

Bad:  "Database is set up"
Good: "Users table exists with id, email, name columns and can accept INSERT"

Bad:  "Tests pass"
Good: "All 5 auth middleware tests pass: valid token, expired token,
       missing token, malformed token, and correct user extraction"
```

---

## Wiring Verification Patterns

4 concrete patterns for verifying components are actually connected, not just present.

### Pattern 1: Component to API
1. Find the fetch/axios call in the component
2. Verify the call is NOT commented out
3. Verify the response is assigned to state (not discarded)
4. Verify error handling exists (try/catch or .catch)

### Pattern 2: API to Database
1. Find the database query in the route handler
2. Verify `await` is present (not fire-and-forget)
3. Verify the result is returned in the response (not discarded)
4. Verify error cases return appropriate HTTP status codes

### Pattern 3: Form to Handler
1. Find the form's onSubmit handler
2. Verify it calls an API function (not just preventDefault)
3. Verify form validation runs before the API call
4. Verify success/error feedback is shown to the user

### Pattern 4: State to Render
1. Find state variables (useState, store, etc.)
2. Verify they appear in JSX/template via .map(), interpolation, or conditional rendering
3. Verify loading/error states are rendered (not just success state)
4. Verify empty state is handled (not just "no data" crash)

### Quick Verification Checklists

**Component Checklist (8 items):**
- [ ] Component file exists and exports correctly
- [ ] Props/types are defined (not `any`)
- [ ] API calls use actual endpoints (not hardcoded data)
- [ ] Loading state renders something meaningful
- [ ] Error state renders something meaningful
- [ ] Empty state renders something meaningful
- [ ] User interactions trigger actual handlers
- [ ] Component is imported and rendered in parent

**API Route Checklist (8 items):**
- [ ] Route file exists and exports handler
- [ ] Route is registered in router/app
- [ ] Request validation exists (body, params, query)
- [ ] Database query uses parameterized inputs
- [ ] Success response includes expected data shape
- [ ] Error response includes status code and message
- [ ] Authentication/authorization check exists if needed
- [ ] Response matches what the frontend expects
