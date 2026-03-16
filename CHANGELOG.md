# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.0.0...plan-build-run-v2.1.0) (2026-03-16)


### Features

* **01-01:** add context_window_tokens to config schemas and template ([1f66e15](https://github.com/SienkLogic/plan-build-run/commit/1f66e1553f2836ea661378a9972817ca909ac700))
* **01-01:** GREEN - add context_window_tokens to portableKeys in config.js and config.cjs ([1689326](https://github.com/SienkLogic/plan-build-run/commit/16893262fca489f8d5cc0b94da5eaa4750ddb930))
* **02-01:** scale context-bridge and lib/context thresholds from config ([8c6b6e9](https://github.com/SienkLogic/plan-build-run/commit/8c6b6e9e604db3a3700aa7290e997c2da449048b))
* **02-02:** scale track-context-budget and suggest-compact from config ([86fd842](https://github.com/SienkLogic/plan-build-run/commit/86fd842c9486c3b4d55a4d1e0579f5884ce04fe6))
* **03-01:** add agent_checkpoint_pct to config schema and profiles ([61e6778](https://github.com/SienkLogic/plan-build-run/commit/61e6778e47bf046e9c306b0ac606727511835b0e))
* **03-02:** update all 14 agents with context-aware checkpoint rules ([bdbdfc4](https://github.com/SienkLogic/plan-build-run/commit/bdbdfc43deb6ae309d02d5ebd39165b45bf7fecf))
* **04-01:** add context-aware read depth to shared skill fragments ([ee2b33b](https://github.com/SienkLogic/plan-build-run/commit/ee2b33b59d303ad5a589dbd0fb687823294262df))
* **04-02:** update build, plan, review, explore skills with 1M read depth ([c3327a1](https://github.com/SienkLogic/plan-build-run/commit/c3327a1912a2c733ea2a4c60a0dd40d608f774e5))
* **05-01:** scale researcher cycles and output budgets for 1M context ([b2abaaf](https://github.com/SienkLogic/plan-build-run/commit/b2abaaf106b2a1ca7219921b80454273114d6ea6))
* **05-02:** scale planner, executor, debugger, verifier budgets for 1M context ([13db078](https://github.com/SienkLogic/plan-build-run/commit/13db078a1401588a202b4c37b5c9682f86bfbfc6))
* **05-03:** scale synthesizer, codebase-mapper, plan-checker, integration-checker budgets for 1M ([8d37be0](https://github.com/SienkLogic/plan-build-run/commit/8d37be02954be5742e6cce04beb6c5f8ea88ae74))
* **06-01:** add cross-phase verification mode to verifier agent ([8b676c6](https://github.com/SienkLogic/plan-build-run/commit/8b676c6f08620d0444f59a83f074d41d8a501326))
* **06-02:** surface cross-phase findings in review and build skills ([f9726d2](https://github.com/SienkLogic/plan-build-run/commit/f9726d261b7825b2a0b47461471cbfdc0dddff71))
* **07-01:** add multi-phase lookahead to continue skill at 1M context ([089f069](https://github.com/SienkLogic/plan-build-run/commit/089f0691647d9965cbf71d6fba987d5ccdb0807f))
* **08-01:** add pre-spawn conflict detection to build skill at 1M context ([ff8a80e](https://github.com/SienkLogic/plan-build-run/commit/ff8a80e3e4cf5423eeddddd8d77ea0aa53460004))


### Bug Fixes

* **02-02:** apply threshold scaling to hooks/ copies and fix config cache paths ([52e781c](https://github.com/SienkLogic/plan-build-run/commit/52e781c35f4f1916587e1acdc6e0561f6393bbda))
* **03-02:** guard agent_checkpoint_pct &gt; 50 on context_window_tokens &gt;= 500k ([73573af](https://github.com/SienkLogic/plan-build-run/commit/73573af8967a2467e800cac6430f67fc943e5e87))
* **hooks:** add allow logging to PreToolUse dispatch scripts for visibility ([b731828](https://github.com/SienkLogic/plan-build-run/commit/b73182884ca0ee0122fe419be33438e2caa6bd96))

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
