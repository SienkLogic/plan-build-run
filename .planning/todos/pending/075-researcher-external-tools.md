---
title: "Add WebSearch/WebFetch/Context7 to towline-researcher allowed tools"
status: pending
priority: P2
source: user-request
created: 2026-02-10
theme: capability
---

## Goal

Add WebSearch/WebFetch/Context7 to towline-researcher's allowed tools to enable external lookups for greenfield projects where the codebase doesn't yet contain the answers.

## Scope

- Update `plugins/dev/agents/towline-researcher.md` frontmatter `tools:` list to include WebSearch, WebFetch, and mcp__context7__* (Context7 MCP)
- The iterative retrieval protocol (DISPATCH/EVALUATE/REFINE/LOOP) already supports multi-source research — external tools slot in naturally

## Acceptance Criteria

- [ ] Researcher agent can query external documentation via Context7
- [ ] Researcher agent can search the web for library docs, API references, etc.
- [ ] Existing local-only research still works (external tools are additive)
