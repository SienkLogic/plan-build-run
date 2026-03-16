# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0](https://github.com/SienkLogic/plan-build-run/commits/plan-build-run-v2.0.0) (2026-03-16)

### Features

* Plan-Build-Run v2.0.0 — structured development workflow plugin for Claude Code
* Package: `@sienklogic/plan-build-run`, command prefix: `/pbr:`
* 41 slash commands, 29 skills, 14 agents, 49 hook scripts
* Core workflow: new-project → discuss-phase → plan-phase → execute-phase → verify-work
* Quick mode: `/pbr:quick` for ad-hoc tasks with atomic commits
* Wave-based parallel execution with fresh 200k-token context per agent
* Vite + React 18 + Express dashboard with WebSocket live updates (port 3141)
* Configurable status line with context budget tier warnings
* 4 derivative plugins: pbr, cursor-pbr, copilot-pbr, codex-pbr
* Depth profiles (quick/standard/comprehensive), model profiles (quality/balanced/budget)
* Git branching strategies: none, phase, milestone
* 138 test suites, 3650+ tests across Node 18/20/22 on Windows, macOS, Linux
