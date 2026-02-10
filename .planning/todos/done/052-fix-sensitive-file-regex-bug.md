---
title: "Fix sensitive file regex bug in validate-commit.js"
status: pending
priority: P2
source: dev-guide-review-pass-2
created: 2026-02-10
theme: hook-hardening
---

## Goal

`validate-commit.js` line 29 uses `/\.env\.[^.]*$/` to match sensitive `.env.*` files. The `[^.]*` (zero or more) matches `.env.` with nothing after the dot — which means `.env.example` is matched by SENSITIVE_PATTERNS. It only works because SAFE_PATTERNS (line 38-43) includes `/\.example$/i` which rescues it.

This is a fragile two-layer defense. If someone removes `.example` from SAFE_PATTERNS without understanding the regex, `.env.example` would be incorrectly blocked.

## Changes

1. **`plugins/dev/scripts/validate-commit.js` line 29** — Change `[^.]*` to `[^.]+`:
   ```javascript
   // Before (matches .env. with zero chars after dot):
   /\.env\.[^.]*$/

   // After (requires at least one char after dot):
   /\.env\.[^.]+$/
   ```

2. **`tests/validate-commit.test.js`** — Add test case:
   ```javascript
   test('allows .env.example even without safe patterns', () => {
     // .env.example should not match SENSITIVE_PATTERNS at all
   });
   ```

## Acceptance Criteria

- [ ] Regex uses `[^.]+` (one or more) instead of `[^.]*` (zero or more)
- [ ] `.env.example` is not matched by SENSITIVE_PATTERNS
- [ ] SAFE_PATTERNS still rescues `.env.example` as a belt-and-suspenders defense
- [ ] All existing tests pass
