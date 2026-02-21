# Agent Contracts

Input/output schemas for agent-to-agent handoffs in Plan-Build-Run.

Each contract defines: the file exchanged, required frontmatter fields, body structure, and special handling notes. Agents MUST produce output matching these schemas — consumers depend on them.

---

## Contract: Researcher -> Synthesizer

**File**: `.planning/research/{topic-slug}.md` (project) or `.planning/phases/{NN}-{slug}/RESEARCH.md` (phase)
**Direction**: Researcher writes, Synthesizer reads 2-4 of these

### Required Frontmatter

```yaml
---
confidence: high|medium|low
sources_checked: N        # integer count of sources consulted
coverage: "complete|partial|minimal"
---
```

### Required Body Sections

- `## Key Findings` — each finding tagged with source level (`[S1]`..`[S6]`) and confidence
- `## Gaps` — areas not covered and why
- `## Sources` — source list with what each provided

### Special Handling

- Every factual claim must have a source attribution tag
- Version-sensitive info (API signatures, config syntax) must come from S1-S3 sources
- `[SPECULATIVE]` tag marks unverified reasoning — synthesizer must not upgrade confidence

---

## Contract: Synthesizer -> Planner

**File**: `.planning/research/SUMMARY.md` (or specified path)
**Direction**: Synthesizer writes, Planner reads

### Required Frontmatter

```yaml
---
confidence: high|medium|low
sources: N                # integer count of input documents
conflicts: N              # integer count of contradictions found
---
```

### Required Body Sections

- `## Resolved Decisions` — table with Topic, Decision, Confidence, Sources columns
- `## Open Questions` — items marked `[NEEDS DECISION]` for planner to handle
- `## Deferred Ideas` — items out of scope

### Special Handling

- `[NEEDS DECISION]` flags: planner creates `checkpoint:decision` tasks OR decides within discretion scope
- Confidence levels never upgraded beyond what input documents support
- Contradictions always documented, never silently dropped

---

## Contract: Planner -> Executor

**File**: `.planning/phases/{NN}-{slug}/PLAN-{NN}.md`
**Direction**: Planner writes, Executor reads and executes sequentially

### Required Frontmatter

```yaml
---
phase: "{phase-slug}"
plan: "{NN-MM}"
wave: N
depends_on: []
files_modified: ["{path}"]
must_haves:
  truths: ["{observable condition}"]
  artifacts: ["{file: description}"]
  key_links: ["{connection description}"]
provides: ["{exported item}"]
consumes: ["{required item}"]
requirement_ids: []
---
```

### Required Body: XML Tasks (each task needs all 5 elements)

```xml
<task id="{plan}-T{n}" type="{type}" tdd="{bool}" complexity="{simple|medium|complex}">
<name>{imperative verb phrase}</name>
<files>{file paths, one per line}</files>
<action>{numbered steps}</action>
<verify>{executable shell command}</verify>
<done>{observable outcome}</done>
</task>
```

### Special Handling

- Task types: `auto`, `tdd`, `checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action`
- Complexity drives model selection: simple=haiku, medium=sonnet, complex=inherit
- Executor stages ONLY files listed in `<files>` per task
- Plans end with a `## Summary` section (plan ID, task list, key files, must-haves, provides/consumes)

---

## Contract: Planner -> Plan-Checker

**File**: Same `PLAN-{NN}.md` files (read-only)
**Direction**: Planner writes, Plan-Checker reads and returns text assessment
**Returns**: Inline text report (no file output)

### Expected Input

Plan-Checker reads plan frontmatter + XML tasks and evaluates across 9 dimensions (D1-D9). Optionally receives CONTEXT.md path.

### Output Format

```
VERIFICATION PASSED | ISSUES FOUND
Plans: N | Tasks: N | Blockers: N | Warnings: N | Info: N

## Blockers
- [{plan_id}] D{N} {severity}: {description} -> Fix: {hint}
```

### Special Handling

- Blockers must be fixed before execution; warnings are advisory
- Plan-Checker never modifies plans — only reports issues
- Planner enters Revision Mode to address feedback

---

## Contract: Executor -> Verifier

**File**: `.planning/phases/{NN}-{slug}/SUMMARY-{plan_id}.md`
**Direction**: Executor writes after completing plan tasks, Verifier reads

### Required Frontmatter

```yaml
---
plan: "{plan_id}"
status: complete|partial|checkpoint
commits: ["{sha1}", "{sha2}"]
provides: ["{exported item}"]
must_haves:
  - "{must-have description}: DONE|PARTIAL|SKIPPED"
---
```

### Required Body Sections

- `## Task Results` — table with Task, Status, Notes columns
- `## Deviations` — list of deviations from plan, or "None"

