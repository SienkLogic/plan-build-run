---
phase: "13-extract-and-deduplicate"
plan: "13-07"
status: "complete"
subsystem: "agents"
tags:
  - "refactor"
  - "template-extraction"
  - "context-optimization"
requires: []
provides:
  - "templates/VERIFICATION-DETAIL.md.tmpl: Detailed output format for verifier agent reports"
  - "templates/INTEGRATION-REPORT.md.tmpl: Output format for integration-checker agent reports"
affects:
  - "plugins/dev/agents/towline-verifier.md"
  - "plugins/dev/agents/towline-integration-checker.md"
  - "plugins/dev/templates/"
tech_stack:
  - "markdown"
key_files:
  - "plugins/dev/templates/VERIFICATION-DETAIL.md.tmpl: Detailed verification report output format (YAML frontmatter, truths, artifacts, key links, gaps, anti-patterns, regressions, summary)"
  - "plugins/dev/templates/INTEGRATION-REPORT.md.tmpl: Integration report output format (dependency graph, export/import wiring, API coverage, auth protection, E2E flows, score, recommendations)"
  - "plugins/dev/agents/towline-verifier.md: Verifier agent definition (now references external template)"
  - "plugins/dev/agents/towline-integration-checker.md: Integration-checker agent definition (now references external template)"
key_decisions:
  - "Named template VERIFICATION-DETAIL.md.tmpl (not VERIFICATION.md.tmpl) to avoid conflict with existing simpler template"
  - "Included placeholder docs (bullet list of section summaries) in agent files so agents have context without reading the template"
patterns:
  - "Read reference with placeholder docs: agent file describes template contents in bullet list for quick context"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 2
  start_time: "2026-02-09T18:16:23Z"
  end_time: "2026-02-09T18:19:12Z"
deferred: []
---

# Plan Summary: 13-07

## What Was Built

Extracted inline output format templates from two agent definitions -- towline-verifier.md and towline-integration-checker.md -- into external template files in the shared `templates/` directory. The verifier agent's Output Format section (~115 lines of markdown/YAML template) was moved to `VERIFICATION-DETAIL.md.tmpl`, and the integration-checker's Output Format section (~149 lines of markdown template) was moved to `INTEGRATION-REPORT.md.tmpl`.

Both agent definition files were updated to replace their inline templates with Read references pointing to the external files, along with concise bullet-list summaries of what each template contains. This preserves agent context awareness while eliminating large inline blocks that consume token budget when the agent definitions are loaded.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 13-07-T1: Extract verifier agent output format template | done | 4fc1cc5 | 2 | passed |
| 13-07-T2: Extract integration-checker agent output format template | done | 3257931 | 2 | passed |

## Key Implementation Details

The verifier agent file was reduced from 674 to 571 lines (103 lines saved). The integration-checker agent file was reduced from 650 to 511 lines (139 lines saved). Combined savings: 242 lines of inline template content extracted to shared files.

The template `VERIFICATION-DETAIL.md.tmpl` was deliberately named with `-DETAIL` suffix because a simpler `VERIFICATION.md.tmpl` already exists in the templates directory. The two serve different purposes.

Each replacement section includes a bullet-list summary of the template's contents (frontmatter fields, table structures, section descriptions) so the agent retains awareness of the output format structure without needing to read the external file during every invocation.

## Known Issues

None.

## Dependencies Provided

- `plugins/dev/templates/VERIFICATION-DETAIL.md.tmpl` -- Can be read by towline-verifier agent to produce detailed phase verification reports
- `plugins/dev/templates/INTEGRATION-REPORT.md.tmpl` -- Can be read by towline-integration-checker agent to produce cross-phase integration reports
