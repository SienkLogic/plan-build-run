<!-- canonical: ../../pbr/references/integration-patterns.md -->
# Integration Patterns Reference

Technology-specific grep/search patterns and E2E flow templates for integration-checker.

## E2E Flow Templates

### Authentication Flow

| Step | Check |
|------|-------|
| 1. Login form exists | Component with email/password fields or OAuth button |
| 2. Form submits to auth endpoint | onSubmit calls auth API or redirects to OAuth |
| 3. Backend validates credentials | Route handler with validation logic |
| 4. Token/session created | JWT generation or session creation |
| 5. Token stored client-side | Cookie set or localStorage/state |
| 6. Requests include auth | Auth header or cookie sent with API calls |
| 7. Protected routes accessible | Auth middleware passes with valid token |
| 8. Invalid auth redirects | 401 or redirect when no/invalid token |

### Data Display Flow

| Step | Check |
|------|-------|
| 1. Page/component renders | Component file with JSX/HTML |
| 2. Component requests data | useEffect/useSWR/useQuery with API call |
| 3. API route handles request | Route handler exists for endpoint |
| 4. Handler queries data source | Database query or service call |
| 5. Data returned | res.json() or return with data |
| 6. Component renders data | Data mapped to JSX elements |
| 7. Loading state handled | Loading indicator while fetching |
| 8. Error state handled | Error message on failure |

### Form Submission Flow

| Step | Check |
|------|-------|
| 1. Form component exists | Form element with inputs |
| 2. Client-side validation | Schema or manual checks |
| 3. Submit calls API | fetch/axios with form data |
| 4. Server validates input | Input validation in handler |
| 5. Server processes request | Business logic (CRUD) |
| 6. Database mutation | Write operation |
| 7. Success response | Response with success status |
| 8. UI reflects success | Toast/redirect/state update |
| 9. Error handling | Server errors shown in form |

### CRUD Flow (per entity)

| Step | Check |
|------|-------|
| 1. List view | Component renders list |
| 2. Create form | Component with creation UI |
| 3. Create API | POST route with handler |
| 4. Read/detail API | GET route with handler |
| 5. Update form | Component with edit UI |
| 6. Update API | PUT/PATCH route with handler |
| 7. Delete action | Delete button/handler |
| 8. Delete API | DELETE route with handler |
| 9. Frontend calls all CRUD | All operations invoked from UI |
| 10. Auth on all ops | All operations require auth (if applicable) |

## Technology-Specific Search Patterns

### React / Next.js

```bash
# Component imports and usage
grep -rn "import.*{Component}" src/ --include="*.tsx"
grep -rn "<{Component}" src/ --include="*.tsx"

# Context providers (must wrap the app)
grep -rn "Provider" src/app/layout.tsx src/pages/_app.tsx 2>/dev/null

# Client vs Server components (Next.js)
grep -rn "'use client'\|\"use client\"" src/ --include="*.tsx"

# Next.js API routes (App Router)
find src/app/api -name "route.ts" 2>/dev/null

# Next.js middleware
find src -name "middleware.ts" -maxdepth 2 2>/dev/null

# Data fetching hooks
grep -rn "useSWR\|useQuery\|useMutation\|getServerSideProps\|getStaticProps" src/ --include="*.tsx" --include="*.ts"
```

### Express / Node.js API

```bash
# Route registration on main app
grep -rn "app\.use\|router\.use" src/ --include="*.ts" --include="*.js"

# Middleware chain order (important for auth)
grep -rn "\.use(" src/app.ts src/server.ts src/index.ts 2>/dev/null

# Error handling middleware (must be last)
grep -rn "err.*req.*res.*next\|ErrorHandler\|errorMiddleware" src/ --include="*.ts" --include="*.js"

# Database connection used in routes
grep -rn "db\.\|prisma\.\|knex\.\|mongoose\.\|sequelize\." src/ --include="*.ts" --include="*.js" | grep -v "node_modules"
```

### Python (Django / Flask / FastAPI)

```bash
# URL patterns
grep -rn "urlpatterns\|path(\|route(" */urls.py **/urls.py 2>/dev/null

# View imports
grep -rn "from.*views.*import\|from.*api.*import" */urls.py **/urls.py 2>/dev/null

# Middleware registration
grep -rn "MIDDLEWARE" */settings.py 2>/dev/null

# Model imports in views
grep -rn "from.*models.*import" */views.py **/views.py 2>/dev/null
```
