# Changelog

## v2.0.0 (2026-02-19)

Initial release of Plan-Build-Run for Cursor.

### Features

- 21 skills covering the full development lifecycle: begin, plan, build, review, debug, and more
- 10 specialized agents with fresh context windows for delegation without context rot
- Shared hook scripts with the Claude Code plugin for consistent behavior
- Cross-plugin compatibility: shared `.planning/` state directory works with both Cursor and Claude Code
- File-based state management with structured planning, execution, and verification phases
- Atomic commits with deviation handling and self-verification
- Goal-backward verification ensuring builds match plans
