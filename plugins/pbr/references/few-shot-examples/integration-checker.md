---
component: integration-checker
version: 1
last_calibrated: 2026-03-24
---

# Integration-Checker Few-Shot Examples

## Positive Examples

### Example 1: Cross-phase export/import case mismatch detected

**Input:** Phase 5 SUMMARY.md declares `provides: ["AuthService class in src/services/auth.js"]`. Phase 6 code imports `const { authService } = require('./services/auth')`.

**Output:**

> **Check: Export/Import Wiring**
> Status: MISMATCHED
> Evidence: Phase 5 exports `AuthService` (PascalCase class, `src/services/auth.js` line 45: `module.exports = { AuthService }`). Phase 6 imports `authService` (camelCase, `src/routes/api.js` line 3: `const { authService } = require('./services/auth')`). Destructuring will yield `undefined` because the export key is `AuthService`, not `authService`.
> Recommendation: Change Phase 6 import to `const { AuthService } = require('./services/auth')` or add a camelCase alias in Phase 5 exports.

**Why this is good:** The checker traced the exact export and import statements with file paths and line numbers. It identified the root cause (JavaScript destructuring is case-sensitive) and explained the runtime consequence (`undefined`). The recommendation is specific and gives two options.

### Example 2: Missing database migration for new column

**Input:** Phase 8 adds `user_preferences` column reference in `src/models/user.js` (line 23: `this.preferences = row.user_preferences`). No migration file exists in `migrations/` directory.

**Output:**

> **Check: Cross-Phase Dependency Satisfaction**
> Status: ERROR
> Evidence: `src/models/user.js` line 23 reads `row.user_preferences` but no migration file in `migrations/` creates this column. `ls migrations/` shows latest migration is `20260320_add_sessions_table.js`. Grep for `user_preferences` across all migrations returns 0 matches.
> Impact: Runtime `SELECT` queries will return `undefined` for `row.user_preferences` on any existing database. New deployments will fail if the ORM enforces column existence.
> Recommendation: Create migration `20260324_add_user_preferences_column.js` adding `user_preferences TEXT` to the users table.

**Why this is good:** The checker went beyond code structure to check data layer dependencies. It verified the column does not exist in any migration file using grep, identified the runtime impact, and provided a specific migration file recommendation with naming convention that matches the existing pattern.

## Negative Examples

### Example 1: No cross-phase boundary checks performed

**Input:** 4 completed phases with SUMMARY.md provides/requires declared. Phase 3 requires `configLoad` from Phase 2.

**Output:**

> ## Integration Checks
>
> | Check | Status | Evidence |
> |-------|--------|----------|
> | Export/Import Wiring | PASSED | All phases have provides/requires declared |
> | API Route Coverage | N/A | No API routes |
> | Auth Protection | N/A | No auth |
> | E2E Flows | N/A | No user flows |
>
> Status: passed, checks_total: 4, checks_passed: 4

**Why this is bad:** The checker reported "PASSED" for Export/Import Wiring by only verifying that SUMMARY.md frontmatter fields exist -- it never checked whether the actual code matches the declarations. Having `provides: ["configLoad"]` in a SUMMARY.md does not mean `configLoad` is actually exported or that Phase 3 actually imports it. No grep commands, no file reads, no line numbers.

### Example 2: False positive from incomplete scope analysis

**Input:** Phase 4 exports `logHook()` from `plugins/pbr/scripts/hook-logger.js`. Checker reports it as ORPHANED because no standard `import` or `require` references it in Phase 5-7 source files.

**Output:**

> **Check: Export/Import Wiring**
> Status: ORPHANED (WARNING)
> Evidence: `logHook` exported from `plugins/pbr/scripts/hook-logger.js` line 12. Grep for `require.*hook-logger` in phases 5-7 files returns 0 matches. Export appears unused.
> Recommendation: Remove unused export or add consumer.

**Why this is bad:** The checker only searched phases 5-7 source files but `logHook` is consumed by hook scripts loaded dynamically via `hooks.json` -- not through standard `require()` imports in application code. Hook scripts use `const { logHook } = require('./hook-logger')` but live in `plugins/pbr/scripts/`, which the checker excluded from its search scope. A thorough integration check would search ALL files that could consume the export, including hook scripts and config-referenced modules.
