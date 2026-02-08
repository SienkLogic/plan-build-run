# Phase Research: Project Scaffolding

> Research conducted: 2026-02-08
> Mode: phase-research
> Phase: 01-project-scaffolding
> Confidence: HIGH
> Sources consulted: 12

## User Constraints

**From CONTEXT.md:**

**Locked Decisions:**
- Node.js 24 LTS
- Express 5.x
- HTMX + Alpine.js
- EJS templates
- Pico.css
- gray-matter (frontmatter parser)
- marked (markdown renderer)
- chokidar 5.x (file watching)
- SSE for real-time updates
- Three-layer architecture (Routes → Services → Repositories)
- Vitest for testing

**User Constraints:**
- Cross-platform (Windows + macOS/Linux)
- No build step for frontend
- Local dev tool only
- Single user
- Test project lives at D:\Repos\towline-test-project (separate repo from Towline source)

**Deferred Ideas:**
- Responsive/mobile layout
- Multi-project support
- In-browser file editing

## Phase Goal

Express 5.x server starts via CLI, serves a placeholder page, and demonstrates three-layer architecture. Specifically:
- CLI accepts `--dir` flag pointing to a Towline project directory
- Server starts on configurable port (default 3000)
- Root route (`/`) serves a placeholder EJS page styled with Pico.css
- Project structure implements Routes → Services → Repositories pattern
- Cross-platform path handling with `path.join()` / `path.resolve()`

## Implementation Approach

### Recommended Project Structure

[S2-HIGH] Express 5.x with three-layer architecture follows this structure:

```
towline-dashboard/
├── bin/
│   └── cli.js              # CLI entry point (shebang, commander.js)
├── src/
│   ├── server.js           # HTTP server startup
│   ├── app.js              # Express app configuration
│   ├── routes/
│   │   └── index.routes.js # Route definitions only
│   ├── services/
│   │   └── project.service.js # Business logic
│   ├── repositories/
│   │   └── planning.repository.js # File system access
│   ├── middleware/
│   │   └── errorHandler.js
│   └── views/
│       ├── layout.ejs      # Shared layout
│       ├── index.ejs       # Homepage
│       └── partials/
│           ├── head.ejs
│           ├── header.ejs
│           └── footer.ejs
├── public/
│   └── (empty for now; static assets later)
├── package.json
└── .env.example
```

**Rationale** [S2-HIGH, S4-MEDIUM]:
- **Separation of concerns**: `app.js` builds the Express app (routes, middleware), `server.js` starts the HTTP server. This pattern enables testing the app without starting a real server.
- **Three layers**: Routes extract request parameters → Services orchestrate logic → Repositories handle file I/O. Each layer has a single responsibility.
- **`bin/cli.js`**: CLI entry point with shebang (`#!/usr/bin/env node`) enables `npx towline-dashboard --dir .` or global install via `npm install -g`.
- **EJS views + partials**: `layout.ejs` wraps all pages, partials reduce duplication. HTMX works naturally with server-rendered HTML fragments.

### Step-by-Step Implementation

**Step 1: Package Configuration** [S2-HIGH]

`package.json`:
```json
{
  "name": "towline-dashboard",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "towline-dashboard": "./bin/cli.js"
  },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "express": "^5.2.0",
    "ejs": "^3.1.10",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "vitest": "^3.1.0"
  }
}
```

**Key points**:
- `"type": "module"` enables ESM imports [S2-HIGH]
- `bin` field maps `towline-dashboard` command to `./bin/cli.js` [S2-HIGH]
- `--watch` flag (Node.js 24) enables hot reload in development [S4-MEDIUM]

**Step 2: CLI Entry Point** [S2-HIGH]

`bin/cli.js`:
```javascript
#!/usr/bin/env node

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { startServer } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('towline-dashboard')
  .description('Start the Towline planning dashboard')
  .option('-d, --dir <path>', 'Towline project directory (containing .planning/)', process.cwd())
  .option('-p, --port <number>', 'Server port', '3000')
  .parse();

const options = program.opts();
const projectDir = resolve(options.dir);
const port = parseInt(options.port, 10);

startServer({ projectDir, port });
```

