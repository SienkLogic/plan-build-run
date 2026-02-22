# Anthropic Official Plugin Directory Submission

## Submission Form

**URL**: https://clau.de/plugin-directory-submission

This is the official route for getting Plan-Build-Run listed on:
- **claude.com/plugins** (the Anthropic plugin catalog)
- **anthropics/claude-plugins-official** GitHub repo (under `external_plugins/`)

## What We Know About Requirements

### Quality Standards
- Plugin must be functional and well-tested
- Clear documentation (README, install instructions)
- Follows the `.claude-plugin/plugin.json` metadata spec

### Security Standards
- No malicious code or data exfiltration
- Hook scripts must be transparent and auditable
- MIT or similar permissive license preferred

### Review Tiers
| Tier | Badge | What it means |
|------|-------|---------------|
| Listed | None | Basic automated review passed |
| Verified | "Anthropic Verified" | Manual quality + safety review by Anthropic |

## Our Plugin Metadata (Already Complete)

The file `plugins/pbr/.claude-plugin/plugin.json` already exists and is well-formed:

```json
{
  "name": "pbr",
  "version": "2.0.0",
  "description": "Plan-Build-Run — Structured development workflow for Claude Code. Solves context rot through disciplined subagent delegation, structured planning, atomic execution, and goal-backward verification.",
  "author": {
    "name": "SienkLogic",
    "email": "dave@sienklogic.com"
  },
  "homepage": "https://github.com/SienkLogic/plan-build-run",
  "repository": "https://github.com/SienkLogic/plan-build-run",
  "license": "MIT",
  "keywords": ["claude-code", "context-engineering", "development-workflow", "subagent-delegation"]
}
```

## Submission Form — Draft Responses

Use these when filling out the form at https://clau.de/plugin-directory-submission:

### Plugin Name
```
Plan-Build-Run
```

### Plugin Repository URL
```
https://github.com/SienkLogic/plan-build-run
```

### Short Description (1-2 sentences)
```
Context-engineered development workflow for Claude Code. Solves context rot through
subagent delegation — keeps your orchestrator under ~15% context while 10 specialized
agents work in fresh 200k-token windows.
```

### Detailed Description
```
Plan-Build-Run is a structured development workflow plugin that solves the primary failure mode
of long Claude Code sessions: context rot (quality degradation as the context window
fills up).

Instead of treating context as infinite, Plan-Build-Run delegates heavy work to fresh subagent
contexts. Each of 10 specialized agents (researcher, planner, executor, verifier, etc.)
gets a clean 200k-token window. All state lives on disk in a .planning/ directory —
sessions are killable at any second without data loss.

Key features:
- 21 slash commands covering the full development lifecycle
- Wave-based parallel execution with atomic commits
- Goal-backward verification (checks codebase against requirements, not just task completion)
- 15 lifecycle hooks enforcing commit format, context budget, plan compliance at zero token cost
- Configurable depth profiles: quick (Free/Pro), standard (Max), comprehensive (Max 5x)
- Companion web dashboard for browsing planning state
- 780+ tests across 36 suites, CI on Node 18/20/22 x Windows/macOS/Linux
```

### Category
```
Developer Productivity / Workflow Orchestration
```

### Install Command
```
claude plugin marketplace add SienkLogic/plan-build-run
claude plugin install pbr@plan-build-run
```

### Author/Organization
```
SienkLogic (Dave Sienk)
```

### License
```
MIT
```

### Why This Plugin Should Be Featured
```
Plan-Build-Run addresses a fundamental problem that every Claude Code user faces on complex
projects: context rot. No other plugin in the directory focuses on context window
management as its core architecture. It's extensively tested (780+ tests), works on
every Claude Code tier, and has a unique approach of structured subagent delegation
that could serve as a reference implementation for how plugins can orchestrate agents
effectively.
```

## Pre-Submission Checklist

- [x] `plugin.json` exists with all required fields
- [x] Repository is public on GitHub
- [x] README has clear install instructions
- [x] MIT license file present
- [x] CI passing (GitHub Actions badge)
- [x] No secrets or credentials in the codebase
- [x] Hook scripts are transparent (all CommonJS, auditable)
- [ ] **Consider**: Add a `SECURITY.md` to the repo (shows maturity)
- [ ] **Consider**: Add a social preview image on GitHub
- [ ] **Consider**: Ensure the wiki has complete documentation

## Post-Submission

After submitting:
1. Watch for any follow-up from the Anthropic review team
2. If approved, users will be able to install via the official marketplace
3. An "Anthropic Verified" badge requires additional manual review — not guaranteed on first submission
4. Monitor the `external_plugins/` directory in anthropics/claude-plugins-official for your listing
