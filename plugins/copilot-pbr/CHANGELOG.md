# Changelog — Plan-Build-Run for GitHub Copilot CLI

## 2.3.1 (2026-02-19)

Initial port of Plan-Build-Run to GitHub Copilot CLI.

### What's included
- 22 skills ported from Cursor plugin (argument-hint removed — not supported by Copilot CLI)
- 10 agents with `.agent.md` extension and Copilot CLI frontmatter (`tools`, `infer`, `target`)
- Hook configuration using Copilot CLI's `bash`/`powershell` format (6 of 11 events supported)
- Setup scripts for macOS/Linux (bash) and Windows (PowerShell)
- Full reference docs and templates from the shared PBR corpus

### Copilot CLI adaptations
- Agent files use `.agent.md` extension (Copilot CLI requirement)
- Hook blocking uses JSON output (`permissionDecision: "deny"`) instead of exit code 2
- Missing hook events: `SubagentStart`, `SubagentStop`, `TaskCompleted`, `PostToolUseFailure`, `PreCompact`, `Stop`
- Skills omit `argument-hint` frontmatter (not supported by Copilot CLI)
- Plugin manifest at `plugin.json` root (not in `.claude-plugin/` or `.cursor-plugin/`)