### Special Handling

- Verifier does NOT trust SUMMARY.md claims — verifies against actual codebase
- Verifier checks must-haves from PLAN.md frontmatter, not SUMMARY.md self-reports
- One SUMMARY per plan execution; status reflects final state

---

## Contract: Verifier -> Planner (Gap Closure)

**File**: `.planning/phases/{NN}-{slug}/VERIFICATION.md`
**Direction**: Verifier writes, Planner reads to create gap-closure plans

### Required Frontmatter

```yaml
---
status: passed|gaps_found|human_needed
attempt: N
must_haves_total: N
must_haves_passed: M
gaps: ["gap description"]
overrides: []
---
```

### Required Body Sections

- `## Must-Have Verification` — table with #, Must-Have, Status, Evidence columns
- `## Gaps` — per-gap detail with Evidence and Suggested fix

### Special Handling

- `gaps_found` triggers Planner Gap Closure Mode — planner creates targeted fix plans
- `overrides` list: must-haves marked as override by user, counted as passed
- Re-verification increments `attempt` counter; checks regressions on previously-passed items
- Verifier has Write access ONLY for VERIFICATION.md — cannot fix source code

---

## Contract: Integration-Checker -> Planner

**File**: `.planning/phases/{NN}-{slug}/INTEGRATION-REPORT.md`
**Direction**: Integration-Checker writes, Planner reads for cross-phase fixes

### Required Frontmatter

```yaml
---
status: passed|issues_found
checks_total: N
checks_passed: M
critical_issues: K
---
```

### Required Body Sections

- `## Integration Checks` — table with Check, Status, Evidence columns
- `## E2E Flows` — table with Flow, Status, Broken Link columns
- `## Critical Issues` — detailed issue descriptions

### Special Handling

- Checks ACROSS phases (unlike Verifier which checks single phase)
- 5 check categories: Export/Import Wiring, API Route Coverage, Auth Protection, E2E Flows, Cross-Phase Dependencies
- Integration-Checker has Write access ONLY for INTEGRATION-REPORT.md — cannot fix source code

---

## Contract: Debugger (Self-Contained)

**File**: `.planning/debug/{slug}.md`
**Direction**: Debugger creates, updates, and resolves within a single session

### Required Frontmatter

```yaml
---
slug: "{slug}"
status: "gathering|investigating|fixing|verifying|resolved"
created: "{ISO-8601}"
updated: "{ISO-8601}"
mode: "find_and_fix|find_root_cause_only"
---
```

### Required Body Sections

- `## Current Focus` — Hypothesis, Test, Expecting, Disconfirm, Next action
- `## Symptoms` — IMMUTABLE after gathering phase
- `## Hypotheses` — Active (unchecked) and Eliminated (checked, append-only)
- `## Evidence Log` — append-only timestamped entries
- `## Resolution` — root cause, mechanism, fix, commit hash (when resolved)

### Special Handling

- Status transitions: `gathering -> investigating -> fixing -> verifying -> resolved`
- Symptoms and Evidence Log are append-only / immutable — prevents mutation bias
- Fix commits use format: `fix({scope}): {description}` with root cause in body
- May emit checkpoints (`HUMAN-VERIFY`, `HUMAN-ACTION`, `DECISION`) for user input

---

## Contract: Codebase-Mapper (Self-Contained)

**Files**: `.planning/codebase/{STACK,ARCHITECTURE,CONVENTIONS,CONCERNS}.md` (varies by focus)
**Direction**: Codebase-Mapper writes, consumed by Researcher (as S0 local prior) and Planner

### Focus Areas and Outputs

| Focus | Output Files |
|-------|-------------|
| `tech` | STACK.md, INTEGRATIONS.md |
| `arch` | ARCHITECTURE.md, STRUCTURE.md |
| `quality` | CONVENTIONS.md, TESTING.md |
| `concerns` | CONCERNS.md |

### Fallback Frontmatter (per file)

No YAML frontmatter required — these are reference documents with markdown tables.

### Required Body Structure (minimum per file)

- **STACK.md**: `## Tech Stack` table (Category, Technology, Version, Config File) + `## Package Manager`
- **ARCHITECTURE.md**: `## Architecture Overview` (pattern name) + `## Key Components` table + `## Data Flow`
- **CONVENTIONS.md**: `## Code Conventions` table (Convention, Pattern, Example File) + `## Naming Patterns`
- **CONCERNS.md**: `## Concerns` table (Severity, Area, Description, File) + `## Security Considerations`

### Special Handling

- Every claim must reference actual file paths — no vague references
- Codebase-Mapper does NOT commit — the orchestrator handles commits
- Researcher treats these as S0 (highest confidence) local prior research
- One focus area per invocation
