<!-- canonical: ../../pbr/references/stub-patterns.md -->
# Stub Detection Patterns

Technology-aware patterns for detecting incomplete implementations. Used by the verifier during Layer 2 (Substantiveness) checks.

Read the project's stack from `.planning/codebase/STACK.md` or `.planning/research/STACK.md` to determine which technology-specific patterns to apply. If no stack file exists, use universal patterns only.

---

## Universal Patterns (always check)

- TODO, FIXME, HACK, PLACEHOLDER, "not implemented"
- `return null`, `return {}`, `return []`, `return undefined`
- Empty function bodies, functions that only console.log
- `throw new Error('Not implemented')` or similar
- Placeholder strings ("lorem ipsum", "sample data", "example")

## React/Next.js Patterns (when stack includes React/Next)

- `<div>ComponentName</div>` — component returning only its name
- `onClick={() => {}}` — empty event handlers
- `fetch()` without error handling or response processing
- `useState` with no state updates
- Components returning `null`, `<></>`, or single placeholder div

## API/Express Patterns (when stack includes Express/Fastify/Koa)

- `res.json({ message: "Not implemented" })`
- Empty middleware: `(req, res, next) => next()`
- Routes returning hardcoded test data
- `res.status(501)` responses

## Database Patterns (when stack includes any ORM/database)

- Empty migration files
- Models/schemas with no fields beyond id
- Repository methods that return empty arrays

## Python Patterns (when stack includes Python)

- `pass` in function bodies
- `raise NotImplementedError`
- Functions returning `None` without logic
- `# TODO` in function bodies

## Go Patterns (when stack includes Go)

- Functions returning zero values without logic
- `panic("not implemented")`
- Empty interface implementations

---

## Detailed Examples

### TypeScript/JavaScript Stubs

```typescript
// STUB PATTERN: Empty function body
export function processData() { }
export function processData() { return; }
export function processData() { return null; }
export const processData = () => {};

// STUB PATTERN: Placeholder implementation
export function processData() {
  throw new Error('Not implemented');
}
export function processData() {
  throw new Error('TODO');
}

// STUB PATTERN: Hardcoded return value
export function getUsers(): User[] {
  return [];
}
export function getConfig(): Config {
  return {} as Config;
}

// STUB PATTERN: Console.log instead of implementation
export function saveUser(user: User): void {
  console.log('TODO: implement saveUser', user);
}

// STUB PATTERN: Pass-through without logic
export function validateInput(input: unknown): boolean {
  return true;  // Always passes - no real validation
}
```

### React Component Stubs

```tsx
// STUB: Null return
export function Dashboard() { return null; }

// STUB: Empty fragment
export function Dashboard() { return <></>; }

// STUB: Placeholder text
export function Dashboard() { return <div>Dashboard</div>; }
export function Dashboard() { return <div>Coming soon</div>; }

// STUB: Div with just the name
export function UserProfile() { return <div>UserProfile</div>; }

// REAL (NOT a stub): Has actual JSX structure with data binding
export function Dashboard({ data }: Props) {
  return (
    <div className="dashboard">
      <h1>{data.title}</h1>
      <MetricsGrid metrics={data.metrics} />
    </div>
  );
}
```

### API Route/Handler Stubs

```typescript
// STUB: Empty response
app.get('/api/users', (req, res) => { res.json({}); });

// STUB: Not implemented status
app.get('/api/users', (req, res) => { res.status(501).json({ error: 'Not implemented' }); });

// STUB: Hardcoded test data
app.get('/api/users', (req, res) => {
  res.json([{ id: 1, name: 'Test User' }]);
});

// REAL: Database query, error handling, response
app.get('/api/users', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const users = await db.users.findMany({ skip: (page - 1) * limit, take: limit });
  res.json({ data: users, page, limit });
});
```

### Test Stubs

```typescript
// STUB: No assertions
it('should process data', () => {});

// STUB: Trivial assertion
it('should process data', () => { expect(true).toBe(true); });

// STUB: Skipped
it.skip('should process data', () => { /* ... */ });
xit('should process data', () => { /* ... */ });

// REAL: Actual test with meaningful assertions
it('should process data and return transformed result', () => {
  const input = createTestData();
  const result = processData(input);
  expect(result.items).toHaveLength(3);
  expect(result.total).toBe(150);
});
```