**Key decisions**:
- **Commander.js over yargs/minimist** [S4-MEDIUM]: Commander has cleaner API for simple CLIs (12.3M weekly downloads). Yargs is overkill for 2 options. Minimist lacks help text generation.
- **Shebang (`#!/usr/bin/env node`)**: Makes the file executable on Unix systems [S2-HIGH]
- **`import.meta.url` for `__dirname`**: ESM modules don't have `__dirname`; reconstruct from `fileURLToPath()` [S2-HIGH]
- **`resolve(options.dir)`**: Converts relative paths to absolute, preventing cross-platform issues [S2-HIGH]

**Step 3: Express App Configuration** [S2-HIGH]

`src/app.js`:
```javascript
import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import indexRouter from './routes/index.routes.js';
import errorHandler from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp(config) {
  const app = express();

  // Store config for access in routes/services
  app.locals.projectDir = config.projectDir;

  // View engine setup
  app.set('views', join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(join(__dirname, '..', 'public')));

  // Routes
  app.use('/', indexRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
```

**Key points**:
- **`app.locals.projectDir`**: Makes CLI config available to routes/services [S4-MEDIUM]
- **`express.static()`**: Serves files from `public/` directory. Must be registered before routes [S2-HIGH]
- **Error handler last**: Express requires error middleware to be the final `.use()` call [S2-HIGH]
- **No async wrapper needed**: Express 5.x auto-catches promise rejections [S2-HIGH]

**Step 4: HTTP Server Startup** [S2-HIGH]

