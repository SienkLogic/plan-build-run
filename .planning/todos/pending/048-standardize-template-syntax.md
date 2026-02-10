---
title: "Standardize template variable syntax"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: quality
---

## Goal

Templates mix EJS (`<%= var %>`) and Mustache-style (`{var}`) syntax inconsistently. Some templates use both. This makes it unclear how to fill them.

## Changes

1. **Audit all 24 templates** — Identify which syntax each uses
2. **Pick one syntax** — `{var}` (simple string replacement) is more appropriate since templates aren't rendered by a template engine
3. **Convert all templates** to consistent `{var}` syntax
4. **Document** template syntax convention in DEVELOPMENT-GUIDE.md

## Acceptance Criteria

- [ ] All templates use consistent variable syntax
- [ ] Convention documented in development guide
- [ ] `npm run validate` passes
