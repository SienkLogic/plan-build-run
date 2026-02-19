<!-- canonical: ../../pbr/references/common-bug-patterns.md -->
# Common Bug Patterns

Quick reference for the debugger agent. Check these patterns early — they cover ~80% of bugs.

| Category | Patterns to Check |
|----------|------------------|
| **Off-by-one** | Loop bounds (`<` vs `<=`), 0-based vs 1-based indexing, string slice boundaries |
| **Null/undefined** | Missing optional chaining (`?.`), default params, DB query returning null, OOB array access |
| **Async/timing** | Missing `await`, race conditions, stale closures, handlers registered before element exists |
| **State management** | Direct mutation vs new object, update not triggering re-render, duplicated sources of truth, stale state in closures |
| **Import/module** | Circular imports, default vs named export mismatch, wrong file (similar names), resolution path |
| **Environment** | Missing/wrong env var, dev vs prod differences, case sensitivity (Windows vs Linux paths) |
| **Data shape** | API response format changed, schema/model mismatch, type mismatch between layers, missing field |