`src/server.js`:
```javascript
import { createApp } from './app.js';

export function startServer(config) {
  const app = createApp(config);
  const { port } = config;

  const server = app.listen(port, () => {
    console.log(`Towline Dashboard running at http://localhost:${port}`);
    console.log(`Project directory: ${config.projectDir}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });

  return server;
}
```

**Rationale**: Separating `app.js` (configuration) from `server.js` (startup) enables testing the app without binding to a real port [S2-HIGH]

**Step 5: Route Layer** [S2-HIGH]

`src/routes/index.routes.js`:
```javascript
import { Router } from 'express';
import { getHomepage } from '../services/project.service.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await getHomepage(req.app.locals.projectDir);
    res.render('index', data);
  } catch (error) {
    next(error);
  }
});

export default router;
```

**Key decisions**:
- **No business logic in routes**: Routes only extract parameters and call services [S2-HIGH]
- **`try-catch` still recommended**: While Express 5.x auto-catches promise rejections, explicit try-catch provides control for logging/transformation [S4-MEDIUM]
- **`res.render('index', data)`**: EJS template rendering. Data becomes available as variables in the template [S2-HIGH]

**Step 6: Service Layer** [S4-MEDIUM]

`src/services/project.service.js`:
```javascript
import { readProjectMetadata } from '../repositories/planning.repository.js';

export async function getHomepage(projectDir) {
  // For Phase 1, just return placeholder data
  // Future phases will call repository to read .planning/ files
  return {
    title: 'Towline Dashboard',
    projectDir,
    message: 'Server is running. Real data in future phases.'
  };
}
```

**Rationale**: Services orchestrate between routes and repositories. Phase 1 returns placeholder data; future phases will implement real logic [S2-HIGH]

**Step 7: Repository Layer** [S4-MEDIUM]

`src/repositories/planning.repository.js`:
```javascript
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function readProjectMetadata(projectDir) {
  // Placeholder for Phase 1
  // Future phases will read .planning/STATE.md, config.json, etc.
  throw new Error('Not implemented in Phase 1');
}
```

**Rationale**: Repository layer encapsulates all file system access. Using `fs/promises` with `async/await` prevents blocking the event loop [S2-HIGH, S3-HIGH]

**Step 8: Error Handling Middleware** [S2-HIGH]

`src/middleware/errorHandler.js`:
```javascript
export default function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;

  res.status(status).json({
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  });
}
```

**Key points**:
- **4 parameters required**: Express recognizes error handlers by arity (4 args) [S2-HIGH]
- **Hide stack traces in production**: Security best practice [S3-HIGH]

**Step 9: EJS Layout and Views** [S4-MEDIUM]

`src/views/layout.ejs`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> - Towline</title>
  <!-- Pico.css from CDN -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <!-- HTMX (future phases) -->
  <script src="https://unpkg.com/htmx.org@2.0.8"></script>
  <!-- Alpine.js (future phases) -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body>
  <main class="container">
    <%- body %>
  </main>
</body>
</html>
```

`src/views/index.ejs`:
```html
<% layout('layout') -%>

<h1><%= title %></h1>
<p><%= message %></p>

<section>
  <h2>Configuration</h2>
  <ul>
    <li><strong>Project Directory:</strong> <code><%= projectDir %></code></li>
  </ul>
</section>
```

**Pattern notes**:
- **Pico.css from CDN**: No build step, instant styling [S2-HIGH]
- **Layout pattern**: EJS doesn't have native layout support; use `ejs-mate` package OR manually include partials [S4-MEDIUM]
- **Alternative**: Use `<%- include('partials/head') %>` pattern instead of layout inheritance [S4-MEDIUM]

**Revised approach without ejs-mate** [S4-MEDIUM]:

`src/views/index.ejs`:
```html
<!DOCTYPE html>
<html lang="en">
<%- include('partials/head', { title: 'Towline Dashboard' }) %>
<body>
  <main class="container">
    <h1><%= title %></h1>
    <p><%= message %></p>

    <section>
      <h2>Configuration</h2>
      <ul>
        <li><strong>Project Directory:</strong> <code><%= projectDir %></code></li>
      </ul>
    </section>
  </main>
</body>
</html>
```

`src/views/partials/head.ejs`:
```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> - Towline</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <script src="https://unpkg.com/htmx.org@2.0.8"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
```

**Decision**: Use `<%- include() %>` pattern rather than adding `ejs-mate` dependency. Keeps dependencies minimal for Phase 1 [S4-MEDIUM]

## Configuration Details

### Environment Variables

`.env.example`:
```
NODE_ENV=development
PORT=3000
PROJECT_DIR=./
```

**Note**: For Phase 1, all config comes from CLI flags. `.env` support can be added in future phases if needed [S4-LOW]

### Cross-Platform Path Handling

[S2-HIGH, S3-HIGH] **Critical for Windows + macOS/Linux support**:

```javascript
// ✅ CORRECT: Use path.join() or path.resolve()
import { join, resolve } from 'path';
const filePath = join(projectDir, '.planning', 'STATE.md');

// ❌ WRONG: Hardcoded separators fail on Windows
const filePath = projectDir + '/.planning/STATE.md';
```

**Additional patterns**:
- **Normalize paths**: `path.resolve()` converts relative to absolute and normalizes separators
- **Validate paths**: Prevent path traversal attacks by checking resolved path starts with expected prefix

```javascript
import { resolve, relative } from 'path';

function validatePath(userPath, baseDir) {
  const resolved = resolve(baseDir, userPath);
  const rel = relative(baseDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid path');
  }
  return resolved;
}
```

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| Node.js | 24.x LTS | Runtime | System |
| express | ^5.2.0 | Web framework | INF-01 |
| ejs | ^3.1.10 | Template engine | INF-01 |
| commander | ^12.1.0 | CLI argument parsing | INF-04 |
| dotenv | ^16.4.7 | Environment variables (optional Phase 1) | - |
| vitest | ^3.1.0 | Testing framework | Testing |

**Version notes**:
- **Express 5.x**: As of February 2026, latest stable is 5.2.x [S2-HIGH]
- **Commander 12.x**: Latest major version with ESM support [S2-HIGH]
- **Vitest 3.x**: Native ESM support, faster than Jest [S2-HIGH]

## Pitfalls for This Phase

1. **Missing Shebang in CLI** [S2-HIGH]: Without `#!/usr/bin/env node`, the CLI won't execute directly. Symptom: `SyntaxError: Unexpected token` when running `npx towline-dashboard`.

2. **Forgetting `chmod +x bin/cli.js`** [S4-MEDIUM]: On Unix systems, bin files need execute permission. Fix: `chmod +x bin/cli.js` or ensure npm sets it via `package.json` bin field.

3. **Hardcoded Path Separators** [S2-HIGH]: Using `/` or `\` directly breaks cross-platform support. Always use `path.join()` or `path.resolve()`.

4. **Not Handling `__dirname` in ESM** [S2-HIGH]: ESM modules don't have `__dirname`. Must reconstruct:
   ```javascript
   import { fileURLToPath } from 'url';
   import { dirname } from 'path';
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = dirname(__filename);
   ```

5. **Registering Error Handler Before Routes** [S2-HIGH]: Express middleware order matters. Error handlers (4-param functions) must be `.use()`'d after all routes.

6. **Relative Paths in Templates** [S4-MEDIUM]: If `views` directory path is relative, it breaks when CLI is run from different directories. Always use absolute paths with `join(__dirname, 'views')`.

7. **Pico.css Not Loading** [S4-MEDIUM]: If CDN is blocked or offline, page has no styling. For Phase 1, this is acceptable (local dev tool). Future phases can add fallback or local copy.

8. **Port Already in Use** [S4-MEDIUM]: If port 3000 is occupied, server startup fails. Solution: Allow CLI `--port` flag (already included in design).

## Testing Strategy

### Phase 1 Testing Scope

**Unit tests** (Vitest):
- Service layer: `getHomepage()` returns expected structure
- Repository layer: Not needed yet (placeholder functions)
- Middleware: `errorHandler` formats errors correctly

**Integration tests**:
- CLI starts server with `--dir` and `--port` flags
- GET `/` returns 200 status and HTML containing "Towline Dashboard"
- Invalid port (e.g., `--port abc`) shows error message

**Manual verification**:
1. Run `npm link` in `towline-dashboard/` to install CLI globally
2. Run `towline-dashboard --dir /path/to/test-project`
3. Visit `http://localhost:3000` in browser
4. Verify page shows placeholder content with Pico.css styling
5. Verify project directory path is displayed

**Example test** (Vitest):

```javascript
// tests/app.test.js
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import request from 'supertest';

describe('GET /', () => {
  it('returns homepage with placeholder content', async () => {
    const app = createApp({ projectDir: '/fake/path' });
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Towline Dashboard');
    expect(response.text).toContain('/fake/path');
  });
});
```

## Express 5.x Specific Notes

### Auto-Catch Async Errors [S2-HIGH]

**Express 5.x** automatically catches promise rejections in route handlers and passes them to error middleware. This eliminates the need for `express-async-handler` or manual `.catch(next)` wrappers.

**Example**:
```javascript
// Express 5.x: No wrapper needed
app.get('/user/:id', async (req, res) => {
  const user = await getUserById(req.params.id); // If this throws, Express catches it
  res.json(user);
});

// Express 4.x: Required wrapper
app.get('/user/:id', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  res.json(user);
}));
```

**Recommendation for Phase 1**: Still use `try-catch` in routes for explicit error logging and context, but know that unhandled rejections won't crash the server [S4-MEDIUM]

### Breaking Changes from Express 4.x [S2-HIGH]

1. **Path-to-regexp v8**: Route patterns may behave differently. Test custom routes.
2. **Dropped Node.js <18 support**: Requires Node.js 18+.
3. **Callback signature changes**: Some middleware callbacks have updated signatures.

**Impact on Phase 1**: Minimal. Standard route patterns (`/`, `/:id`) work identically.

## HTMX Integration Notes [S4-MEDIUM]

Phase 1 includes HTMX in the `<head>` but doesn't use it yet. Future phases will implement HTMX patterns:

**Partial rendering for dynamic updates**:
```javascript
// Route returns HTML fragment, not full page
router.get('/todos/partial', async (req, res) => {
  const todos = await todoService.getAll();
  res.render('partials/todo-list', { todos }); // Just the <ul>, not full page
});
```

**EJS partial template**:
```html
<!-- views/partials/todo-list.ejs -->
<ul id="todo-list">
  <% todos.forEach(todo => { %>
    <li><%= todo.title %></li>
  <% }); %>
</ul>
```

**HTMX trigger** (in main page):
```html
<div hx-get="/todos/partial" hx-trigger="load" hx-swap="innerHTML">
  Loading todos...
</div>
```

**Recommendation**: Phase 1 serves full HTML pages. Phase 3-4 will add HTMX partial rendering for real-time updates [S4-MEDIUM]

## Open Questions

1. **Should CLI validate that `--dir` contains a `.planning/` directory?** (Phase 1 or Phase 2?)
   - **Recommendation**: Phase 2. Phase 1 accepts any directory; validation comes when we read `.planning/` files.

2. **Should server auto-open browser on startup?** (`open` package)
   - **Recommendation**: Defer. Power users prefer manual control. Can add as `--open` flag in future phase.

3. **Should we use `ejs-mate` for layout inheritance or `<%- include() %>` partials?**
   - **Decision**: Use `<%- include() %>` to minimize dependencies in Phase 1. Can switch to `ejs-mate` in future if layout complexity increases.

4. **TypeScript or JavaScript?**
   - **Context constraint**: Not specified in CONTEXT.md. Recommendation: Start with JavaScript + JSDoc for Phase 1, evaluate TypeScript in Phase 2.

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S2-1 | Official Docs | [Express 5.x Error Handling](https://expressjs.com/en/guide/error-handling.html) | HIGH |
| S2-2 | Official Docs | [npm package.json docs](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/) | HIGH |
| S2-3 | Official Docs | [Pico.css Documentation](https://picocss.com/docs) | HIGH |
| S2-4 | Official Docs | [Express Static Files](https://expressjs.com/en/starter/static-files.html) | HIGH |
| S3-1 | GitHub | [Commander.js Repository](https://github.com/tj/commander.js) | HIGH |
| S3-2 | GitHub | [Pico.css Repository](https://github.com/picocss/pico) | HIGH |
| S4-1 | WebSearch - Verified | [Three-Layer Architecture in Node.js](https://blog.devgenius.io/the-three-layer-architecture-for-node-js-applications-ce32a3a30fa6) | MEDIUM |
| S4-2 | WebSearch - Verified | [Express.js Best Practices 2026](https://thelinuxcode.com/expressjs-tutorial-2026-practical-scalable-patterns-for-real-projects/) | MEDIUM |
| S4-3 | WebSearch - Verified | [Scaffolding Express.js 2026](https://thelinuxcode.com/scaffolding-an-expressjs-app-from-scratch-2026-a-practical-production-friendly-starting-point/) | MEDIUM |
| S4-4 | WebSearch - Verified | [EJS with HTMX Server-Side Templates](https://paulallies.medium.com/the-re-evolution-of-web-development-from-client-side-components-to-server-side-templating-with-ejs-3738b7b858d1) | MEDIUM |
| S4-5 | WebSearch - Verified | [Express 5 Native Async Support](https://dev.to/mahmud007/goodbye-asynchandler-native-async-support-in-express-5-2o9p) | MEDIUM |
| S4-6 | WebSearch - Verified | [Commander vs Yargs Comparison](https://npm-compare.com/commander,yargs) | MEDIUM |

---

**Ready for Planning**: This research provides sufficient detail to create an executable build plan for Phase 1. Key decisions are made, structure is defined, and pitfalls are documented.
