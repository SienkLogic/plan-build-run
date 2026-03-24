---
component: check-plan-format
version: 1
last_calibrated: 2026-03-24
---

# check-plan-format Few-Shot Examples

These examples document structural patterns for reference and calibration. The hook uses JavaScript validation, not LLM judgment.

## Positive Examples

### Example 1: Well-formed PLAN.md with all required frontmatter and task elements

**Input:** Write to `.planning/phases/42-auth-refactor/PLAN-01.md`

**Content:**

```yaml
---
phase: "42-auth-refactor"
plan: "42-01"
type: "feature"
wave: 1
depends_on: []
files_modified:
  - "src/auth/middleware.js"
  - "src/auth/session.js"
autonomous: true
must_haves:
  truths:
    - "Session tokens are encrypted at rest"
  artifacts:
    - "src/auth/middleware.js: >50 lines"
  key_links:
    - "middleware.js imported by server.js"
implements:
  - "REQ-AUTH-01"
---
```

```xml
<task id="42-01-T1" type="auto" tdd="false" complexity="simple">
<name>Implement encrypted session storage</name>
<read_first>
src/auth/session.js
</read_first>
<files>
src/auth/middleware.js
src/auth/session.js
</files>
<action>
1. Add AES-256-GCM encryption to session.save()
2. Add decryption to session.load()
</action>
<acceptance_criteria>
grep -n "createCipheriv" src/auth/session.js
</acceptance_criteria>
<verify>
node -e "require('./src/auth/session').save({test:1}); console.log('OK')"
</verify>
<done>Session tokens encrypted at rest using AES-256-GCM.</done>
</task>
```

**Hook result:** No errors, no warnings. All 7 required frontmatter fields present (`phase`, `plan`, `wave`, `type`, `depends_on`, `files_modified`, `autonomous`). `must_haves` has all 3 sub-fields (`truths`, `artifacts`, `key_links`). `implements` present. Task has all 7 required elements (`name`, `read_first`, `files`, `action`, `acceptance_criteria`, `verify`, `done`).

### Example 2: Well-formed SUMMARY.md with required fields and Self-Check section

**Input:** Write to `.planning/phases/42-auth-refactor/SUMMARY-01.md`

**Content:**

```yaml
---
phase: "42-auth-refactor"
plan: "42-01"
status: "complete"
provides:
  - "Encrypted session storage"
requires: []
key_files:
  - "src/auth/middleware.js: AES-256-GCM encryption middleware"
  - "src/auth/session.js: session save/load with encryption"
deferred:
  - "Session key rotation (out of scope for this plan)"
duration: 12
requirements-completed:
  - "REQ-AUTH-01"
---
```

```markdown
## Self-Check: PASSED

- [x] middleware.js encrypts session data (verified: grep shows createCipheriv)
- [x] session.js decrypts on load (verified: test script exits 0)
- [x] No plaintext tokens in storage
```

**Hook result:** No errors. All required fields present (`phase`, `plan`, `status`, `provides`, `requires`, `key_files`). `deferred` field present (avoids warning). `duration` and `requirements-completed` present (avoids advisory warnings).

## Negative Examples

### Example 1: PLAN.md missing must_haves and task missing verify element

**Input:** Write to `.planning/phases/42-auth-refactor/PLAN-01.md`

**Content:**

```yaml
---
phase: "42-auth-refactor"
plan: "42-01"
type: "feature"
wave: 1
depends_on: []
files_modified:
  - "src/auth/middleware.js"
autonomous: true
implements: []
---
```

```xml
<task id="42-01-T1" type="auto" tdd="false" complexity="simple">
<name>Implement encrypted session storage</name>
<read_first>
src/auth/session.js
</read_first>
<files>
src/auth/middleware.js
</files>
<action>
1. Add encryption to session storage
</action>
<acceptance_criteria>
grep -n "encrypt" src/auth/session.js
</acceptance_criteria>
<done>Session encryption added.</done>
</task>
```

**Hook result:** 2 errors:

- `Frontmatter missing "must_haves" field (truths/artifacts/key_links required)` -- format-validators.js `validatePlan()` checks for `must_haves:` in frontmatter. Without it, there is nothing for the verifier to check against.
- `Task 1: missing <verify> element` -- Every task must include a `<verify>` command that the executor runs post-implementation. Without it, the self-check step has no verification command to run.

### Example 2: SUMMARY.md missing requires and key_files fields

**Input:** Write to `.planning/phases/42-auth-refactor/SUMMARY-01.md`

**Content:**

```yaml
---
phase: "42-auth-refactor"
plan: "42-01"
status: "complete"
provides:
  - "Encrypted session storage"
---
```

**Hook result:** 2 blocking errors:

- `Frontmatter missing "requires" field` -- Even if there are no dependencies, `requires: []` must be explicitly stated. The build skill uses this field to check inter-plan dependencies.
- `Frontmatter missing "key_files" field` -- Even if empty, `key_files: []` must be present. The dashboard and status skill read this field to show what was produced.

Additionally, 1 warning:

- `Frontmatter missing "deferred" field` -- The `deferred` field forces the executor to consciously record any scope creep. Omitting it means out-of-scope work may go untracked.
