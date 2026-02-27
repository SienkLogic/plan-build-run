---
name: test
description: "Generate tests for completed phase code. Detects test framework and targets key files."
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by the plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:test — Post-Phase Test Generation

You are the orchestrator for `/pbr:test`. This skill generates tests for code that was built WITHOUT TDD mode. It targets key files from completed phases and creates meaningful test coverage.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Delegate** all test writing to executor agents — never write test code in the main context
- Read only SUMMARY.md frontmatter for `key_files` lists — do not read full summaries

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► GENERATING TESTS FOR PHASE {N}             ║
╚══════════════════════════════════════════════════════════════╝
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Prerequisites

- `.planning/config.json` exists
- Phase has been built: SUMMARY.md files exist in `.planning/phases/{NN}-{slug}/`
- Phase should NOT already have TDD coverage (check if `features.tdd_mode` is false in config — if TDD mode is enabled, warn user that tests should already exist and ask to proceed anyway)

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

| Argument | Meaning |
|----------|---------|
| `3` | Generate tests for phase 3 |
| (no number) | Use current phase from STATE.md |

---

## Step 1 — Gather Context

**CRITICAL: Run init command to load project state efficiently.**

```bash
node "${PLUGIN_ROOT}/scripts/pbr-tools.js" init execute-phase {phase_number}
```

This returns STATE.md snapshot, phase plans, ROADMAP excerpt, and config — all in one call.

## Step 2 — Detect Test Framework

Scan the project root for test framework indicators:

1. Check `package.json` for `jest`, `vitest`, `mocha`, `ava` in devDependencies
2. Check for `pytest.ini`, `pyproject.toml` (with `[tool.pytest]`), `setup.cfg` (with `[tool:pytest]`)
3. Check for `jest.config.*`, `vitest.config.*`, `.mocharc.*`
4. Check for existing test directories: `tests/`, `test/`, `__tests__/`, `spec/`
5. Check for existing test file patterns: `*.test.*`, `*.spec.*`, `test_*.py`

If no test framework is detected, ask the user:

Use AskUserQuestion:
  question: "No test framework detected. Which should I use?"
  header: "Framework"
  options:
    - label: "Jest"      description: "JavaScript/TypeScript testing (most common)"
    - label: "Vitest"    description: "Vite-native testing (faster, ESM-friendly)"
    - label: "pytest"    description: "Python testing framework"
  multiSelect: false

## Step 3 — Collect Target Files

Read SUMMARY.md frontmatter from each plan in the phase to extract `key_files`:

```bash
node "${PLUGIN_ROOT}/scripts/pbr-tools.js" frontmatter .planning/phases/{NN}-{slug}/SUMMARY.md
```

Collect all `key_files` across all plans in the phase. Filter to only source files (exclude config, docs, assets). Group by:
- **High priority**: Files with business logic, API endpoints, data models
- **Medium priority**: Utility functions, helpers, middleware
- **Low priority**: Config, types-only files, constants

Present the file list to the user:

Use AskUserQuestion:
  question: "Found {N} source files from phase {P}. Generate tests for which?"
  header: "Scope"
  options:
    - label: "High priority only"  description: "{X} files — business logic, APIs, models"
    - label: "High + Medium"       description: "{Y} files — adds utilities and helpers"
    - label: "All files"           description: "{Z} files — comprehensive coverage"
  multiSelect: false

## Step 4 — Generate Test Plans

For each target file, create a lightweight test plan (NOT a full PBR PLAN.md — just a task list):

```
File: src/auth/login.js
Tests to generate:
  - Happy path: valid credentials return token
  - Error: invalid password returns 401
  - Error: missing email returns 400
  - Edge: expired session handling
Framework: jest
Output: tests/auth/login.test.js
```

## Step 5 — Spawn Executor Agents

**CRITICAL: Delegate ALL test writing to agents. Do NOT write test code in the main context.**

For each target file (or batch of related files), spawn an executor agent:

```
Spawn agent_type: "pbr:executor"

Task: Generate tests for the following file(s):

<files_to_test>
{file_path}: {brief description from SUMMARY}
</files_to_test>

<test_framework>
{detected framework name and version}
Existing test directory: {path}
Test file naming: {pattern, e.g., *.test.js}
</test_framework>

<test_plan>
{test plan from Step 4}
</test_plan>

Instructions:
1. Read each source file to understand the implementation
2. Write test files following the project's existing test patterns
3. Each test file should cover: happy path, error cases, edge cases
4. Use the project's existing mocking patterns if any exist
5. Run the tests to verify they pass: {test command}
6. Commit with format: test({phase}-tests): add tests for {file}
```

Spawn up to `parallelization.max_concurrent_agents` agents in parallel for independent files.

## Step 6 — Verify and Report

After all agents complete, check results:

1. Glob for new test files created in this session
2. Run the test suite to verify all new tests pass:
   ```bash
   {test_command}
   ```
3. Count: files tested, tests written, tests passing

Display completion:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► TESTS GENERATED ✓                          ║
╚══════════════════════════════════════════════════════════════╝

Phase {N}: {X} test files created, {Y} tests passing

Files tested:
  - src/auth/login.js → tests/auth/login.test.js (8 tests)
  - src/api/users.js → tests/api/users.test.js (12 tests)



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Run coverage check** to see how much is covered

`npm test -- --coverage`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:review {N}` — verify the full phase
- `/pbr:continue` — execute next logical step


```

---

## Anti-Patterns

1. **DO NOT** write test code in the main orchestrator context — always delegate to executor agents
2. **DO NOT** generate tests for files not listed in SUMMARY.md key_files — stay scoped to the phase
3. **DO NOT** skip running the tests — always verify they pass before reporting success
4. **DO NOT** generate trivial tests (testing getters/setters, testing constants) — focus on behavior
5. **DO NOT** read full source files in the orchestrator — let the executor agents read them
