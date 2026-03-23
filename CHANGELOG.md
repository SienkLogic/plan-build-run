# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

## [2.17.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.16.0...plan-build-run-v2.17.0) — 2026-03-23

### Other

* Enforce min_full_percent full verification in autonomous mode ([5aca292b](https://github.com/SienkLogic/plan-build-run/commit/5aca292b))
* Add CRITICAL markers prohibiting gap phase numbering ([c607ae05](https://github.com/SienkLogic/plan-build-run/commit/c607ae05))
* Add phase next-number CLI subcommand ([3deb8b12](https://github.com/SienkLogic/plan-build-run/commit/3deb8b12))
* Add phase gap detection to validateRoadmap ([d82a8b62](https://github.com/SienkLogic/plan-build-run/commit/d82a8b62))

## [2.16.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.15.0...plan-build-run-v2.16.0) — 2026-03-22

### Agents

* Add D10 CLAUDE.md compliance dimension to plan-checker agent ([49e040d0](https://github.com/SienkLogic/plan-build-run/commit/49e040d0))
* Add executor retry loop, paralysis guard, and plan-check audit trail ([65d2acc0](https://github.com/SienkLogic/plan-build-run/commit/65d2acc0))
* Upgrade D1 requirements coverage to BLOCKER severity ([274f9d9e](https://github.com/SienkLogic/plan-build-run/commit/274f9d9e))

### CLI Tools

* Generate changelog after tag creation so new version appears ([47ee1b46](https://github.com/SienkLogic/plan-build-run/commit/47ee1b46))
* Add 'hooks perf' subcommand with loadPerfEntries log reader ([0fcb4dfe](https://github.com/SienkLogic/plan-build-run/commit/0fcb4dfe))
* Rename pbr-tools.cjs references to pbr-tools.js across 38 files (75 replacements) ([29cddffb](https://github.com/SienkLogic/plan-build-run/commit/29cddffb))

### Configuration

* Make plan-checking always-on, quick depth gets advisory verification ([32a44219](https://github.com/SienkLogic/plan-build-run/commit/32a44219))

### Hooks

* Resolve ESLint errors in hook-server.js and prompt-guard.js ([69882ed2](https://github.com/SienkLogic/plan-build-run/commit/69882ed2))
* Ensure posttest always runs via test-wrapper.js ([046e2bc4](https://github.com/SienkLogic/plan-build-run/commit/046e2bc4))
* Add hook overhead display to status line when >500ms cumulative ([17cd3d8e](https://github.com/SienkLogic/plan-build-run/commit/17cd3d8e))
* Add 100ms performance alert for slow hook handlers ([9d6145f3](https://github.com/SienkLogic/plan-build-run/commit/9d6145f3))
* Instrument hook-server dispatch and startup with timing metrics ([d0d514dd](https://github.com/SienkLogic/plan-build-run/commit/d0d514dd))
* Add lib/perf.js with percentile and hook performance summary utilities ([6ec0e09c](https://github.com/SienkLogic/plan-build-run/commit/6ec0e09c))
* Add MSYS path normalization at hook-server.js startup ([e7ebc2d3](https://github.com/SienkLogic/plan-build-run/commit/e7ebc2d3))
* Add crash-recovery restart logic to tryLaunchHookServer ([a1ce9279](https://github.com/SienkLogic/plan-build-run/commit/a1ce9279))
* Add 3s startup health-poll and timeout sentinel fallback ([1e4e88f2](https://github.com/SienkLogic/plan-build-run/commit/1e4e88f2))
* Add tryNextPort EADDRINUSE recovery and updateLockPort ([6469f2d3](https://github.com/SienkLogic/plan-build-run/commit/6469f2d3))
* Convert PreCompact, PostCompact, ConfigChange, Notification, UserPromptSubmit, SessionEnd to HTTP hooks ([91caa68d](https://github.com/SienkLogic/plan-build-run/commit/91caa68d))
* Convert SubagentStart, SubagentStop, TaskCompleted to HTTP hooks ([9a70eebc](https://github.com/SienkLogic/plan-build-run/commit/9a70eebc))
* Add triggerShutdown, /shutdown endpoint, and shutdown-aware SessionEnd handler ([dcb7d34e](https://github.com/SienkLogic/plan-build-run/commit/dcb7d34e))
* Add PostCompact, Notification, UserPromptSubmit routes to initRoutes() ([b646a6a0](https://github.com/SienkLogic/plan-build-run/commit/b646a6a0))
* Replace PostToolUseFailure command entry with HTTP entry in hooks.json ([d24cdab8](https://github.com/SienkLogic/plan-build-run/commit/d24cdab8))
* Replace PostToolUse command entries with HTTP entries in hooks.json ([4a41254a](https://github.com/SienkLogic/plan-build-run/commit/4a41254a))
* Register AskUserQuestion route in initRoutes and add HTTP tests ([f1a988bd](https://github.com/SienkLogic/plan-build-run/commit/f1a988bd))
* Add handleHttp and handleGate exports to track-user-gates.js ([88619406](https://github.com/SienkLogic/plan-build-run/commit/88619406))
* Replace all PreToolUse command entries with HTTP endpoints in hooks.json ([f7d5b35d](https://github.com/SienkLogic/plan-build-run/commit/f7d5b35d))
* Register intercept-plan-mode for PreToolUse:EnterPlanMode in hook-server ([3131e7ef](https://github.com/SienkLogic/plan-build-run/commit/3131e7ef))
* Add handleHttp export to intercept-plan-mode.js ([1d36cb32](https://github.com/SienkLogic/plan-build-run/commit/1d36cb32))
* Register PostToolUse:Glob and PostToolUse:Grep routes in initRoutes ([5a84ebb6](https://github.com/SienkLogic/plan-build-run/commit/5a84ebb6))
* Consolidate PostToolUse:Read dispatch in track-context-budget handleHttp ([81fff84e](https://github.com/SienkLogic/plan-build-run/commit/81fff84e))
* Register PreToolUse consolidated handlers in hook-server initRoutes ([171eb8ee](https://github.com/SienkLogic/plan-build-run/commit/171eb8ee))
* Add pre-skill-dispatch.js consolidating validate-skill-args + enforce-context-budget ([1adba136](https://github.com/SienkLogic/plan-build-run/commit/1adba136))
* Add pre-task-dispatch.js consolidating validate-task + enforce-context-budget ([2ed37508](https://github.com/SienkLogic/plan-build-run/commit/2ed37508))
* Consolidate suggest-compact into hook server route table ([f5fbace7](https://github.com/SienkLogic/plan-build-run/commit/f5fbace7))
* Add dynamic route registration API with register() and initRoutes() ([3b0013d7](https://github.com/SienkLogic/plan-build-run/commit/3b0013d7))
* Wire PID lockfile and EADDRINUSE handling into hook-server.js ([0952b877](https://github.com/SienkLogic/plan-build-run/commit/0952b877))
* Add PID lockfile module for hook server lifecycle management ([faf5bb6e](https://github.com/SienkLogic/plan-build-run/commit/faf5bb6e))
* Update bootstrap path from hooks/run-hook.js to scripts/run-hook.js (28 commands) ([81cebda5](https://github.com/SienkLogic/plan-build-run/commit/81cebda5))
* Add advisory PostToolUse hook enforcing read_first file reads before edits ([c2b828fe](https://github.com/SienkLogic/plan-build-run/commit/c2b828fe))
* Fix structured denial format and add requirements coverage gate ([1ed7273d](https://github.com/SienkLogic/plan-build-run/commit/1ed7273d))
* Add requirements coverage check to plan-validation gate ([3b1dd516](https://github.com/SienkLogic/plan-build-run/commit/3b1dd516))
* Wire plan-check gate into validate-task and skill prompts ([d24569d5](https://github.com/SienkLogic/plan-build-run/commit/d24569d5))
* Add plan-validation gate module with TDD tests ([75b887b9](https://github.com/SienkLogic/plan-build-run/commit/75b887b9))
* Remove duplicate _buildPhaseManifest declaration in canonical phase.js ([c130604a](https://github.com/SienkLogic/plan-build-run/commit/c130604a))
* Add missing exports to canonical phase.js, create graph-cli.js, wire graph/spec in pbr-tools.js ([5ecd82b7](https://github.com/SienkLogic/plan-build-run/commit/5ecd82b7))
* Preserve fresh claude-code context data in bridge file ([419cc508](https://github.com/SienkLogic/plan-build-run/commit/419cc508))
* Add intel refresh signal detection to SessionStart briefing ([7d719b78](https://github.com/SienkLogic/plan-build-run/commit/7d719b78))
* Replace intel queue discard with signal file at session end ([9ae49264](https://github.com/SienkLogic/plan-build-run/commit/9ae49264))
* Reconcile remaining divergent modules with .cjs supersets ([37b02e8e](https://github.com/SienkLogic/plan-build-run/commit/37b02e8e))
* Create superset config.js and core.js modules with all exports ([6f58ad6f](https://github.com/SienkLogic/plan-build-run/commit/6f58ad6f))
* Unify plugins/pbr/scripts/ as canonical source with hooks/ content ([a3167823](https://github.com/SienkLogic/plan-build-run/commit/a3167823))
* Migrate 39 .cjs modules to .js in plugins/pbr/scripts/lib/ ([3a06b68e](https://github.com/SienkLogic/plan-build-run/commit/3a06b68e))
* Consolidate hooks-only files into canonical plugins/pbr/scripts/ location ([c7c2596f](https://github.com/SienkLogic/plan-build-run/commit/c7c2596f))
* Show full milestone version and name in statusline completion display ([4c04da55](https://github.com/SienkLogic/plan-build-run/commit/4c04da55))
* Improve statusline milestone-complete display — show version, hide stale phase/plan ([e75e0178](https://github.com/SienkLogic/plan-build-run/commit/e75e0178))
* Sync status-line.js from plugin — remove dead local-llm import, fix config test assertions ([04e38322](https://github.com/SienkLogic/plan-build-run/commit/04e38322))

### Plugin

* Register list-phase-assumptions command at both paths ([2a3d9977](https://github.com/SienkLogic/plan-build-run/commit/2a3d9977))

### Skills

* Improve scan skill and codebase-mapper agent ([2cc570c6](https://github.com/SienkLogic/plan-build-run/commit/2cc570c6))
* Add CLI-driven help system with structured skill metadata ([cd1550f3](https://github.com/SienkLogic/plan-build-run/commit/cd1550f3))
* Add .active-skill lifecycle and milestone Skill() routing to autonomous mode ([8a0838da](https://github.com/SienkLogic/plan-build-run/commit/8a0838da))
* Remove plan-checking skip-logic, update validation gate to advisory for quick depth ([113e0285](https://github.com/SienkLogic/plan-build-run/commit/113e0285))
* Add plan-check gates to autonomous skill pipeline ([ae9f1283](https://github.com/SienkLogic/plan-build-run/commit/ae9f1283))
* Restore PROJECT.md evolution step lost in legacy workflow migration ([822a1658](https://github.com/SienkLogic/plan-build-run/commit/822a1658))
* Create list-phase-assumptions skill with 5-area assumption analysis ([f5050b86](https://github.com/SienkLogic/plan-build-run/commit/f5050b86))

### Templates

* Add VALIDATION.md.tmpl for Nyquist validation strategy ([4ae0cea2](https://github.com/SienkLogic/plan-build-run/commit/4ae0cea2))
* Add SEED.md.tmpl for project seed/idea tracking ([a54d1a63](https://github.com/SienkLogic/plan-build-run/commit/a54d1a63))
* Add DEBUG.md.tmpl for debug session tracking ([355c2556](https://github.com/SienkLogic/plan-build-run/commit/355c2556))
* Add UAT.md.tmpl for user acceptance testing tracking ([711a2aa9](https://github.com/SienkLogic/plan-build-run/commit/711a2aa9))

### Testing

* Update 14 tests for legacy directory deletion ([14a22bed](https://github.com/SienkLogic/plan-build-run/commit/14a22bed))
* Fix 10 test files for canonical module behavioral differences ([1ed2e42e](https://github.com/SienkLogic/plan-build-run/commit/1ed2e42e))
* Update event-logger tests for canonical dated-filename behavior ([931207d2](https://github.com/SienkLogic/plan-build-run/commit/931207d2))
* Increase hook-server createServer test timeout to 15s for Windows Node 18 CI ([04602d26](https://github.com/SienkLogic/plan-build-run/commit/04602d26))

### Other

* Add advisory prompt injection scanner for .planning/ file writes ([cebc1703](https://github.com/SienkLogic/plan-build-run/commit/cebc1703))
* Implement compound CLI commands for atomic phase/milestone operations ([d75feff9](https://github.com/SienkLogic/plan-build-run/commit/d75feff9))
* Register missing CLI subcommands and fix broken references across 18 files ([ed681fa9](https://github.com/SienkLogic/plan-build-run/commit/ed681fa9))

## [2.15.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.14.0...plan-build-run-v2.15.0) — 2026-03-20

### Plugin

* Restore plugin pbr-tools.js and add v15.0 init/completion with correct require paths ([6da71c3b](https://github.com/SienkLogic/plan-build-run/commit/6da71c3b))
* Fix routing field name mismatch and sync plugin scripts for v15.0 ([ae6d9099](https://github.com/SienkLogic/plan-build-run/commit/ae6d9099))

## [2.14.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.12.1...plan-build-run-v2.14.0) — 2026-03-20

### Agents

* Add verify command executability checks to plan-checker D8 ([9fead2be](https://github.com/SienkLogic/plan-build-run/commit/9fead2be))
* Add vertical slice anti-pattern to planner ([72beb44b](https://github.com/SienkLogic/plan-build-run/commit/72beb44b))
* Add vertical slice preference section to planner agent ([3832574d](https://github.com/SienkLogic/plan-build-run/commit/3832574d))

### CI/CD

* Add skill-sync job to verify SKILL.md copies match ([ccedb988](https://github.com/SienkLogic/plan-build-run/commit/ccedb988))

### CLI Tools

* Handle gitignored release-please-manifest in release script ([efdb2f8e](https://github.com/SienkLogic/plan-build-run/commit/efdb2f8e))
* Register init continue/milestone/begin/status in dispatcher with tests ([c084435f](https://github.com/SienkLogic/plan-build-run/commit/c084435f))
* Add initContinue, initMilestone, initBegin, initStatus compound init commands ([95f6feeb](https://github.com/SienkLogic/plan-build-run/commit/95f6feeb))
* Register 5 compound completion commands in pbr-tools dispatcher ([07685f4d](https://github.com/SienkLogic/plan-build-run/commit/07685f4d))
* Use correct findPhaseInternal return fields (directory, not rel/slug) ([5f3e79fa](https://github.com/SienkLogic/plan-build-run/commit/5f3e79fa))
* Sync enhanced suggest-next to hooks/lib and plugins/pbr/scripts/lib ([dda60e33](https://github.com/SienkLogic/plan-build-run/commit/dda60e33))
* Add completion.cjs with 5 compound completion commands ([9d754f5c](https://github.com/SienkLogic/plan-build-run/commit/9d754f5c))
* Add plan validate command for combined spot-check + structure validation ([911bc1c1](https://github.com/SienkLogic/plan-build-run/commit/911bc1c1))
* Add status-based routing, config-aware built routing, and milestone detection to suggest-next ([f9a20b68](https://github.com/SienkLogic/plan-build-run/commit/f9a20b68))
* Limit syncStateFrontmatter to stateReconcile only — prevent auto-overwrite on individual writes ([ea9f9866](https://github.com/SienkLogic/plan-build-run/commit/ea9f9866))
* Add syncStateFrontmatter and STATUS_VALUES enum for drift-proof STATE.md ([7552a0c9](https://github.com/SienkLogic/plan-build-run/commit/7552a0c9))

### Hooks

* Register track-user-gates hook and update schema tests for HTTP type ([b2435e21](https://github.com/SienkLogic/plan-build-run/commit/b2435e21))
* Register track-user-gates PostToolUse hook for AskUserQuestion ([1049cdb5](https://github.com/SienkLogic/plan-build-run/commit/1049cdb5))
* Re-apply HTTP type entries for advisory PostToolUse hooks (reverted by sync) ([24dda96f](https://github.com/SienkLogic/plan-build-run/commit/24dda96f))
* Sync enforce-context-budget to plugin hooks.json (integration audit finding) ([5a37ee9e](https://github.com/SienkLogic/plan-build-run/commit/5a37ee9e))
* Config-driven gate enforcement with AskUserQuestion validation (phase 67) ([6306b4db](https://github.com/SienkLogic/plan-build-run/commit/6306b4db))
* Migrate advisory PostToolUse hooks to native HTTP type (phase 66) ([d15f201b](https://github.com/SienkLogic/plan-build-run/commit/d15f201b))
* Audit infrastructure fixes — latency, false positives, source tags (phase 61) ([74a6bce1](https://github.com/SienkLogic/plan-build-run/commit/74a6bce1))
* Harden lockedFileUpdate with last-resort write fallback ([f0aeba3b](https://github.com/SienkLogic/plan-build-run/commit/f0aeba3b))
* Mandatory verifier enforcement + statusline parser fix (phases 57.1-57.2) ([04e2ea61](https://github.com/SienkLogic/plan-build-run/commit/04e2ea61))
* Quick reliability wins — async hooks, stdin timeouts, config caching, version stamps (phase 57) ([8138e5ef](https://github.com/SienkLogic/plan-build-run/commit/8138e5ef))

### Skills

* Individual agent spawn pattern for colored badges (phase 65) ([6b8bc055](https://github.com/SienkLogic/plan-build-run/commit/6b8bc055))
* Behavioral fixes — inline debug prevention, audit self-exclusion, regression gate, hook audit (phase 62) ([0556d475](https://github.com/SienkLogic/plan-build-run/commit/0556d475))
* Autonomous CI verification, ROADMAP reconciliation, context budget enforcement (phase 60) ([caa3e7f0](https://github.com/SienkLogic/plan-build-run/commit/caa3e7f0))
* AskUserQuestion enforcement — CRITICAL markers, tracking hook, continue fix (phase 58) ([fc23ef6b](https://github.com/SienkLogic/plan-build-run/commit/fc23ef6b))
* Session metrics completion and CLAUDE.md rules update (phases 55-56) ([0443e4b9](https://github.com/SienkLogic/plan-build-run/commit/0443e4b9))

### Testing

* Update hooks-lib-suggest-next test for validate-phase default routing ([e4416428](https://github.com/SienkLogic/plan-build-run/commit/e4416428))
* Handle null exitCode in pre-bash-dispatch git-staged tests on macOS CI ([96001cd8](https://github.com/SienkLogic/plan-build-run/commit/96001cd8))

### Other

* Phase 54 squash merge ([780949e5](https://github.com/SienkLogic/plan-build-run/commit/780949e5))
* Phase 52 squash merge ([ad2cb6a6](https://github.com/SienkLogic/plan-build-run/commit/ad2cb6a6))
* Phase 51 squash merge ([0cb8de73](https://github.com/SienkLogic/plan-build-run/commit/0cb8de73))
* Phase 50 squash merge ([a2b8a165](https://github.com/SienkLogic/plan-build-run/commit/a2b8a165))
* Add key_files_imported check to confidence gate ([e639aac0](https://github.com/SienkLogic/plan-build-run/commit/e639aac0))
* Phase 49 squash merge ([40735ef6](https://github.com/SienkLogic/plan-build-run/commit/40735ef6))
* Phase 48 squash merge ([011931ad](https://github.com/SienkLogic/plan-build-run/commit/011931ad))
* Phase 47 squash merge ([2d665923](https://github.com/SienkLogic/plan-build-run/commit/2d665923))
* Phase 46 squash merge ([5056ebc0](https://github.com/SienkLogic/plan-build-run/commit/5056ebc0))
* Phase 45 squash merge ([7a775c5a](https://github.com/SienkLogic/plan-build-run/commit/7a775c5a))
* Phase 44 squash merge ([c08f1924](https://github.com/SienkLogic/plan-build-run/commit/c08f1924))
* Phase 43 squash merge ([412c1972](https://github.com/SienkLogic/plan-build-run/commit/412c1972))
* Phase 42 squash merge ([8772826c](https://github.com/SienkLogic/plan-build-run/commit/8772826c))
* Phase 41 squash merge ([75bc794b](https://github.com/SienkLogic/plan-build-run/commit/75bc794b))

## [2.12.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.11.0...plan-build-run-v2.12.0) — 2026-03-19

### CI/CD

* Remove npm run validate from release workflow (script was removed in Phase 32) ([e0378d74](https://github.com/SienkLogic/plan-build-run/commit/e0378d74))
* Fix MD025 lint error and skip git-dependent tests on Windows ([8e2773e8](https://github.com/SienkLogic/plan-build-run/commit/8e2773e8))

### CLI Tools

* Wire ci-fix command into pbr-tools.js dispatcher ([36b985cc](https://github.com/SienkLogic/plan-build-run/commit/36b985cc))
* Add ci-fix-loop module with Jest/ESLint parsing and auto-fix loop ([91de02f8](https://github.com/SienkLogic/plan-build-run/commit/91de02f8))
* Add auto-cleanup subcommand to pbr-tools.js dispatcher ([5b7ca819](https://github.com/SienkLogic/plan-build-run/commit/5b7ca819))
* Add auto-cleanup library with matchScore, autoCloseTodos, autoArchiveNotes ([7a57d4bc](https://github.com/SienkLogic/plan-build-run/commit/7a57d4bc))
* Wire quick-status subcommand into pbr-tools.js dispatcher ([9b3bcaf2](https://github.com/SienkLogic/plan-build-run/commit/9b3bcaf2))
* Add quick-status.js lightweight status snapshot script ([96cc4772](https://github.com/SienkLogic/plan-build-run/commit/96cc4772))
* Add idle-state reset to stateReconcile for post-milestone cleanup ([00a46ff8](https://github.com/SienkLogic/plan-build-run/commit/00a46ff8))

### Dashboard

* Wire --stop flag into CLI ([a94b5789](https://github.com/SienkLogic/plan-build-run/commit/a94b5789))
* Add cross-platform stopDashboard module ([4a86464e](https://github.com/SienkLogic/plan-build-run/commit/4a86464e))

### Hooks

* Wire pre-commit quality checks into bash dispatch pipeline ([329d3c60](https://github.com/SienkLogic/plan-build-run/commit/329d3c60))
* Add pre-commit quality gate check functions ([d0609851](https://github.com/SienkLogic/plan-build-run/commit/d0609851))
* Add session-cleanup to DIRECT_FALLBACK_SCRIPTS in hook-server-client.js ([245aec35](https://github.com/SienkLogic/plan-build-run/commit/245aec35))
* Add .context-tracker removal to session-cleanup.js ([286e4f2c](https://github.com/SienkLogic/plan-build-run/commit/286e4f2c))
* Wire notification throttle into hook-server.js response path ([950ef737](https://github.com/SienkLogic/plan-build-run/commit/950ef737))
* Wire notification throttle into log-notification.js ([3c2cd558](https://github.com/SienkLogic/plan-build-run/commit/3c2cd558))
* Add notification throttle module with time-window deduplication ([a6641c80](https://github.com/SienkLogic/plan-build-run/commit/a6641c80))
* Ensure logHook source field cannot be overridden by details spread ([7a50b8e9](https://github.com/SienkLogic/plan-build-run/commit/7a50b8e9))
* Add MSYS path bridging for PBR_PROJECT_ROOT in pbr-tools.js and run-hook.js ([9019f0ae](https://github.com/SienkLogic/plan-build-run/commit/9019f0ae))
* Rename ambiguous duration_ms to agent_duration_ms in task-completed logs ([386a119a](https://github.com/SienkLogic/plan-build-run/commit/386a119a))
* Downgrade check-plan-format blocks to warnings for Write tool operations ([18912b3d](https://github.com/SienkLogic/plan-build-run/commit/18912b3d))

### Plugin

* Fix comma-separated allowed-tools and remove stale duplicate ([ec808e71](https://github.com/SienkLogic/plan-build-run/commit/ec808e71))

## [2.11.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.10.0...plan-build-run-v2.11.0) — 2026-03-19

### Agents

* Add count-accuracy note to intel-updater for Glob-derived component counts ([497afa70](https://github.com/SienkLogic/plan-build-run/commit/497afa70))

### CLI Tools

* Fix release script Windows compatibility (head -1, /dev/null) ([bbded916](https://github.com/SienkLogic/plan-build-run/commit/bbded916))
* Wire incidents subcommand into pbr-tools.cjs dispatcher ([c12f3719](https://github.com/SienkLogic/plan-build-run/commit/c12f3719))
* Create incidents.cjs library with record/list/query/summary operations ([2c63e7d6](https://github.com/SienkLogic/plan-build-run/commit/2c63e7d6))
* Harden roadmap.cjs for v9+ 3-column progress table format ([2bb9aa31](https://github.com/SienkLogic/plan-build-run/commit/2bb9aa31))
* Add state reconcile command to re-derive phase counts from ROADMAP.md ([ba0187ed](https://github.com/SienkLogic/plan-build-run/commit/ba0187ed))

### Hooks

* Fix module paths and hook names after Phase 14 refactoring ([d71b5126](https://github.com/SienkLogic/plan-build-run/commit/d71b5126))
* Sync check-subagent-output.js from plugins/pbr/scripts/ copy ([39bcf1b5](https://github.com/SienkLogic/plan-build-run/commit/39bcf1b5))
* Add source field to logHook entries for audit traceability ([ad4e243a](https://github.com/SienkLogic/plan-build-run/commit/ad4e243a))
* Update skill count assertion to 37 for new validate skill ([a170b001](https://github.com/SienkLogic/plan-build-run/commit/a170b001))
* Replace nyquist-auditor no-op stub with VALIDATION.md check ([7f4a7822](https://github.com/SienkLogic/plan-build-run/commit/7f4a7822))
* Close v11.0 audit gaps — incident_journal config default, test-cache relocation, checkpoint_auto_resolve wiring, notification throttling ([1f97bfff](https://github.com/SienkLogic/plan-build-run/commit/1f97bfff))
* Wire incident recording into pre-bash-dispatch, post-write-dispatch, and log-tool-failure ([3c15879d](https://github.com/SienkLogic/plan-build-run/commit/3c15879d))
* Add record-incident.js shared hook helper for incident journal ([6b51bda6](https://github.com/SienkLogic/plan-build-run/commit/6b51bda6))
* Add test result cache module with 60s TTL ([4058838d](https://github.com/SienkLogic/plan-build-run/commit/4058838d))
* Add autonomous.max_retries and autonomous.error_strategy to CONFIG_DEFAULTS ([e0a85ee2](https://github.com/SienkLogic/plan-build-run/commit/e0a85ee2))
* Update build-dependency gate to skip speculative dependency phases ([01c3a7f0](https://github.com/SienkLogic/plan-build-run/commit/01c3a7f0))
* Add isPlanSpeculative helper and update build-executor gate for speculative/empty dirs ([ea587513](https://github.com/SienkLogic/plan-build-run/commit/ea587513))
* Wire checkDirectStateWrite into post-write-dispatch.js ([31b19276](https://github.com/SienkLogic/plan-build-run/commit/31b19276))
* Add checkDirectStateWrite advisory hook for STATE.md and ROADMAP.md bypass detection ([704b92cc](https://github.com/SienkLogic/plan-build-run/commit/704b92cc))
* Wire session_id into log-subagent.js logHook and logEvent calls ([f3261cdf](https://github.com/SienkLogic/plan-build-run/commit/f3261cdf))
* Add .context-tracker and .active-agent cleanup to session-cleanup.js ([2b72a80e](https://github.com/SienkLogic/plan-build-run/commit/2b72a80e))
* Update .active-agent readers for session-scoped path with global fallback ([bfa38392](https://github.com/SienkLogic/plan-build-run/commit/bfa38392))
* Add session_id support to logHook() and logEvent() for multi-session debugging ([a947b868](https://github.com/SienkLogic/plan-build-run/commit/a947b868))
* Session-scope .active-agent writes in log-subagent.js ([3e569968](https://github.com/SienkLogic/plan-build-run/commit/3e569968))
* Make stateAdvancePlan() atomic with single lockedFileUpdate call ([545f7aad](https://github.com/SienkLogic/plan-build-run/commit/545f7aad))
* Wrap configWrite() with lockedFileUpdate for crash-safe concurrent writes ([4611cbaf](https://github.com/SienkLogic/plan-build-run/commit/4611cbaf))
* IH-09 dispatch chain uses kebab-case script names from hook logs ([226c3935](https://github.com/SienkLogic/plan-build-run/commit/226c3935))

### Plugin

* Add validate-phase command registration ([d8dedd35](https://github.com/SienkLogic/plan-build-run/commit/d8dedd35))

### Skills

* Add MILESTONE.md auto-generation to milestone new and autonomous skills ([99e0c4e4](https://github.com/SienkLogic/plan-build-run/commit/99e0c4e4))
* Sync plan-build-run/ copies after Phase 29 CRITICAL marker pass ([33af4964](https://github.com/SienkLogic/plan-build-run/commit/33af4964))
* Consolidate pre-build dependency checking in build Step 1 ([a34aba4a](https://github.com/SienkLogic/plan-build-run/commit/a34aba4a))
* Add NEXT UP routing block to ship skill ([638ee6ac](https://github.com/SienkLogic/plan-build-run/commit/638ee6ac))
* Add /pbr:intel to scan and begin NEXT UP routing blocks ([0feb2739](https://github.com/SienkLogic/plan-build-run/commit/0feb2739))
* Add /pbr:autonomous suggestion to status routing when 2+ phases pending ([0d469d2b](https://github.com/SienkLogic/plan-build-run/commit/0d469d2b))
* Add /pbr:release suggestion to milestone complete NEXT UP block ([fe52ebfd](https://github.com/SienkLogic/plan-build-run/commit/fe52ebfd))
* Add /pbr:test advisory suggestion to continue built-status routing ([9075fe10](https://github.com/SienkLogic/plan-build-run/commit/9075fe10))
* Add /pbr:ship and /pbr:ui-review conditional suggestions to build NEXT UP ([672b65b1](https://github.com/SienkLogic/plan-build-run/commit/672b65b1))
* Wire roadmapper agent into begin skill Step 8 ([27f186ec](https://github.com/SienkLogic/plan-build-run/commit/27f186ec))
* Sync plan-build-run/ copies after Phase 26 quality gate wiring ([0b7fc4df](https://github.com/SienkLogic/plan-build-run/commit/0b7fc4df))
* Add validate-phase routing to build skill NEXT UP block ([db90ce36](https://github.com/SienkLogic/plan-build-run/commit/db90ce36))
* Add validate-phase NL routing and static fallback to do skill ([349f33e5](https://github.com/SienkLogic/plan-build-run/commit/349f33e5))
* Route built status to validate-phase in status skill ([66f22428](https://github.com/SienkLogic/plan-build-run/commit/66f22428))
* Insert validate-phase step 3d-pre into autonomous skill ([2a8ffa05](https://github.com/SienkLogic/plan-build-run/commit/2a8ffa05))
* Add validate-phase suggestion to test NEXT UP and config toggle ([c57749b6](https://github.com/SienkLogic/plan-build-run/commit/c57749b6))
* Route built status to validate-phase in continue skill ([83da9172](https://github.com/SienkLogic/plan-build-run/commit/83da9172))
* Fix validate-phase skill directory naming and sync, update test counts ([817b62a5](https://github.com/SienkLogic/plan-build-run/commit/817b62a5))
* Create /pbr:validate-phase skill with nyquist-auditor integration ([886a5fbe](https://github.com/SienkLogic/plan-build-run/commit/886a5fbe))
* Wire test result caching into autonomous Step 3d verification ([04690e88](https://github.com/SienkLogic/plan-build-run/commit/04690e88))
* Add autonomous state detection to resume skill ([33505ee8](https://github.com/SienkLogic/plan-build-run/commit/33505ee8))
* Add git branch creation to autonomous Step 3e and expand .autonomous-state.json schema ([bc7f9b0c](https://github.com/SienkLogic/plan-build-run/commit/bc7f9b0c))
* Add discuss auto-skip and error metrics to autonomous state schema ([83e1bfc5](https://github.com/SienkLogic/plan-build-run/commit/83e1bfc5))
* Add error classification and graduated retry loop to autonomous Step 3c ([14a12c7c](https://github.com/SienkLogic/plan-build-run/commit/14a12c7c))
* Pass --speculative flag in autonomous skill speculative Task() prompt ([1502ebd5](https://github.com/SienkLogic/plan-build-run/commit/1502ebd5))
* Add checkpoint manifest re-init after speculative plan swap in autonomous mode ([b08ee23e](https://github.com/SienkLogic/plan-build-run/commit/b08ee23e))
* Add --speculative flag guards to plan skill .active-skill and STATE.md writes ([9c40acb2](https://github.com/SienkLogic/plan-build-run/commit/9c40acb2))
* Sync plan-build-run/ copies of modified SKILL.md files ([94b6e35c](https://github.com/SienkLogic/plan-build-run/commit/94b6e35c))
* Add state reconcile step to milestone post-archival cleanup ([09b13ca9](https://github.com/SienkLogic/plan-build-run/commit/09b13ca9))
* Update help with 9 missing skills and fix AGENT_TO_SKILL wiring ([b38ad2f3](https://github.com/SienkLogic/plan-build-run/commit/b38ad2f3))
* Correct MILESTONE-AUDIT template path in milestone skill ([63eebda7](https://github.com/SienkLogic/plan-build-run/commit/63eebda7))

### Testing

* Mock child_process.spawn in dashboard-launch test to prevent orphaned processes in CI ([78817954](https://github.com/SienkLogic/plan-build-run/commit/78817954))
* Mock net.createConnection in dashboard-launch test for CI compatibility ([09ed381a](https://github.com/SienkLogic/plan-build-run/commit/09ed381a))
* Avoid network call in dashboard-launch test for CI compatibility ([15bc04f8](https://github.com/SienkLogic/plan-build-run/commit/15bc04f8))
* Fix lint errors in new test files (duplicate keys, empty blocks) ([13506354](https://github.com/SienkLogic/plan-build-run/commit/13506354))
* Update gate tests for speculative planning (empty dirs now allowed) ([930a82c8](https://github.com/SienkLogic/plan-build-run/commit/930a82c8))
* IH-10 excludes test-sourced entries from source tag analysis ([747cf848](https://github.com/SienkLogic/plan-build-run/commit/747cf848))
* EF-01 single-source counting with rate cap, EF-05 test entry filter ([56a66e08](https://github.com/SienkLogic/plan-build-run/commit/56a66e08))

### Other

* Add null config guards to FV-05 and FV-06 feature verification checks ([8ac294b3](https://github.com/SienkLogic/plan-build-run/commit/8ac294b3))
* Separate enforcement blocks from tool failures in EF-01 counting ([9c5cdda5](https://github.com/SienkLogic/plan-build-run/commit/9c5cdda5))

## [2.10.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.9.0...plan-build-run-v2.10.0) — 2026-03-18

### Agents

* Upgrade audit agent with dimension categories and per-dimension scoring ([5a886ac8](https://github.com/SienkLogic/plan-build-run/commit/5a886ac8))
* Implement EF-02 agent failure/timeout detection ([56f51d27](https://github.com/SienkLogic/plan-build-run/commit/56f51d27))
* Add SI-04 agent type refs and SI-05 completion marker contract checks with proximity heuristic ([e82eeef7](https://github.com/SienkLogic/plan-build-run/commit/e82eeef7))

### CI/CD

* Add BC-09 enforce-PBR-workflow advisory tracking check ([824bbc1a](https://github.com/SienkLogic/plan-build-run/commit/824bbc1a))
* Add CI verification and compaction quality checks (WC-01, WC-07) ([4a904e9f](https://github.com/SienkLogic/plan-build-run/commit/4a904e9f))
* Add ci section, git.auto_pr, and expand status_line.sections enum to 8 values ([6ba1b9e4](https://github.com/SienkLogic/plan-build-run/commit/6ba1b9e4))

### CLI Tools

* Add STATE.md integrity and frontmatter checks (WC-02, WC-03) ([8040edd0](https://github.com/SienkLogic/plan-build-run/commit/8040edd0))

### Configuration

* Restore .planning/ to gitignore ([40d0ba66](https://github.com/SienkLogic/plan-build-run/commit/40d0ba66))
* Sync config-schema.json copies and autonomous skill after speculative planner changes ([ed74d7c6](https://github.com/SienkLogic/plan-build-run/commit/ed74d7c6))
* Add speculative_depth property to config schema and config.json ([12ca6a9a](https://github.com/SienkLogic/plan-build-run/commit/12ca6a9a))
* Add audit section to config-schema.json and sync to bin copy ([648c7cb2](https://github.com/SienkLogic/plan-build-run/commit/648c7cb2))
* Lower global coverage thresholds to match actual after status-line additions ([c6af4520](https://github.com/SienkLogic/plan-build-run/commit/c6af4520))

### Context Management

* Add BC-10 unmanaged commit detection and BC-11 context delegation threshold ([a0f319db](https://github.com/SienkLogic/plan-build-run/commit/a0f319db))

### Hooks

* Wire all 8 audit category modules into index.js dispatch ([adf7b4b8](https://github.com/SienkLogic/plan-build-run/commit/adf7b4b8))
* Implement EF-03 hook false positive and EF-04 hook false negative analysis ([15b788b0](https://github.com/SienkLogic/plan-build-run/commit/15b788b0))
* Add IH-09 dispatch chain, IH-10 log separation, runAllInfraChecks aggregate ([8138be15](https://github.com/SienkLogic/plan-build-run/commit/8138be15))
* Add IH-03 hook perf, IH-07 log rotation, IH-08 disk usage checks ([8204fb65](https://github.com/SienkLogic/plan-build-run/commit/8204fb65))
* Add infrastructure check module with hook server and dashboard health checks (IH-01, IH-02) ([d473836f](https://github.com/SienkLogic/plan-build-run/commit/d473836f))
* Implement agent and hook checks SI-06 through SI-09 ([377d08a7](https://github.com/SienkLogic/plan-build-run/commit/377d08a7))
* Read coverage from coverage-final.json (33%) instead of stale coverage-summary.json (13%) ([9153cb13](https://github.com/SienkLogic/plan-build-run/commit/9153cb13))
* Coverage reader prefers bin/lib aggregate (75%) over global total (13%) ([777eeecb](https://github.com/SienkLogic/plan-build-run/commit/777eeecb))
* Add test/CI writers and fix coverage reader for dev status line ([208bcb69](https://github.com/SienkLogic/plan-build-run/commit/208bcb69))
* Add dev line to status bar with version, skills, hooks, coverage, tests, CI, todos, quick tasks ([e37a0f7f](https://github.com/SienkLogic/plan-build-run/commit/e37a0f7f))
* Status line null phases, stale context tier, hook server indicator ([0b91df0b](https://github.com/SienkLogic/plan-build-run/commit/0b91df0b))

### Plugin

* Fix researcher Write tool, autonomous Task tool, and milestone template path ([fd930215](https://github.com/SienkLogic/plan-build-run/commit/fd930215))

### Skills

* Upgrade audit skill with programmatic checks, report v2, and verbosity control ([b3945e46](https://github.com/SienkLogic/plan-build-run/commit/b3945e46))
* Add BC-12 skill self-read prevention detection ([a2b40276](https://github.com/SienkLogic/plan-build-run/commit/a2b40276))
* Add behavioral-compliance module with JSONL helpers and BC-01 skill sequence check ([b1885ae6](https://github.com/SienkLogic/plan-build-run/commit/b1885ae6))
* Sync autonomous SKILL.md to plan-build-run copy ([d25471e4](https://github.com/SienkLogic/plan-build-run/commit/d25471e4))
* Add speculative plan skip logic and completion stats to autonomous mode ([aa22a720](https://github.com/SienkLogic/plan-build-run/commit/aa22a720))
* Add staleness detection and re-planning for speculative plans ([9518ce08](https://github.com/SienkLogic/plan-build-run/commit/9518ce08))
* Add speculative planner dispatch during build in autonomous mode ([e7f13bd8](https://github.com/SienkLogic/plan-build-run/commit/e7f13bd8))
* Implement SI-01 through SI-03 skill reference validation checks ([9072a3f3](https://github.com/SienkLogic/plan-build-run/commit/9072a3f3))
* Add --preset/--dimension/--skip/--only CLI flags and dimension resolution to audit SKILL.md ([33c0787c](https://github.com/SienkLogic/plan-build-run/commit/33c0787c))
* Auto-run npm release on milestone complete, fix release tag detection ([a9d59314](https://github.com/SienkLogic/plan-build-run/commit/a9d59314))

### Testing

* Add WC-09 commit pattern validation and WC-12 test health baseline checks ([57194cd5](https://github.com/SienkLogic/plan-build-run/commit/57194cd5))

### Other

* Wire BC-13,14,15 and SQ-07,08,09,10 into index.js check maps ([d5dc1304](https://github.com/SienkLogic/plan-build-run/commit/d5dc1304))
* Implement SQ-07, SQ-08, SQ-09, SQ-10 audit check functions ([08ef1eaa](https://github.com/SienkLogic/plan-build-run/commit/08ef1eaa))
* Implement BC-13, BC-14, BC-15 audit check functions ([d9b12456](https://github.com/SienkLogic/plan-build-run/commit/d9b12456))
* Upgrade index.js to aggregate SI, IH, FV, QM check modules with unified runAllChecks() ([c1fb077c](https://github.com/SienkLogic/plan-build-run/commit/c1fb077c))
* Add QM-05 self-validation and runAllQualityMetricChecks aggregator ([f9afdc64](https://github.com/SienkLogic/plan-build-run/commit/f9afdc64))
* Add baseline comparison check QM-03 ([e6f4b79f](https://github.com/SienkLogic/plan-build-run/commit/e6f4b79f))
* Add error correlation check across audit dimensions (QM-04) ([acb2bc3f](https://github.com/SienkLogic/plan-build-run/commit/acb2bc3f))
* Add quality-metrics module with session degradation and throughput checks (QM-01, QM-02) ([0ca3b75b](https://github.com/SienkLogic/plan-build-run/commit/0ca3b75b))
* Add FV-13 meta-check and wire FV_CHECKS map into index.js ([28c230d2](https://github.com/SienkLogic/plan-build-run/commit/28c230d2))
* Add FV-08 through FV-12 check functions ([88299b38](https://github.com/SienkLogic/plan-build-run/commit/88299b38))
* Add feature-verification.js with helpers and FV-01 through FV-03 ([5e57912e](https://github.com/SienkLogic/plan-build-run/commit/5e57912e))
* Add SQ-04 routing, SQ-05 memory tracking, SQ-06 convention monitoring ([043fa179](https://github.com/SienkLogic/plan-build-run/commit/043fa179))
* Implement SQ-03 session duration and cost analysis ([8206bff5](https://github.com/SienkLogic/plan-build-run/commit/8206bff5))
* Implement SQ-02 briefing freshness and size check ([ba281c14](https://github.com/SienkLogic/plan-build-run/commit/ba281c14))
* Implement SQ-01 session start quality check with shared JSONL helpers ([d3db066a](https://github.com/SienkLogic/plan-build-run/commit/d3db066a))
* Add BC-07 CRITICAL marker compliance and BC-08 gate compliance checks ([1c714792](https://github.com/SienkLogic/plan-build-run/commit/1c714792))
* Add BC-06 artifact creation order check ([5872359a](https://github.com/SienkLogic/plan-build-run/commit/5872359a))
* Add BC-04 post-condition verification and BC-05 orchestrator budget discipline ([48324dba](https://github.com/SienkLogic/plan-build-run/commit/48324dba))
* Add BC-02 state machine transitions and BC-03 pre-condition verification ([5135cb38](https://github.com/SienkLogic/plan-build-run/commit/5135cb38))
* Add model selection and git branching compliance checks (WC-10, WC-11) ([4575cb0f](https://github.com/SienkLogic/plan-build-run/commit/4575cb0f))
* Add WC-05 artifact completeness and WC-06 format validation checks ([6d741f3d](https://github.com/SienkLogic/plan-build-run/commit/6d741f3d))
* Add ROADMAP sync and naming convention checks (WC-04, WC-08) ([742674fa](https://github.com/SienkLogic/plan-build-run/commit/742674fa))
* Implement EF-07 session cleanup verification with all 7 EF checks exported ([8a8ccee1](https://github.com/SienkLogic/plan-build-run/commit/8a8ccee1))
* Implement EF-06 cross-session interference detection with stale file checks ([dd24a1a1](https://github.com/SienkLogic/plan-build-run/commit/dd24a1a1))
* Implement EF-05 retry/repetition pattern detection ([f1090c70](https://github.com/SienkLogic/plan-build-run/commit/f1090c70))
* Implement EF-01 tool failure rate analysis with shared JSONL helpers ([3442c193](https://github.com/SienkLogic/plan-build-run/commit/3442c193))
* Add stale file, plugin cache, and config schema checks (IH-04, IH-05, IH-06) ([81ed02e6](https://github.com/SienkLogic/plan-build-run/commit/81ed02e6))
* Implement command, config, and version checks SI-10 through SI-12 ([eb8a1933](https://github.com/SienkLogic/plan-build-run/commit/eb8a1933))
* Create SI checks index module with all 15 dimensions ([814570ad](https://github.com/SienkLogic/plan-build-run/commit/814570ad))
* Implement cross-cutting SI checks (SI-13, SI-14, SI-15) ([8747ed37](https://github.com/SienkLogic/plan-build-run/commit/8747ed37))
* Deduplicate --only dimension resolution to handle code+slug aliases ([60c4d26b](https://github.com/SienkLogic/plan-build-run/commit/60c4d26b))
* Implement resolveDimensions() and explainResolution() in audit-dimensions.js ([a114bc61](https://github.com/SienkLogic/plan-build-run/commit/a114bc61))
* Create audit dimension registry with 88 dimensions across 9 categories ([ee179a65](https://github.com/SienkLogic/plan-build-run/commit/ee179a65))

## [2.9.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.8.0...plan-build-run-v2.9.0) — 2026-03-18

### Agents

* Add Knowledge Capture write instructions to executor, verifier, debugger ([cea3e587](https://github.com/SienkLogic/plan-build-run/commit/cea3e587))
* Add KNOWLEDGE.md to files_to_read for all 10 agents ([d3723794](https://github.com/SienkLogic/plan-build-run/commit/d3723794))
* Integrate node-repair reference and repair loop into executor ([30bdfa07](https://github.com/SienkLogic/plan-build-run/commit/30bdfa07))
* Add deviation taxonomy, fix plans, and DISCOVERY.md references to agents ([a21978eb](https://github.com/SienkLogic/plan-build-run/commit/a21978eb))
* Update executor/verifier for 13-state model and building/built status ([a64e88a5](https://github.com/SienkLogic/plan-build-run/commit/a64e88a5))
* Update planner Mode 4 fallback format with PBR-aligned ROADMAP fields ([0b9e5f09](https://github.com/SienkLogic/plan-build-run/commit/0b9e5f09))
* Update roadmapper output format for PBR-aligned ROADMAP fields ([0b3efdea](https://github.com/SienkLogic/plan-build-run/commit/0b3efdea))

### CI/CD

* Replace release-please with component-grouped changelog system ([73457e14](https://github.com/SienkLogic/plan-build-run/commit/73457e14))
* Regenerate from correct tag ranges, removing duplicate entries ([dd996cff](https://github.com/SienkLogic/plan-build-run/commit/dd996cff))

### CLI Tools

* Replace non-existent writeStateMd import in verify.cjs, sync config-schema.json ([94caea14](https://github.com/SienkLogic/plan-build-run/commit/94caea14))
* Guard Progress table parser against sections without actual tables ([5c7e6bc7](https://github.com/SienkLogic/plan-build-run/commit/5c7e6bc7))
* Add loadGlobalDefaults and saveGlobalDefaults for cross-project defaults ([991156d7](https://github.com/SienkLogic/plan-build-run/commit/991156d7))
* Add WAITING.json signal functions to state.cjs ([65a56e9b](https://github.com/SienkLogic/plan-build-run/commit/65a56e9b))
* Add RETROSPECTIVE.md generation, ROADMAP details-collapse, and milestone index to cmdMilestoneComplete ([97172728](https://github.com/SienkLogic/plan-build-run/commit/97172728))
* Add velocity metrics and session continuity to state.cjs ([4cf6b330](https://github.com/SienkLogic/plan-build-run/commit/4cf6b330))
* Merge PBR + PBR status values into unified 13-state lifecycle ([8c27154f](https://github.com/SienkLogic/plan-build-run/commit/8c27154f))
* Update roadmap.cjs for PBR-aligned format with dynamic column detection and details-tag support ([1b820cbc](https://github.com/SienkLogic/plan-build-run/commit/1b820cbc))

### Configuration

* Add extended_context to config reference and model profiles docs ([8677fb03](https://github.com/SienkLogic/plan-build-run/commit/8677fb03))

### Context Management

* Bridge real context data from status-line to .context-budget.json ([886e2649](https://github.com/SienkLogic/plan-build-run/commit/886e2649))

### Dashboard

* Add velocity/session parsing, update status labels to 13-state model ([dc2d7d1f](https://github.com/SienkLogic/plan-build-run/commit/dc2d7d1f))
* Update planning reader for <details> milestones and phase Requirements/Success Criteria ([af65b4bd](https://github.com/SienkLogic/plan-build-run/commit/af65b4bd))

### Documentation

* Add node-repair.md reference for task failure taxonomy ([c725c78f](https://github.com/SienkLogic/plan-build-run/commit/c725c78f))
* Add deviation taxonomy reference format to deviation-rules.md ([4e9ce6e4](https://github.com/SienkLogic/plan-build-run/commit/4e9ce6e4))

### Hooks

* Refocus milestone-learnings.js to aggregate into project-scoped KNOWLEDGE.md ([7556560c](https://github.com/SienkLogic/plan-build-run/commit/7556560c))
* Add seed trigger checking after executor phase completion ([9e7c4b46](https://github.com/SienkLogic/plan-build-run/commit/9e7c4b46))
* Add SessionStart awareness sweep for seeds, deferred, tech debt, research, knowledge ([56c8c1a3](https://github.com/SienkLogic/plan-build-run/commit/56c8c1a3))
* Detect WAITING.json and HANDOFF.json at SessionStart ([cfc2c450](https://github.com/SienkLogic/plan-build-run/commit/cfc2c450))
* Read 3 days of logs and classify rare-event hooks in checkHookCoverage ([d097dfca](https://github.com/SienkLogic/plan-build-run/commit/d097dfca))
* Add entry/skip/complete logging to 3 remaining hooks ([3e21eebd](https://github.com/SienkLogic/plan-build-run/commit/3e21eebd))
* Add checkHookCoverage to health-checks cross-referencing hooks.json vs logs ([2f93ae55](https://github.com/SienkLogic/plan-build-run/commit/2f93ae55))
* Add source field and PBR_LOG_DIR support to hook-logger ([8bb5d140](https://github.com/SienkLogic/plan-build-run/commit/8bb5d140))
* Remove noisy velocity/session absence warnings, sync build SKILL.md ([1a10dc77](https://github.com/SienkLogic/plan-build-run/commit/1a10dc77))
* Add deviation review check to check-subagent-output ([8b4d649e](https://github.com/SienkLogic/plan-build-run/commit/8b4d649e))
* Add deviations and fix_plans validation to check-plan-format ([e5c4f46d](https://github.com/SienkLogic/plan-build-run/commit/e5c4f46d))
* Add readCurrentStatus and VALID_PHASE_STATUSES to gate helpers ([c9f91734](https://github.com/SienkLogic/plan-build-run/commit/c9f91734))
* Add session continuity frontmatter reading and expanded stale status detection ([c2ed2307](https://github.com/SienkLogic/plan-build-run/commit/c2ed2307))
* Update smart-next-task status routing for 13-state lifecycle ([ae549f02](https://github.com/SienkLogic/plan-build-run/commit/ae549f02))
* Use STATUS_LABELS for display and expand status ordering in check-state-sync.js ([e9e017be](https://github.com/SienkLogic/plan-build-run/commit/e9e017be))
* Add 13-state lifecycle validation to validateState() in check-plan-format.js ([72785d54](https://github.com/SienkLogic/plan-build-run/commit/72785d54))
* Add dynamic column detection and details-tag stripping to progress-tracker.js ([fd9234ac](https://github.com/SienkLogic/plan-build-run/commit/fd9234ac))
* Strip HTML details/summary tags in check-roadmap-sync.js for collapsed milestones ([479b6db0](https://github.com/SienkLogic/plan-build-run/commit/479b6db0))
* Add dynamic column detection to updateProgressTable in check-state-sync.js ([cefa54eb](https://github.com/SienkLogic/plan-build-run/commit/cefa54eb))
* Update validateRoadmap and validateContext for PBR-aligned ROADMAP format ([045a3d01](https://github.com/SienkLogic/plan-build-run/commit/045a3d01))
* Replace static port 19871 with dynamic allocation in hook-server.test.js ([4886f286](https://github.com/SienkLogic/plan-build-run/commit/4886f286))
* Report actual bound port in hook-server ready signal ([c22390bf](https://github.com/SienkLogic/plan-build-run/commit/c22390bf))
* Add CONFIG_DEFAULTS and configEnsureComplete for auto-population ([dda3f8bb](https://github.com/SienkLogic/plan-build-run/commit/dda3f8bb))
* Surface hook errors via additionalContext instead of silent exit ([ae7330a0](https://github.com/SienkLogic/plan-build-run/commit/ae7330a0))
* Fix clearRootCache import to use hooks path instead of plugins path ([364c92e9](https://github.com/SienkLogic/plan-build-run/commit/364c92e9))

### Skills

* Add KNOWLEDGE.md to begin init, milestone aggregation, and executor context ([2b8b5a2c](https://github.com/SienkLogic/plan-build-run/commit/2b8b5a2c))
* Add KNOWLEDGE.md to context-loader-task.md briefing files ([950953a4](https://github.com/SienkLogic/plan-build-run/commit/950953a4))
* Wire extended_context gates into build, review, scan, and plan skills ([122a2aa6](https://github.com/SienkLogic/plan-build-run/commit/122a2aa6))
* Add --prd express path to plan skill for PRD-driven planning ([87a0df8a](https://github.com/SienkLogic/plan-build-run/commit/87a0df8a))
* Add /pbr:session-report skill for post-session summaries ([dc90c6d2](https://github.com/SienkLogic/plan-build-run/commit/dc90c6d2))
* Add /pbr:ship skill for PR creation from planning artifacts ([c3fc12a4](https://github.com/SienkLogic/plan-build-run/commit/c3fc12a4))
* Add UAT gap intake path to debug skill ([0e67aa92](https://github.com/SienkLogic/plan-build-run/commit/0e67aa92))
* Add node repair reference and ESCALATE handling to build skill ([b4740565](https://github.com/SienkLogic/plan-build-run/commit/b4740565))
* Add HANDOFF.json and WAITING.json support to resume skill ([ba1a7b22](https://github.com/SienkLogic/plan-build-run/commit/ba1a7b22))
* Add HANDOFF.json creation to pause skill ([146bd7f9](https://github.com/SienkLogic/plan-build-run/commit/146bd7f9))
* Add deviation-rules reference to build, fix plan review to review ([7d0b7762](https://github.com/SienkLogic/plan-build-run/commit/7d0b7762))
* Add PROJECT.md evolution review to milestone, update begin for new format ([20762452](https://github.com/SienkLogic/plan-build-run/commit/20762452))
* Add session continuity fields to pause/resume skills ([ea8c27ac](https://github.com/SienkLogic/plan-build-run/commit/ea8c27ac))
* Update status and continue skills for 13-state model and velocity display ([4fe1067a](https://github.com/SienkLogic/plan-build-run/commit/4fe1067a))
* Update plan/build/review/discuss for new ROADMAP format and CONTEXT.md sections ([44d8e6fe](https://github.com/SienkLogic/plan-build-run/commit/44d8e6fe))
* Update begin skill and roadmap prompt for Requirements/Success Criteria fields ([56366b30](https://github.com/SienkLogic/plan-build-run/commit/56366b30))
* Update milestone complete to use <details> collapse and milestone index ([40598b26](https://github.com/SienkLogic/plan-build-run/commit/40598b26))
* Add npm release prompt to milestone complete workflow ([3f8c2290](https://github.com/SienkLogic/plan-build-run/commit/3f8c2290))

### Templates

* Add KNOWLEDGE.md.tmpl for project knowledge capture ([e30ff512](https://github.com/SienkLogic/plan-build-run/commit/e30ff512))
* Add extended_context to config schema, defaults, and template ([6b9c9361](https://github.com/SienkLogic/plan-build-run/commit/6b9c9361))
* Add UAT.md.tmpl for user acceptance testing ([7fc0a09b](https://github.com/SienkLogic/plan-build-run/commit/7fc0a09b))
* Add HANDOFF.json.tmpl for session pause/resume state ([f50eaf68](https://github.com/SienkLogic/plan-build-run/commit/f50eaf68))
* Add MILESTONE-AUDIT.md.tmpl with structured YAML scores ([643437b3](https://github.com/SienkLogic/plan-build-run/commit/643437b3))
* Add RETROSPECTIVE.md.tmpl for cross-milestone trends ([46fbcab8](https://github.com/SienkLogic/plan-build-run/commit/46fbcab8))
* Create DISCOVERY.md template with Don't Hand-Roll section ([3340d9b1](https://github.com/SienkLogic/plan-build-run/commit/3340d9b1))
* Add fix plan generation and gap severity to VERIFICATION template ([085cdaa6](https://github.com/SienkLogic/plan-build-run/commit/085cdaa6))
* Add deviation taxonomy and requirements_completed to SUMMARY templates ([e9ca0ff8](https://github.com/SienkLogic/plan-build-run/commit/e9ca0ff8))
* Add PBR evolution protocol and lifecycle sections to PROJECT.md ([d7fc03e9](https://github.com/SienkLogic/plan-build-run/commit/d7fc03e9))
* Add Specific References and Code Patterns sections to project-CONTEXT.md.tmpl ([6962a0f7](https://github.com/SienkLogic/plan-build-run/commit/6962a0f7))
* Add specifics and code_context sections to CONTEXT.md.tmpl ([8ca7dffd](https://github.com/SienkLogic/plan-build-run/commit/8ca7dffd))
* Update ROADMAP.md.tmpl with PBR-aligned format ([b0710bc6](https://github.com/SienkLogic/plan-build-run/commit/b0710bc6))

### Testing

* Use hooks.jsonl path matching getHookHealthSummary implementation ([b4edd282](https://github.com/SienkLogic/plan-build-run/commit/b4edd282))
* Add extended_context to schema test and sync mirror files ([51c6201c](https://github.com/SienkLogic/plan-build-run/commit/51c6201c))
* Update health-checks count to accommodate new checkHookCoverage check ([fe278bd8](https://github.com/SienkLogic/plan-build-run/commit/fe278bd8))
* Resolve macOS symlink in helpers.js and helpers.test.js (/var -> /private/var) ([03231a26](https://github.com/SienkLogic/plan-build-run/commit/03231a26))
* Replace static ports 19872-19874 with dynamic allocation in state-enrichment.test.js ([d9ce2b3b](https://github.com/SienkLogic/plan-build-run/commit/d9ce2b3b))
* Add temp directory cleanup to 7 test files that leaked mkdtempSync dirs ([c9e48a07](https://github.com/SienkLogic/plan-build-run/commit/c9e48a07))

### Other

* Wire extended_context into begin and setup profile presets ([abfd2a37](https://github.com/SienkLogic/plan-build-run/commit/abfd2a37))
* Add entry-point and skip-reason logging to post-bash-triage.js ([3c295a89](https://github.com/SienkLogic/plan-build-run/commit/3c295a89))
* Add entry-point and skip-reason logging to graph-update.js ([7ca8c9eb](https://github.com/SienkLogic/plan-build-run/commit/7ca8c9eb))
* Commit daily log file refactor — dated filenames, append-only, 30-day retention ([61345577](https://github.com/SienkLogic/plan-build-run/commit/61345577))

## [2.8.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.7.0...plan-build-run-v2.8.0) — 2026-03-18

### Agents

* Add post-execution verifier integration for --full flag ([53099336](https://github.com/SienkLogic/plan-build-run/commit/53099336))
* Add plan-checker integration for --full flag in quick SKILL.md ([a2618d28](https://github.com/SienkLogic/plan-build-run/commit/a2618d28))
* Add consistent files_to_read context passing to both executor paths ([f4152c8f](https://github.com/SienkLogic/plan-build-run/commit/f4152c8f))
* Pass CONTEXT.md to verifier in review skill files_to_read ([bc7eb48e](https://github.com/SienkLogic/plan-build-run/commit/bc7eb48e))
* Enhance verifier Step 7b with REQ-ID deliverable cross-checking and untraced detection ([2128e24b](https://github.com/SienkLogic/plan-build-run/commit/2128e24b))
* Add phase goals to executor prompt template ([d138e049](https://github.com/SienkLogic/plan-build-run/commit/d138e049))
* Add read_first, acceptance_criteria, node repair, and paralysis guard to executor agent ([9ea2ccca](https://github.com/SienkLogic/plan-build-run/commit/9ea2ccca))
* Update planner agent to generate read_first and acceptance_criteria ([b625023e](https://github.com/SienkLogic/plan-build-run/commit/b625023e))
* Refine plan-checker agent to 9 dimensions with structured YAML output ([32c795db](https://github.com/SienkLogic/plan-build-run/commit/32c795db))
* Update tests for RH-01 agent output changes and sync plan-build-run copies ([53ca648d](https://github.com/SienkLogic/plan-build-run/commit/53ca648d))
* Update agent-contracts.md implements field and VERIFICATION.md frontmatter ([e64f7abc](https://github.com/SienkLogic/plan-build-run/commit/e64f7abc))
* Update executor-prompt.md.tmpl CONTEXT.md references to PROJECT.md ([1d1d7053](https://github.com/SienkLogic/plan-build-run/commit/1d1d7053))

### CI/CD

* Prefix unused variables in test files to resolve ESLint warnings ([9ead0690](https://github.com/SienkLogic/plan-build-run/commit/9ead0690))
* Add workflow.node_repair_budget config validation ([137f2a4d](https://github.com/SienkLogic/plan-build-run/commit/137f2a4d))

### CLI Tools

* Add auto-repair to initResume via stateRederive on drift ([636d189f](https://github.com/SienkLogic/plan-build-run/commit/636d189f))
* Add detectDrift helper and drift field to init commands ([853410dd](https://github.com/SienkLogic/plan-build-run/commit/853410dd))
* Wire statePhaseComplete and stateRederive into pbr-tools.cjs dispatcher ([b826ce33](https://github.com/SienkLogic/plan-build-run/commit/b826ce33))
* Implement stateRederive with drift detection and atomic correction ([8b0f7275](https://github.com/SienkLogic/plan-build-run/commit/8b0f7275))
* Implement statePhaseComplete with atomic lockedFileUpdate ([8b84d3b3](https://github.com/SienkLogic/plan-build-run/commit/8b84d3b3))

### Hooks

* Resolve macOS symlink in resolve-root test (/var -> /private/var) ([8a163798](https://github.com/SienkLogic/plan-build-run/commit/8a163798))
* Prefix unused variables in hooks/ source files with underscore ([ee270c28](https://github.com/SienkLogic/plan-build-run/commit/ee270c28))
* Add validateContext and SUMMARY metrics warnings to check-plan-format ([8fb4ab00](https://github.com/SienkLogic/plan-build-run/commit/8fb4ab00))
* Add completion marker and Self-Check section validation to check-subagent-output ([4d5da4f8](https://github.com/SienkLogic/plan-build-run/commit/4d5da4f8))
* Add read_first and acceptance_criteria validation to check-plan-format hook ([5b25a0ff](https://github.com/SienkLogic/plan-build-run/commit/5b25a0ff))
* Migrate auto-continue from signal file to config flag with backward compat ([03d62a7f](https://github.com/SienkLogic/plan-build-run/commit/03d62a7f))
* Add mtime-based dirty flag detection to check-state-sync ([d2070554](https://github.com/SienkLogic/plan-build-run/commit/d2070554))
* Wire resolveProjectRoot into hook-logger getLogPath for correct root discovery ([1e923d77](https://github.com/SienkLogic/plan-build-run/commit/1e923d77))
* Switch hook-logger to append-only writes with appendFileSync ([f68568ea](https://github.com/SienkLogic/plan-build-run/commit/f68568ea))
* Add fail-open telemetry to validate-task.js catch block ([e26d54aa](https://github.com/SienkLogic/plan-build-run/commit/e26d54aa))
* Sync git-integration.md commit types with validate-commit.js ([f67182c0](https://github.com/SienkLogic/plan-build-run/commit/f67182c0))
* Update 4 agent expectedFile entries in check-subagent-output.js ([6b51eae2](https://github.com/SienkLogic/plan-build-run/commit/6b51eae2))

### Plugin

* Elevate universal anti-patterns to plugin-level CLAUDE.md ([f059b3cc](https://github.com/SienkLogic/plan-build-run/commit/f059b3cc))

### Skills

* Update tests for new validation rules and sync SKILL.md copies ([ebc312b9](https://github.com/SienkLogic/plan-build-run/commit/ebc312b9))
* Add velocity metrics display to status SKILL.md ([f26715e6](https://github.com/SienkLogic/plan-build-run/commit/f26715e6))
* Add velocity metrics writing to build SKILL.md after phase completion ([f8098eda](https://github.com/SienkLogic/plan-build-run/commit/f8098eda))
* Enhance build SKILL.md with type-specific checkpoint routing UX ([6f731389](https://github.com/SienkLogic/plan-build-run/commit/6f731389))
* Update resume skill to parse XML sections with backward compat ([8628e0c1](https://github.com/SienkLogic/plan-build-run/commit/8628e0c1))
* Add commit-planning-docs.md references to 6 skills that write .planning/ files ([8681742f](https://github.com/SienkLogic/plan-build-run/commit/8681742f))
* Add error-reporting.md references to 14 skills with error exit paths ([f7af2cab](https://github.com/SienkLogic/plan-build-run/commit/f7af2cab))
* Add commit-planning-docs reference to config, setup, and profile skills ([04f6b2c2](https://github.com/SienkLogic/plan-build-run/commit/04f6b2c2))
* Add 6 standard patterns to test skill (active-skill, state, commit, files_to_read, error, gate) ([9de69156](https://github.com/SienkLogic/plan-build-run/commit/9de69156))
* Instrument discuss skill with 6 missing patterns ([4d2faf27](https://github.com/SienkLogic/plan-build-run/commit/4d2faf27))
* Add deferred items forward path to plan skill from prior phase SUMMARY and CONTEXT.md ([7bd7a7a0](https://github.com/SienkLogic/plan-build-run/commit/7bd7a7a0))
* Add branded invocation banners to ui-phase and ui-review skills ([e9bc9236](https://github.com/SienkLogic/plan-build-run/commit/e9bc9236))
* Add branded invocation banners to profile-user and quick skills ([265acf15](https://github.com/SienkLogic/plan-build-run/commit/265acf15))
* Add branded invocation banners to autonomous, do, and intel skills ([12816ab6](https://github.com/SienkLogic/plan-build-run/commit/12816ab6))
* Replace stale skill names and dead link in shared fragments ([83ae3954](https://github.com/SienkLogic/plan-build-run/commit/83ae3954))
* Add ROADMAP.md backup step before destructive archival in milestone skill ([8fc48f6c](https://github.com/SienkLogic/plan-build-run/commit/8fc48f6c))
* Correct broken ${CLAUDE_PLUGIN_ROOT} syntax in ui-phase and ui-review skills ([ba2d666a](https://github.com/SienkLogic/plan-build-run/commit/ba2d666a))

### Templates

* Rewrite continue-here.md.tmpl with structured XML sections ([57fb91bb](https://github.com/SienkLogic/plan-build-run/commit/57fb91bb))
* Update CONTEXT.md template with 4 XML-style sections (domain, decisions, canonical_refs, deferred) ([85ab253e](https://github.com/SienkLogic/plan-build-run/commit/85ab253e))

### Other

* Redefine composable flags with --discuss, --research, --full semantics ([0d3d78f7](https://github.com/SienkLogic/plan-build-run/commit/0d3d78f7))
* Lower STATE.md advisory cap from 150 to 100 lines ([59e1cba1](https://github.com/SienkLogic/plan-build-run/commit/59e1cba1))
* Wire YAML-based issue passing into revision loop with early-exit on stall ([d6f7a65f](https://github.com/SienkLogic/plan-build-run/commit/d6f7a65f))
* Add must_haves sub-field validation for truths, artifacts, key_links ([df686325](https://github.com/SienkLogic/plan-build-run/commit/df686325))
* Add canonical field validation for type, depends_on, files_modified, autonomous ([b9c6ff60](https://github.com/SienkLogic/plan-build-run/commit/b9c6ff60))
* Refactor processEvent to run all checks independently with collect-and-merge ([213c40a3](https://github.com/SienkLogic/plan-build-run/commit/213c40a3))
* Implement verify-and-retry TOCTOU protection in incrementTracker ([fb91464d](https://github.com/SienkLogic/plan-build-run/commit/fb91464d))
* Add logHook error telemetry to all 3 dispatcher catch blocks ([528b1ce1](https://github.com/SienkLogic/plan-build-run/commit/528b1ce1))
* Create resolveProjectRoot utility with walk-up discovery and caching ([e13fbeec](https://github.com/SienkLogic/plan-build-run/commit/e13fbeec))
* Rewrite validateConfig() with top-level depth and exhaustive knownKeys ([604fbb79](https://github.com/SienkLogic/plan-build-run/commit/604fbb79))
* Remove HISTORY.md archival section, rewrite for STATE.md History ([a702fcbd](https://github.com/SienkLogic/plan-build-run/commit/a702fcbd))
* Replace stale CONTEXT.md and HISTORY.md refs in context-loader-task.md ([8b5a9b28](https://github.com/SienkLogic/plan-build-run/commit/8b5a9b28))

## [2.7.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.6.0...plan-build-run-v2.7.0) — 2026-03-18

### CI/CD

* Clean up coverage collection and fix plugin count test ([4189b37f](https://github.com/SienkLogic/plan-build-run/commit/4189b37f))
* Lower branch coverage threshold to 62% (was 68%, actual 63.5%) ([30857c83](https://github.com/SienkLogic/plan-build-run/commit/30857c83))
* Exclude hooks/lib and hooks/local-llm from coverage collection ([6ed6ed4f](https://github.com/SienkLogic/plan-build-run/commit/6ed6ed4f))

### Context Management

* Context quality scoring module with scoreContext, getQualityReport, writeQualityReport ([6bd91ac1](https://github.com/SienkLogic/plan-build-run/commit/6bd91ac1))

### Hooks

* Wire skip-RAG into SessionStart briefing, sync hooks/ copies with quality scoring ([45ab1561](https://github.com/SienkLogic/plan-build-run/commit/45ab1561))
* Orchestrator budget scaling in suggest-compact, quality scoring in track-context-budget ([5d2a056f](https://github.com/SienkLogic/plan-build-run/commit/5d2a056f))

### Other

* Implement buildEnhancedBriefing with config toggle, audit logging, and structured output ([6f37f340](https://github.com/SienkLogic/plan-build-run/commit/6f37f340))
* Add feature_status and orchestrator_budget_pct validation to health check ([aacdd9c1](https://github.com/SienkLogic/plan-build-run/commit/aacdd9c1))
* Add 5 Phase 1 config properties to both schema copies ([acf65930](https://github.com/SienkLogic/plan-build-run/commit/acf65930))

## [2.6.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.5.0...plan-build-run-v2.6.0) — 2026-03-17

### Agents

* Reference memory-capture.md in 4 skills after agent completion ([0072d887](https://github.com/SienkLogic/plan-build-run/commit/0072d887))
* Add memory_suggestion protocol to 4 agents and shared fragment ([e39e2bbe](https://github.com/SienkLogic/plan-build-run/commit/e39e2bbe))
* Enable project memory for 6 decision-making agents (verifier, audit, plan-checker, integration-checker, general, researcher) ([bec02f29](https://github.com/SienkLogic/plan-build-run/commit/bec02f29))

### CI/CD

* Convert indented code blocks to fenced in 4 agent files (MD046) ([7b5e3a5a](https://github.com/SienkLogic/plan-build-run/commit/7b5e3a5a))

### Hooks

* Add comprehensive artifact validation gates and compliance tracking ([1d70fd35](https://github.com/SienkLogic/plan-build-run/commit/1d70fd35))
* Emit valid stdout in PreToolUse catch blocks instead of silent exit ([8ee7ffed](https://github.com/SienkLogic/plan-build-run/commit/8ee7ffed))
* Wire intel-queue hook, fix require path, update invocation schema ([54bc528b](https://github.com/SienkLogic/plan-build-run/commit/54bc528b))
* Wire PostCompact event in hooks.json ([2542a378](https://github.com/SienkLogic/plan-build-run/commit/2542a378))
* Create post-compact.js hook scripts for context recovery after compaction ([1fca720d](https://github.com/SienkLogic/plan-build-run/commit/1fca720d))

### Skills

* Improve status render routing, milestone parsing, and SKILL.md enforcement ([1ee590d1](https://github.com/SienkLogic/plan-build-run/commit/1ee590d1))
* Fix intel skill banner and config gate — use PBR branding, avoid Bash for config check, replace $HOME paths ([13b56801](https://github.com/SienkLogic/plan-build-run/commit/13b56801))

### Testing

* Add PostCompact to valid events, update doc-sprawl for allow output ([a94fb09e](https://github.com/SienkLogic/plan-build-run/commit/a94fb09e))

### Other

* PBR 2.0 Acceleration Framework (v5.0) — 16 phases, 67 plans (#96) ([414b87fa](https://github.com/SienkLogic/plan-build-run/commit/414b87fa))
* Handle YAML null string in suggest-next checkpoint check ([e7ee9ec3](https://github.com/SienkLogic/plan-build-run/commit/e7ee9ec3))
* Add verify spot-check CLI for plan/summary/verification/quick output validation ([81b80e3c](https://github.com/SienkLogic/plan-build-run/commit/81b80e3c))
* Add suggest-next CLI for deterministic routing across status/continue/resume ([c444d363](https://github.com/SienkLogic/plan-build-run/commit/c444d363))
* Add parse-args and status fingerprint CLI commands for input validation and state tracking ([5f3e83e2](https://github.com/SienkLogic/plan-build-run/commit/5f3e83e2))
* Add quick init and slug-generate CLI commands to prevent directory creation failures ([385f3f9d](https://github.com/SienkLogic/plan-build-run/commit/385f3f9d))
* Add deterministic status render CLI command for consistent progress output ([0e0f2970](https://github.com/SienkLogic/plan-build-run/commit/0e0f2970))
* Add worktree.sparse_paths config property to both schema files ([a60381f1](https://github.com/SienkLogic/plan-build-run/commit/a60381f1))
* Add intel patch-meta CLI command for accurate JSON timestamps ([b7e81656](https://github.com/SienkLogic/plan-build-run/commit/b7e81656))
* Add intel CLI subcommands (snapshot, validate, extract-exports) ([12f1be88](https://github.com/SienkLogic/plan-build-run/commit/12f1be88))

## [2.5.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.4.0...plan-build-run-v2.5.0) — 2026-03-17

### Agents

* Create pbr:ui-checker agent with 6-dimension scoring rubric ([0eff7049](https://github.com/SienkLogic/plan-build-run/commit/0eff7049))
* Create pbr:ui-researcher agent with Claude in Chrome MCP tools ([2a3c727f](https://github.com/SienkLogic/plan-build-run/commit/2a3c727f))
* Wire cross-project copy into executor and milestone-learnings ([be0445a6](https://github.com/SienkLogic/plan-build-run/commit/be0445a6))
* Create intel-updater agent definition ([b1dafb99](https://github.com/SienkLogic/plan-build-run/commit/b1dafb99))
* Add --audit flag to plan skill and planner self-validation Step 6b ([26ccbe62](https://github.com/SienkLogic/plan-build-run/commit/26ccbe62))
* Add inline execution bypass to build-executor gate ([bb96398c](https://github.com/SienkLogic/plan-build-run/commit/bb96398c))
* Add LEARNINGS.md reading instructions to planner agent (Step 1) ([a1cd851b](https://github.com/SienkLogic/plan-build-run/commit/a1cd851b))
* Add LEARNINGS.md writing instructions to executor agent (Step 3b) ([db20c608](https://github.com/SienkLogic/plan-build-run/commit/db20c608))

### CI/CD

* Add blank line before closing tag in ui-checker and ui-researcher agents ([730e3e56](https://github.com/SienkLogic/plan-build-run/commit/730e3e56))
* Auto-clean release PR body to strip internal phase scopes ([9535aa7f](https://github.com/SienkLogic/plan-build-run/commit/9535aa7f))

### CLI Tools

* Wire copy-global and query-global CLI commands in pbr-tools dispatchers ([9da1fe28](https://github.com/SienkLogic/plan-build-run/commit/9da1fe28))
* Add copyToGlobal and queryGlobal to learnings modules ([6e4fc4a3](https://github.com/SienkLogic/plan-build-run/commit/6e4fc4a3))
* Add cross_project config and LEARNINGS.md validation ([520b3030](https://github.com/SienkLogic/plan-build-run/commit/520b3030))
* Wire intel subcommands into pbr-tools.cjs dispatcher ([f8345867](https://github.com/SienkLogic/plan-build-run/commit/f8345867))

### Configuration

* Add ui.enabled config property to config-schema.json ([eb2b792c](https://github.com/SienkLogic/plan-build-run/commit/eb2b792c))
* Add 17 new config properties to config-schema.json ([d6e91418](https://github.com/SienkLogic/plan-build-run/commit/d6e91418))

### Context Management

* Add buildCompositionAdvice() for composition-aware compact suggestions ([d7b4b826](https://github.com/SienkLogic/plan-build-run/commit/d7b4b826))

### Hooks

* Address 5 audit findings — verification, logging, active-skill, status-line ([6f2a2206](https://github.com/SienkLogic/plan-build-run/commit/6f2a2206))
* Fix remaining require paths in hooks/ copies ([7caeac79](https://github.com/SienkLogic/plan-build-run/commit/7caeac79))
* Restore correct require paths in hooks/ copies ([51813db6](https://github.com/SienkLogic/plan-build-run/commit/51813db6))
* Sync config-schema.json and check-plan-format.js copies ([7d0f312c](https://github.com/SienkLogic/plan-build-run/commit/7d0f312c))
* Correct intel.cjs require path in plugins/ progress-tracker ([eee39941](https://github.com/SienkLogic/plan-build-run/commit/eee39941))
* Wire intel queue into PostToolUse dispatch chain ([2c5d8cea](https://github.com/SienkLogic/plan-build-run/commit/2c5d8cea))
* Update suggest-compact.js to use adaptive thresholds from getEffectiveThresholds ([8527646c](https://github.com/SienkLogic/plan-build-run/commit/8527646c))
* Add context ledger functions to track-context-budget.js ([539476ad](https://github.com/SienkLogic/plan-build-run/commit/539476ad))

### Plugin

* Add 18 missing command registrations and CI sync test ([76d4ab5f](https://github.com/SienkLogic/plan-build-run/commit/76d4ab5f))

### Skills

* Create /pbr:ui-review skill and command registration ([4a6c1144](https://github.com/SienkLogic/plan-build-run/commit/4a6c1144))
* Create /pbr:ui-phase skill and command registration ([4900272f](https://github.com/SienkLogic/plan-build-run/commit/4900272f))
* Create /pbr:profile-user skill with session analysis and questionnaire fallback ([c313e457](https://github.com/SienkLogic/plan-build-run/commit/c313e457))
* Add milestone branch handling to build SKILL.md Step 1 and Step 8d ([fc2a2502](https://github.com/SienkLogic/plan-build-run/commit/fc2a2502))
* Add milestone branch creation and merge logic to milestone SKILL.md ([6de017a8](https://github.com/SienkLogic/plan-build-run/commit/6de017a8))
* Add phase branch creation and merge logic to build SKILL.md ([7b5ae499](https://github.com/SienkLogic/plan-build-run/commit/7b5ae499))
* Add --through flag parsing and multi_phase config gate to plan skill ([733e92f5](https://github.com/SienkLogic/plan-build-run/commit/733e92f5))
* Add autonomous command registration and sync skill copy ([72edac73](https://github.com/SienkLogic/plan-build-run/commit/72edac73))
* Create /pbr:autonomous skill with phase chaining loop ([7ad3ddd0](https://github.com/SienkLogic/plan-build-run/commit/7ad3ddd0))
* Enhance checkpoint auto-resolve with config-driven resolution in build skill ([be60bb15](https://github.com/SienkLogic/plan-build-run/commit/be60bb15))
* Add --auto flag parsing, gate suppression, and auto-advance chaining to 5 skills ([fc173d11](https://github.com/SienkLogic/plan-build-run/commit/fc173d11))
* Create /pbr:intel skill and command registration ([7065ef9c](https://github.com/SienkLogic/plan-build-run/commit/7065ef9c))
* Add inline execution gate to build skill Step 6a ([79e81b8c](https://github.com/SienkLogic/plan-build-run/commit/79e81b8c))
* Add phase boundary clear protocol to build skill completion output ([6acf2ad7](https://github.com/SienkLogic/plan-build-run/commit/6acf2ad7))

### Templates

* Add new config sections to config.json.tmpl ([9111ce29](https://github.com/SienkLogic/plan-build-run/commit/9111ce29))

### Testing

* Update counts for new agents/skills/commands from v2.0 milestone ([c01b1812](https://github.com/SienkLogic/plan-build-run/commit/c01b1812))
* Update migrate tests for schema_version 3 ([008d42d6](https://github.com/SienkLogic/plan-build-run/commit/008d42d6))

### Other

* Add developer_profile config properties to schema ([b74d2b4f](https://github.com/SienkLogic/plan-build-run/commit/b74d2b4f))
* Add multi-phase planning loop with accumulated context and cross-phase conflict detection ([25393a1f](https://github.com/SienkLogic/plan-build-run/commit/25393a1f))
* Add speculative planning to build Step 8e and sync copies ([ca4f8d5a](https://github.com/SienkLogic/plan-build-run/commit/ca4f8d5a))
* Add confidence-gated verification skip to build Step 7 ([5894bce6](https://github.com/SienkLogic/plan-build-run/commit/5894bce6))
* Add phase replay enrichment to build Step 6d ([4de2d259](https://github.com/SienkLogic/plan-build-run/commit/4de2d259))
* Intel queue module with config gating, deduplication, and skip patterns ([deb15898](https://github.com/SienkLogic/plan-build-run/commit/deb15898))
* Add intel.cjs library module with query, status, diff, and update operations ([821df94b](https://github.com/SienkLogic/plan-build-run/commit/821df94b))
* Add inline execution decision gate module ([e153d331](https://github.com/SienkLogic/plan-build-run/commit/e153d331))
* Add getAdaptiveThresholds and getEffectiveThresholds to context-bridge ([8cabf2f7](https://github.com/SienkLogic/plan-build-run/commit/8cabf2f7))
* Add v2-to-v3 schema migration in migrate.cjs ([8060d301](https://github.com/SienkLogic/plan-build-run/commit/8060d301))
* Add scope inference and PBR rebranding to changelog cleaner ([76ce001b](https://github.com/SienkLogic/plan-build-run/commit/76ce001b))
* Add PBR-to-PBR rebranding to changelog cleaning script ([4cfaf37d](https://github.com/SienkLogic/plan-build-run/commit/4cfaf37d))

## [2.4.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.3.1...plan-build-run-v2.4.0) — 2026-03-16

### Context Management

* Add compact-first cycling, pane borders, two-line status bar, session search ([0cc3ee99](https://github.com/SienkLogic/plan-build-run/commit/0cc3ee99))

## [2.3.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.3.0...plan-build-run-v2.3.1) — 2026-03-16

### CI/CD

* Add release concurrency, npm publish guard, and Windows perf tolerance ([15df70c5](https://github.com/SienkLogic/plan-build-run/commit/15df70c5))

## [2.3.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.2.0...plan-build-run-v2.3.0) — 2026-03-16

### Skills

* Add /pbr:release skill and changelog generation to milestone complete ([a1b6207d](https://github.com/SienkLogic/plan-build-run/commit/a1b6207d))

## [2.2.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.1.1...plan-build-run-v2.2.0) — 2026-03-16

### Other

* Restore and enhance pbr-tmux with watch, multi, context-aware cycling ([d16400db](https://github.com/SienkLogic/plan-build-run/commit/d16400db))

## [2.1.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.1.0...plan-build-run-v2.1.1) — 2026-03-16

### Other

* Update validate script to use plugins/pbr/ as plugin root ([d77b233b](https://github.com/SienkLogic/plan-build-run/commit/d77b233b))

## [2.1.0](https://github.com/SienkLogic/plan-build-run/commits/plan-build-run-v2.1.0) — 2026-03-16

### Agents

* Scale synthesizer, codebase-mapper, plan-checker, integration-checker budgets for 1M ([8d37be02](https://github.com/SienkLogic/plan-build-run/commit/8d37be02))
* Scale planner, executor, debugger, verifier budgets for 1M context ([13db078a](https://github.com/SienkLogic/plan-build-run/commit/13db078a))
* Add cross-phase verification mode to verifier agent ([8b676c6f](https://github.com/SienkLogic/plan-build-run/commit/8b676c6f))
* Scale researcher cycles and output budgets for 1M context ([b2abaaf1](https://github.com/SienkLogic/plan-build-run/commit/b2abaaf1))
* Update all 14 agents with context-aware checkpoint rules ([bdbdfc43](https://github.com/SienkLogic/plan-build-run/commit/bdbdfc43))
* Standardize agent spawn types across all workflows ([ec5617c7](https://github.com/SienkLogic/plan-build-run/commit/ec5617c7))
* Add skills frontmatter and hooks examples to all agents ([cbe372a4](https://github.com/SienkLogic/plan-build-run/commit/cbe372a4))
* Extend anti-heredoc instruction to all file-writing agents ([1a1acd52](https://github.com/SienkLogic/plan-build-run/commit/1a1acd52))
* Add request_user_input mapping, multi-agent config, and agent role generation ([1455931f](https://github.com/SienkLogic/plan-build-run/commit/1455931f))
* Use $HOME instead of ~ for pbr-tools.cjs paths to prevent subagent MODULE_NOT_FOUND (#786) ([69b28eec](https://github.com/SienkLogic/plan-build-run/commit/69b28eec))
* Add analysis paralysis guard, exhaustive cross-check, and task-level TDD (#736) ([aaea14ef](https://github.com/SienkLogic/plan-build-run/commit/aaea14ef))
* Support both `.claude/skills/` and `.agents/skills/` for skill discovery (#759) ([eb1388c2](https://github.com/SienkLogic/plan-build-run/commit/eb1388c2))
* Propagate phase_req_ids from ROADMAP to workflow agents (#684) (#702) ([ea3c22d3](https://github.com/SienkLogic/plan-build-run/commit/ea3c22d3))
* Add project CLAUDE.md discovery to subagent spawn points ([8fd7d0b6](https://github.com/SienkLogic/plan-build-run/commit/8fd7d0b6))
* Add project skill discovery to subagent spawn points ([270b6c4a](https://github.com/SienkLogic/plan-build-run/commit/270b6c4a))
* Use inline Task() syntax for map-codebase agent spawning ([f77252cc](https://github.com/SienkLogic/plan-build-run/commit/f77252cc))
* Executor updates ROADMAP.md and REQUIREMENTS.md per-plan ([1764abc6](https://github.com/SienkLogic/plan-build-run/commit/1764abc6))
* Escape shell variables in agent bodies for Gemini CLI ([e449c5af](https://github.com/SienkLogic/plan-build-run/commit/e449c5af))
* Convert general-purpose subagent to OpenCode's "general" ([474b75ea](https://github.com/SienkLogic/plan-build-run/commit/474b75ea))
* Add scope boundary and fix attempt limit to executor (closes #490) ([8b75531b](https://github.com/SienkLogic/plan-build-run/commit/8b75531b))
* Use Write tool for file creation to prevent settings.local.json corruption ([c4ea3589](https://github.com/SienkLogic/plan-build-run/commit/c4ea3589))
* Return 'inherit' instead of 'opus' for model resolution (#558) ([2b9951b9](https://github.com/SienkLogic/plan-build-run/commit/2b9951b9))
* Add Write tool to pbr-verifier and document verifier bug root cause (#545) ([173ff7a0](https://github.com/SienkLogic/plan-build-run/commit/173ff7a0))
* Explicitly specify subagent_type="pbr-executor" ([42495068](https://github.com/SienkLogic/plan-build-run/commit/42495068))
* Researcher agent always writes RESEARCH.md regardless of commit_docs ([161aa611](https://github.com/SienkLogic/plan-build-run/commit/161aa611))
* Pass CONTEXT.md to all downstream agents ([32571390](https://github.com/SienkLogic/plan-build-run/commit/32571390))
* Gemini CLI agent loading errors (#347) ([5660b6fc](https://github.com/SienkLogic/plan-build-run/commit/5660b6fc))
* Use general-purpose agent for MCP-dependent subagents ([314916ba](https://github.com/SienkLogic/plan-build-run/commit/314916ba))
* Add model profiles for PBR agents ([4218f866](https://github.com/SienkLogic/plan-build-run/commit/4218f866))
* Add workflow agent settings to project init ([fbd5068b](https://github.com/SienkLogic/plan-build-run/commit/fbd5068b))
* Implement pbr-executor spawn for quick mode ([563bcdf7](https://github.com/SienkLogic/plan-build-run/commit/563bcdf7))
* Implement pbr-planner spawn for quick mode ([58bd6462](https://github.com/SienkLogic/plan-build-run/commit/58bd6462))
* Correct agent name in research-phase heading ([92b48937](https://github.com/SienkLogic/plan-build-run/commit/92b48937))
* Remove hardcoded 2025 year from search query examples ([6ad1d0a3](https://github.com/SienkLogic/plan-build-run/commit/6ad1d0a3))
* Add pbr-meta subagent for instant PBR expertise ([694bd151](https://github.com/SienkLogic/plan-build-run/commit/694bd151))
* Remove dead pbr-researcher agent references (#180) ([a6f7ff2e](https://github.com/SienkLogic/plan-build-run/commit/a6f7ff2e))
* Update agent output collection method ([fe94aaa0](https://github.com/SienkLogic/plan-build-run/commit/fe94aaa0))
* Consistent zero-padding and file naming across agents ([339e0613](https://github.com/SienkLogic/plan-build-run/commit/339e0613))
* Remove commit capability from project researcher agent ([1f8c112f](https://github.com/SienkLogic/plan-build-run/commit/1f8c112f))
* Synthesizer commits all research files together ([3ca4f0a4](https://github.com/SienkLogic/plan-build-run/commit/3ca4f0a4))
* Add pbr-research-synthesizer agent for SUMMARY.md creation ([1d155e97](https://github.com/SienkLogic/plan-build-run/commit/1d155e97))
* Integrate research into plan-phase with specialized agents ([2144960c](https://github.com/SienkLogic/plan-build-run/commit/2144960c))
* Add planner -> checker verification loop to plan-phase ([fb0ba884](https://github.com/SienkLogic/plan-build-run/commit/fb0ba884))
* Add revision_mode section to pbr-planner ([6b31a920](https://github.com/SienkLogic/plan-build-run/commit/6b31a920))
* Create pbr-plan-checker agent ([47eab1a2](https://github.com/SienkLogic/plan-build-run/commit/47eab1a2))
* Create planner-subagent-prompt.md template ([70fa2ad7](https://github.com/SienkLogic/plan-build-run/commit/70fa2ad7))
* Create pbr-planner agent file ([1f45befe](https://github.com/SienkLogic/plan-build-run/commit/1f45befe))
* Remove zombie pbr-milestone-auditor agent ([32e68cde](https://github.com/SienkLogic/plan-build-run/commit/32e68cde))
* Add dedicated codebase mapper agent ([411b5a36](https://github.com/SienkLogic/plan-build-run/commit/411b5a36))
* Add research-subagent-prompt.md template ([faaeae25](https://github.com/SienkLogic/plan-build-run/commit/faaeae25))
* Create pbr-researcher agent with research methodology ([2f8b5517](https://github.com/SienkLogic/plan-build-run/commit/2f8b5517))
* Create pbr-debugger agent with consolidated debugging expertise ([7cefaf11](https://github.com/SienkLogic/plan-build-run/commit/7cefaf11))
* Include agents folder in npm package ([d07ef333](https://github.com/SienkLogic/plan-build-run/commit/d07ef333))
* Add pbr-verifier subagent for phase goal verification ([f3f6707c](https://github.com/SienkLogic/plan-build-run/commit/f3f6707c))
* Update remaining general-purpose refs to pbr-executor ([82c522b8](https://github.com/SienkLogic/plan-build-run/commit/82c522b8))
* Add pbr-executor subagent with dedicated plan execution logic ([b2646c89](https://github.com/SienkLogic/plan-build-run/commit/b2646c89))
* Subagent isolation for investigation with checkpoint support ([00208b71](https://github.com/SienkLogic/plan-build-run/commit/00208b71))
* Replace resume with fresh continuation agents ([69300f97](https://github.com/SienkLogic/plan-build-run/commit/69300f97))
* Remove subagent-only context from orchestrator ([0dd4cedf](https://github.com/SienkLogic/plan-build-run/commit/0dd4cedf))
* Add checkpoint pause/resume for spawned agents ([72da23de](https://github.com/SienkLogic/plan-build-run/commit/72da23de))
* Add one-subagent-per-plan constraint ([b810d1dd](https://github.com/SienkLogic/plan-build-run/commit/b810d1dd))
* Add /pbr:status for parallel agent monitoring ([52ce9811](https://github.com/SienkLogic/plan-build-run/commit/52ce9811))
* Add parallel execution examples to agent-history ([cc7e0788](https://github.com/SienkLogic/plan-build-run/commit/cc7e0788))
* Update agent-history schema to v1.2 ([eaed8822](https://github.com/SienkLogic/plan-build-run/commit/eaed8822))
* Add subagent resume capability ([6ba85071](https://github.com/SienkLogic/plan-build-run/commit/6ba85071))
* Implement parallel Explore agent orchestration ([8a0dcd66](https://github.com/SienkLogic/plan-build-run/commit/8a0dcd66))
* Research subagent prompt templates ([08539ffd](https://github.com/SienkLogic/plan-build-run/commit/08539ffd))

### CI/CD

* Plan-Build-Run v2.0.0 — structured development workflow for Claude Code ([99ec00a0](https://github.com/SienkLogic/plan-build-run/commit/99ec00a0))
* Complete toPosixPath coverage for Windows output paths ([15226feb](https://github.com/SienkLogic/plan-build-run/commit/15226feb))
* Propagate coverage env in cross-platform test runner ([02a53197](https://github.com/SienkLogic/plan-build-run/commit/02a53197))
* Cross-platform test runner for Windows glob expansion ([ccb8ae1d](https://github.com/SienkLogic/plan-build-run/commit/ccb8ae1d))
* Use bash shell on Windows for glob expansion in test steps ([ffc1a2ef](https://github.com/SienkLogic/plan-build-run/commit/ffc1a2ef))
* Pin action SHAs and enforce coverage on all events ([f9fc2a3f](https://github.com/SienkLogic/plan-build-run/commit/f9fc2a3f))
* Add Node 18 skip condition for c8 v11 coverage step ([89649912](https://github.com/SienkLogic/plan-build-run/commit/89649912))
* Add c8 coverage tooling with 70% line threshold ([97d2136c](https://github.com/SienkLogic/plan-build-run/commit/97d2136c))
* Add CI status badge to README ([ad7c79aa](https://github.com/SienkLogic/plan-build-run/commit/ad7c79aa))
* Create GitHub Actions test workflow ([9aa96957](https://github.com/SienkLogic/plan-build-run/commit/9aa96957))
* Add auto-advance pipeline (--auto flag + workflow.auto_advance config) ([ed176840](https://github.com/SienkLogic/plan-build-run/commit/ed176840))
* Delegate deterministic workflow operations to pbr-tools CLI ([36f5bb3d](https://github.com/SienkLogic/plan-build-run/commit/36f5bb3d))
* Commit package-lock.json for reproducible builds ([1cf19751](https://github.com/SienkLogic/plan-build-run/commit/1cf19751))
* Add CI/CD and release automation ([a3a16be2](https://github.com/SienkLogic/plan-build-run/commit/a3a16be2))
* Add model_profile config and clarify workflow questions ([e7ceaf64](https://github.com/SienkLogic/plan-build-run/commit/e7ceaf64))
* Add /pbr:settings command for workflow toggles ([cffb3f24](https://github.com/SienkLogic/plan-build-run/commit/cffb3f24))
* Add commit_docs option to workflow preferences ([a1935c2d](https://github.com/SienkLogic/plan-build-run/commit/a1935c2d))
* Remove /pbr:research-phase from workflow suggestions ([15d4e270](https://github.com/SienkLogic/plan-build-run/commit/15d4e270))
* Add deviation rules, commit rules, and workflow references ([46cf4b11](https://github.com/SienkLogic/plan-build-run/commit/46cf4b11))
* Add read_parallelization_config step to plan-phase workflow ([8e67241e](https://github.com/SienkLogic/plan-build-run/commit/8e67241e))
* Create execute-phase.md workflow structure ([af7720c9](https://github.com/SienkLogic/plan-build-run/commit/af7720c9))
* Create verify-work workflow ([a9a9efff](https://github.com/SienkLogic/plan-build-run/commit/a9a9efff))
* Add git commit step to map-codebase workflow ([21387f8f](https://github.com/SienkLogic/plan-build-run/commit/21387f8f))
* /pbr:map-codebase command and workflow skeleton ([cfde2916](https://github.com/SienkLogic/plan-build-run/commit/cfde2916))
* /pbr:create-roadmap command with research-aware workflow ([a3c35145](https://github.com/SienkLogic/plan-build-run/commit/a3c35145))

### CLI Tools

* Add context_window_tokens to portableKeys in config.js and config.cjs ([16893262](https://github.com/SienkLogic/plan-build-run/commit/16893262))
* Support both bold and plain field formats in all state.cjs functions ([8c017034](https://github.com/SienkLogic/plan-build-run/commit/8c017034))
* Preserve multi-word commit messages in CLI router ([4155e673](https://github.com/SienkLogic/plan-build-run/commit/4155e673))
* Add YAML frontmatter sync to STATE.md for machine readability ([0ca1a59a](https://github.com/SienkLogic/plan-build-run/commit/0ca1a59a))
* Map requirements-completed frontmatter in summary-extract (#627) (#716) ([0176a3ec](https://github.com/SienkLogic/plan-build-run/commit/0176a3ec))
* Frontmatter CRUD, verification suite, template fill, state progression (#485) ([6a2d1f1b](https://github.com/SienkLogic/plan-build-run/commit/6a2d1f1b))
* Use frontmatter for categorization and wave calculation ([5c8e5dff](https://github.com/SienkLogic/plan-build-run/commit/5c8e5dff))
* Read parallelization frontmatter in execute-phase ([9fcc2a44](https://github.com/SienkLogic/plan-build-run/commit/9fcc2a44))
* Add parallelization frontmatter to write_phase_prompt ([31a77ae1](https://github.com/SienkLogic/plan-build-run/commit/31a77ae1))
* Add parallelization frontmatter to phase-prompt template ([560ef346](https://github.com/SienkLogic/plan-build-run/commit/560ef346))
* Intelligent context assembly via frontmatter dependency graph ([b26cbe69](https://github.com/SienkLogic/plan-build-run/commit/b26cbe69))
* YAML frontmatter schema with dependency graph metadata enabling automatic context assembly ([3307c05f](https://github.com/SienkLogic/plan-build-run/commit/3307c05f))

### Configuration

* Add user-level default settings via ~/.claude/defaults.json (closes #492) ([37bb14ea](https://github.com/SienkLogic/plan-build-run/commit/37bb14ea))
* Add per-agent model overrides (#510) ([a5caf919](https://github.com/SienkLogic/plan-build-run/commit/a5caf919))
* Auto-create config.json when missing (#264) ([4dff9899](https://github.com/SienkLogic/plan-build-run/commit/4dff9899))
* Split new-project to only create PROJECT.md + config.json ([5182cec7](https://github.com/SienkLogic/plan-build-run/commit/5182cec7))

### Context Management

* Scale context-bridge and lib/context thresholds from config ([8c6b6e9e](https://github.com/SienkLogic/plan-build-run/commit/8c6b6e9e))
* Scale context bar to show 100% at actual 80% limit ([87b2cd0e](https://github.com/SienkLogic/plan-build-run/commit/87b2cd0e))
* TDD features use dedicated plans for full context quality ([85f0ea5c](https://github.com/SienkLogic/plan-build-run/commit/85f0ea5c))

### Hooks

* Apply threshold scaling to hooks/ copies and fix config cache paths ([52e781c3](https://github.com/SienkLogic/plan-build-run/commit/52e781c3))
* Add allow logging to PreToolUse dispatch scripts for visibility ([b7318288](https://github.com/SienkLogic/plan-build-run/commit/b7318288))
* Scale track-context-budget and suggest-compact from config ([86fd842c](https://github.com/SienkLogic/plan-build-run/commit/86fd842c))
* Make context monitor advisory instead of imperative ([07f44cc1](https://github.com/SienkLogic/plan-build-run/commit/07f44cc1))
* Respect CLAUDE_CONFIG_DIR for custom config directories ([90e7d308](https://github.com/SienkLogic/plan-build-run/commit/90e7d308))
* Add stdin timeout guard to prevent hook errors ([7554503b](https://github.com/SienkLogic/plan-build-run/commit/7554503b))
* Correct statusline context scaling to match autocompact buffer ([59dfad97](https://github.com/SienkLogic/plan-build-run/commit/59dfad97))
* Use AfterTool instead of PostToolUse for Gemini CLI hooks ([630a705b](https://github.com/SienkLogic/plan-build-run/commit/630a705b))
* Context window monitor hook with agent-side WARNING/CRITICAL alerts ([7542d364](https://github.com/SienkLogic/plan-build-run/commit/7542d364))
* Quote config dir in hook templates for local installs (#605) ([c5fbd051](https://github.com/SienkLogic/plan-build-run/commit/c5fbd051))
* Template hook paths for OpenCode/Gemini runtimes (#585) ([9a7bb22e](https://github.com/SienkLogic/plan-build-run/commit/9a7bb22e))
* Build hooks/dist on the fly for dev installs (#413) ([e146b084](https://github.com/SienkLogic/plan-build-run/commit/e146b084))
* Add detached: true to SessionStart hook spawn for Windows ([1344bd8f](https://github.com/SienkLogic/plan-build-run/commit/1344bd8f))
* Use absolute paths for hook commands on Windows (#207) ([a1d60b71](https://github.com/SienkLogic/plan-build-run/commit/a1d60b71))
* Rename statusline.js to pbr-statusline.js for consistent hook naming ([900fc95e](https://github.com/SienkLogic/plan-build-run/commit/900fc95e))
* Simplify SessionStart hook + gitignore intel/ ([9099d484](https://github.com/SienkLogic/plan-build-run/commit/9099d484))
* Add Stop hook to prune deleted files ([fa48a13c](https://github.com/SienkLogic/plan-build-run/commit/fa48a13c))
* Make PostToolUse hook opt-in only ([f0b8afe7](https://github.com/SienkLogic/plan-build-run/commit/f0b8afe7))
* Create SessionStart context injection hook ([a3521161](https://github.com/SienkLogic/plan-build-run/commit/a3521161))
* Update check now finds VERSION in local project installs (#166) ([c033a85e](https://github.com/SienkLogic/plan-build-run/commit/c033a85e))
* Prevent console window flash on Windows (#167) ([3fb6bfbb](https://github.com/SienkLogic/plan-build-run/commit/3fb6bfbb))
* Windows hook support via Node.js conversion ([967734df](https://github.com/SienkLogic/plan-build-run/commit/967734df))
* Remove stale STATE.md from notify hook ([b0da21ba](https://github.com/SienkLogic/plan-build-run/commit/b0da21ba))
* Match STATE.md field names in notify hook ([055cc24e](https://github.com/SienkLogic/plan-build-run/commit/055cc24e))
* Add cross-platform completion notification hook ([35989f20](https://github.com/SienkLogic/plan-build-run/commit/35989f20))

### Plugin

* Remove "execution" from plan-phase description to fix autocomplete (#518) ([7ed1ec89](https://github.com/SienkLogic/plan-build-run/commit/7ed1ec89))

### Skills

* Add pre-spawn conflict detection to build skill at 1M context ([ff8a80e3](https://github.com/SienkLogic/plan-build-run/commit/ff8a80e3))
* Surface cross-phase findings in review and build skills ([f9726d26](https://github.com/SienkLogic/plan-build-run/commit/f9726d26))
* Add multi-phase lookahead to continue skill at 1M context ([089f0691](https://github.com/SienkLogic/plan-build-run/commit/089f0691))
* Update build, plan, review, explore skills with 1M read depth ([c3327a19](https://github.com/SienkLogic/plan-build-run/commit/c3327a19))
* Add context-aware read depth to shared skill fragments ([ee2b33b5](https://github.com/SienkLogic/plan-build-run/commit/ee2b33b5))
* Add missing skills frontmatter to pbr-nyquist-auditor ([73efecca](https://github.com/SienkLogic/plan-build-run/commit/73efecca))
* Use Skill instead of Task for auto-advance phase transitions ([b3e3e3dd](https://github.com/SienkLogic/plan-build-run/commit/b3e3e3dd))
* Auto-advance chain broken — Skills don't resolve inside Task subagents (#669) ([131f24b5](https://github.com/SienkLogic/plan-build-run/commit/131f24b5))
* Add codex skills-first installer runtime ([5a733dca](https://github.com/SienkLogic/plan-build-run/commit/5a733dca))

### Templates

* Add context_window_tokens to config schemas and template ([1f66e155](https://github.com/SienkLogic/plan-build-run/commit/1f66e155))
* Align resolve-model variable names with template placeholders (#737) ([b5bd9c2b](https://github.com/SienkLogic/plan-build-run/commit/b5bd9c2b))
* Add parallelization config to config.json template ([8b8b5d62](https://github.com/SienkLogic/plan-build-run/commit/8b8b5d62))
* Create UAT issues template ([654b066d](https://github.com/SienkLogic/plan-build-run/commit/654b066d))
* Restore plan-format.md - output template, not instructional content ([1609618e](https://github.com/SienkLogic/plan-build-run/commit/1609618e))
* Research-project command, workflow, and template ([c7a88a6a](https://github.com/SienkLogic/plan-build-run/commit/c7a88a6a))

### Testing

* Auto-inject cold-start smoke test for server/db phases ([40be3b05](https://github.com/SienkLogic/plan-build-run/commit/40be3b05))
* Remove MEDIUM severity test overfitting in config.test.cjs ([898b82de](https://github.com/SienkLogic/plan-build-run/commit/898b82de))
* Remove HIGH severity test overfitting in 4 test files ([c9e73e9c](https://github.com/SienkLogic/plan-build-run/commit/c9e73e9c))
* Add comprehensive validate-health test suite ([0342886e](https://github.com/SienkLogic/plan-build-run/commit/0342886e))
* Add createTempGitProject helper to tests/helpers.cjs ([339966e2](https://github.com/SienkLogic/plan-build-run/commit/339966e2))
* Add state-snapshot after test generation ([d9058210](https://github.com/SienkLogic/plan-build-run/commit/d9058210))

### Other

* Guard agent_checkpoint_pct > 50 on context_window_tokens >= 500k ([73573af8](https://github.com/SienkLogic/plan-build-run/commit/73573af8))
* Add agent_checkpoint_pct to config schema and profiles ([61e6778e](https://github.com/SienkLogic/plan-build-run/commit/61e6778e))
* Resolve @file: protocol in all INIT consumers for Windows compatibility (#841) ([517ee0dc](https://github.com/SienkLogic/plan-build-run/commit/517ee0dc))
* Add --discuss flag to /pbr:quick for lightweight pre-planning discussion (#861) ([a7c08bfb](https://github.com/SienkLogic/plan-build-run/commit/a7c08bfb))
* Harden Nyquist defaults, add retroactive validation, compress prompts (#855) ([ef032bc8](https://github.com/SienkLogic/plan-build-run/commit/ef032bc8))
* Replace $HOME/.claude paths for non-Claude runtimes ([e2b6179b](https://github.com/SienkLogic/plan-build-run/commit/e2b6179b))
* Prevent auto_advance config from persisting across sessions ([609f7f3e](https://github.com/SienkLogic/plan-build-run/commit/609f7f3e))
* Disambiguate local vs global install when CWD is HOME ([1c6f4fe1](https://github.com/SienkLogic/plan-build-run/commit/1c6f4fe1))
* Compute wave numbers for gap closure plans ([dacd0bee](https://github.com/SienkLogic/plan-build-run/commit/dacd0bee))
* Deduplicate extractField into shared helper with regex escaping ([641cdbda](https://github.com/SienkLogic/plan-build-run/commit/641cdbda))
* Deduplicate phase filter and handle empty MILESTONES.md ([8b8d1074](https://github.com/SienkLogic/plan-build-run/commit/8b8d1074))
* Escape reqId in regex patterns to prevent injection ([22fe139e](https://github.com/SienkLogic/plan-build-run/commit/22fe139e))
* Break freeform answer loop in AskUserQuestion ([b0e5717e](https://github.com/SienkLogic/plan-build-run/commit/b0e5717e))
* Derive total_phases from ROADMAP when phases lack directories ([e1b32778](https://github.com/SienkLogic/plan-build-run/commit/e1b32778))
* Scope phase counting to current milestone ([b863ed6d](https://github.com/SienkLogic/plan-build-run/commit/b863ed6d))
* Load prior context before gray area identification ([30ecb567](https://github.com/SienkLogic/plan-build-run/commit/30ecb567))
* Replace echo with printf in shell snippets to prevent jq parse errors ([4010e3ff](https://github.com/SienkLogic/plan-build-run/commit/4010e3ff))
* Detect runtime config directory instead of hardcoding .claude ([77dfd2e0](https://github.com/SienkLogic/plan-build-run/commit/77dfd2e0))
* Support both bold and plain field formats in state parsing ([78eaabc3](https://github.com/SienkLogic/plan-build-run/commit/78eaabc3))
* Prefer in-progress milestone marker in getMilestoneInfo ([81a6aaad](https://github.com/SienkLogic/plan-build-run/commit/81a6aaad))
* Add ROADMAP.md fallback to cmdPhaseComplete next-phase scan ([4e00c500](https://github.com/SienkLogic/plan-build-run/commit/4e00c500))
* Add --no-index to isGitIgnored for tracked file detection (#703) ([061dadfa](https://github.com/SienkLogic/plan-build-run/commit/061dadfa))
* Clear both cache paths after update (#663) (#664) ([19ac77e2](https://github.com/SienkLogic/plan-build-run/commit/19ac77e2))
* Statusline migration regex too broad, clobbers third-party statuslines (#670) ([dba401fe](https://github.com/SienkLogic/plan-build-run/commit/dba401fe))
* Code-aware discuss phase with codebase scouting (#727) ([37582f8f](https://github.com/SienkLogic/plan-build-run/commit/37582f8f))
* Escape regex metacharacters in stateExtractField (#741) ([ff3e2fd5](https://github.com/SienkLogic/plan-build-run/commit/ff3e2fd5))
* Load model_overrides from config and use resolveModelInternal in CLI (#739) ([31c8a91e](https://github.com/SienkLogic/plan-build-run/commit/31c8a91e))
* Load nyquist_validation from config (#740) ([93c9def0](https://github.com/SienkLogic/plan-build-run/commit/93c9def0))
* Phase-plan-index returns null/empty for files_modified, objective, task_count (#734) ([3a417522](https://github.com/SienkLogic/plan-build-run/commit/3a417522))
* Expect forward-slash paths in cmdInitTodos assertion ([011df21d](https://github.com/SienkLogic/plan-build-run/commit/011df21d))
* Cross-platform path separators, JSON quoting, and dollar signs ([9c27da02](https://github.com/SienkLogic/plan-build-run/commit/9c27da02))
* Insert MILESTONES.md entries in reverse chronological order ([732ea09f](https://github.com/SienkLogic/plan-build-run/commit/732ea09f))
* Scope stats, accomplishments, and archive to current milestone phases ([367149d0](https://github.com/SienkLogic/plan-build-run/commit/367149d0))
* GetMilestoneInfo() returns wrong version after milestone completion (#768) ([38c19466](https://github.com/SienkLogic/plan-build-run/commit/38c19466))
* Load model_overrides from config and use resolveModelInternal in CLI ([752e0389](https://github.com/SienkLogic/plan-build-run/commit/752e0389))
* Improve onboarding UX with /pbr:new-project as default command ([5cb2e740](https://github.com/SienkLogic/plan-build-run/commit/5cb2e740))
* Planning improvements — PRD express path, interface-first planning, living retrospective (#644) ([3fddd62d](https://github.com/SienkLogic/plan-build-run/commit/3fddd62d))
* Add standard project_context block ([2fc9b1d6](https://github.com/SienkLogic/plan-build-run/commit/2fc9b1d6))
* Handle multi-level decimal phases and escape regex in phase operations (#720) ([bc774562](https://github.com/SienkLogic/plan-build-run/commit/bc774562))
* Clamp progress bar percent to prevent RangeError crash (#715) ([3704829a](https://github.com/SienkLogic/plan-build-run/commit/3704829a))
* Support --cwd override for state-snapshot ([3a56a207](https://github.com/SienkLogic/plan-build-run/commit/3a56a207))
* Prevent workflows and templates from being incorrectly converted to TOML ([2c0db8ea](https://github.com/SienkLogic/plan-build-run/commit/2c0db8ea))
* Add Nyquist validation layer to plan-phase pipeline ([e0f9c738](https://github.com/SienkLogic/plan-build-run/commit/e0f9c738))
* Add option highlighting and gray area looping ([e3dda453](https://github.com/SienkLogic/plan-build-run/commit/e3dda453))
* Create backup before STATE.md regeneration ([bf2f5710](https://github.com/SienkLogic/plan-build-run/commit/bf2f5710))
* Install PBR commands as prompts for '/' menu discoverability ([db1d003d](https://github.com/SienkLogic/plan-build-run/commit/db1d003d))
* Convert Task() calls to codex exec during install ([87c38734](https://github.com/SienkLogic/plan-build-run/commit/87c38734))
* Universal phase number parsing with comparePhaseNum helper ([7461b3d2](https://github.com/SienkLogic/plan-build-run/commit/7461b3d2))
* Tighten milestone audit requirements verification with 3-source cross-reference ([2f258956](https://github.com/SienkLogic/plan-build-run/commit/2f258956))
* Close requirements verification loop and enforce MUST language ([9ef582ef](https://github.com/SienkLogic/plan-build-run/commit/9ef582ef))
* Requirements tracking chain — strip brackets, add requirements field to plans and summaries ([cbf80941](https://github.com/SienkLogic/plan-build-run/commit/cbf80941))
* Persist auto-advance to config and bypass checkpoints ([49936786](https://github.com/SienkLogic/plan-build-run/commit/49936786))
* Warn when planning without user context or discussing after plans exist ([fc347d5c](https://github.com/SienkLogic/plan-build-run/commit/fc347d5c))
* Wire --auto from new-project into phase chain ([b27034b7](https://github.com/SienkLogic/plan-build-run/commit/b27034b7))
* Add --full flag for plan-checking and verification ([7510a8a8](https://github.com/SienkLogic/plan-build-run/commit/7510a8a8))
* Chain phase execution across full milestone ([1dcedb63](https://github.com/SienkLogic/plan-build-run/commit/1dcedb63))
* Add /pbr:health command for planning directory validation ([cb7d4dbc](https://github.com/SienkLogic/plan-build-run/commit/cb7d4dbc))
* Respect commit_docs when merging branches in complete-milestone ([99c5c410](https://github.com/SienkLogic/plan-build-run/commit/99c5c410))
* Add .gitkeep to phase directories for git tracking ([0f2a3faf](https://github.com/SienkLogic/plan-build-run/commit/0f2a3faf))
* Use correct config path for local OpenCode installs ([0dde9798](https://github.com/SienkLogic/plan-build-run/commit/0dde9798))
* Archive completed milestone phase directories (closes #489) ([41cb7455](https://github.com/SienkLogic/plan-build-run/commit/41cb7455))
* Write large JSON payloads to tmpfile to prevent truncation (closes #493) ([8d977328](https://github.com/SienkLogic/plan-build-run/commit/8d977328))
* Support #### heading depth in phase matching ([9aeafc0f](https://github.com/SienkLogic/plan-build-run/commit/9aeafc0f))
* Normalize phase padding in insert command (closes #494) ([afb93a37](https://github.com/SienkLogic/plan-build-run/commit/afb93a37))
* Rename pbr-tools.js to .cjs to prevent ESM conflicts (closes #495) ([24b933e0](https://github.com/SienkLogic/plan-build-run/commit/24b933e0))
* Consistent phase transition routing through discuss-phase (#530) ([91e4ef77](https://github.com/SienkLogic/plan-build-run/commit/91e4ef77))
* Deterministic ROADMAP progress table updates from disk (#537) ([c8827fed](https://github.com/SienkLogic/plan-build-run/commit/c8827fed))
* Use ROADMAP Success Criteria instead of deriving truths from Goal (#538) ([4fb04287](https://github.com/SienkLogic/plan-build-run/commit/4fb04287))
* Update REQUIREMENTS.md traceability when phase completes ([a142002d](https://github.com/SienkLogic/plan-build-run/commit/a142002d))
* Update STATE.md after discuss-phase completes (#556) ([dcdb31cd](https://github.com/SienkLogic/plan-build-run/commit/dcdb31cd))
* Enforce 12-char AskUserQuestion header limit (#559) ([765476ea](https://github.com/SienkLogic/plan-build-run/commit/765476ea))
* Close parent UAT and debug artifacts after gap-closure phase (#580) ([dcace256](https://github.com/SienkLogic/plan-build-run/commit/dcace256))
* Fall back to ROADMAP.md when phase directory missing (#521) ([b9f9ee98](https://github.com/SienkLogic/plan-build-run/commit/b9f9ee98))
* Accept ## and ### phase headers, detect malformed ROADMAPs (#598, #599) ([7b140c2d](https://github.com/SienkLogic/plan-build-run/commit/7b140c2d))
* Use {phase_num} instead of ambiguous {phase} for filenames (#601) ([d8638588](https://github.com/SienkLogic/plan-build-run/commit/d8638588))
* Add package.json to prevent ESM inheritance (#602) ([51544460](https://github.com/SienkLogic/plan-build-run/commit/51544460))
* Add git_tag config option to disable tagging on milestone completion (#532) ([430a7e4f](https://github.com/SienkLogic/plan-build-run/commit/430a7e4f))
* Auto-migrate renamed statusline.js reference (#288) ([f4d6b30f](https://github.com/SienkLogic/plan-build-run/commit/f4d6b30f))
* Verify-work defers diagnosis/planning to plan-phase --gaps (#502) ([25aeb443](https://github.com/SienkLogic/plan-build-run/commit/25aeb443))
* Move resolved debug sessions to resolved/ folder (#497) ([ba279128](https://github.com/SienkLogic/plan-build-run/commit/ba279128))
* Create feature branch before first commit in discuss/plan workflows (#512) ([c3c9d523](https://github.com/SienkLogic/plan-build-run/commit/c3c9d523))
* Add --auto flag for unattended initialization ([7f490830](https://github.com/SienkLogic/plan-build-run/commit/7f490830))
* Replace HEREDOC with literal newlines for Windows compatibility ([ced41d77](https://github.com/SienkLogic/plan-build-run/commit/ced41d77))
* Persist research decision from new-milestone to config ([767bef64](https://github.com/SienkLogic/plan-build-run/commit/767bef64))
* Add workaround for Claude Code classifyHandoffIfNeeded bug (#480) ([4072fd2b](https://github.com/SienkLogic/plan-build-run/commit/4072fd2b))
* Preserve local patches across PBR updates (#481) ([ca03a061](https://github.com/SienkLogic/plan-build-run/commit/ca03a061))
* Respect commit_docs=false in all .planning commit paths (#482) ([01c9115f](https://github.com/SienkLogic/plan-build-run/commit/01c9115f))
* Normalize Windows backslashes in pbr-tools path prefix ([1c6a35f7](https://github.com/SienkLogic/plan-build-run/commit/1c6a35f7))
* Add --include flag to init commands to eliminate redundant file reads ([fa81821d](https://github.com/SienkLogic/plan-build-run/commit/fa81821d))
* Prevent installer from deleting opencode.json on parse errors (#475) ([6cf4a4e3](https://github.com/SienkLogic/plan-build-run/commit/6cf4a4e3))
* Add context-optimizing parsing commands to pbr-tools (#473) ([6c537373](https://github.com/SienkLogic/plan-build-run/commit/6c537373))
* Extract repetitive bash patterns into pbr-tools commands (#472) ([1b317dec](https://github.com/SienkLogic/plan-build-run/commit/1b317dec))
* Add compound init commands and update workflows (#468) ([246d542c](https://github.com/SienkLogic/plan-build-run/commit/246d542c))
* Add CLI utility for command extraction ([01ae939c](https://github.com/SienkLogic/plan-build-run/commit/01ae939c))
* Remove PBR Memory system (not ready for release) ([cc3c6aca](https://github.com/SienkLogic/plan-build-run/commit/cc3c6aca))
* Prevent API keys from being committed via map-codebase ([f53011c9](https://github.com/SienkLogic/plan-build-run/commit/f53011c9))
* Add completion verification to prevent hallucinated success (#315) ([f380275e](https://github.com/SienkLogic/plan-build-run/commit/f380275e))
* Update command respects local vs global install ([83845755](https://github.com/SienkLogic/plan-build-run/commit/83845755))
* Statusline crash handling, color validation, git staging rules ([9d7ea9c1](https://github.com/SienkLogic/plan-build-run/commit/9d7ea9c1))
* Update statusline.js reference during install (#392) ([074b2bcc](https://github.com/SienkLogic/plan-build-run/commit/074b2bcc))
* Enforce context fidelity in planning pipeline (#391) ([ecbc692b](https://github.com/SienkLogic/plan-build-run/commit/ecbc692b))
* Respect parallelization config setting (#379) ([4267c6cf](https://github.com/SienkLogic/plan-build-run/commit/4267c6cf))
* Clarify ASCII box-drawing vs text content with diacritics (#289) ([2347fca3](https://github.com/SienkLogic/plan-build-run/commit/2347fca3))
* Respect attribution.commit setting (compatible opencode) (#286) ([d1654960](https://github.com/SienkLogic/plan-build-run/commit/d1654960))
* Add squash merge option for branching strategies ([5ee22e62](https://github.com/SienkLogic/plan-build-run/commit/5ee22e62))
* Add Gemini support to installer (#301) ([5379832f](https://github.com/SienkLogic/plan-build-run/commit/5379832f))
* Add unified branching strategy option ([197800e2](https://github.com/SienkLogic/plan-build-run/commit/197800e2))
* Add /pbr:join-discord command ([6e2f46c9](https://github.com/SienkLogic/plan-build-run/commit/6e2f46c9))
* Add --uninstall flag to remove PBR files ([12e6acbf](https://github.com/SienkLogic/plan-build-run/commit/12e6acbf))
* Use *-CONTEXT.md glob for filename variants ([f059a6cf](https://github.com/SienkLogic/plan-build-run/commit/f059a6cf))
* Use correct OpenCode config path (~/.config/opencode) (#233) ([707d4b47](https://github.com/SienkLogic/plan-build-run/commit/707d4b47))
* Add interactive runtime selection prompt ([820f1086](https://github.com/SienkLogic/plan-build-run/commit/820f1086))
* Auto-configure read permissions for PBR docs ([cfb9e261](https://github.com/SienkLogic/plan-build-run/commit/cfb9e261))
* Remove backticks from slash commands in new-project output ([460f0d99](https://github.com/SienkLogic/plan-build-run/commit/460f0d99))
* Escape/Ctrl+C cancels instead of installing globally ([67201cb0](https://github.com/SienkLogic/plan-build-run/commit/67201cb0))
* Make installer work for opencode ([bf73de89](https://github.com/SienkLogic/plan-build-run/commit/bf73de89))
* Update build script to use pbr-statusline.js ([cdad7b8a](https://github.com/SienkLogic/plan-build-run/commit/cdad7b8a))
* Revise plan 05-02 based on checker feedback ([6e757aaa](https://github.com/SienkLogic/plan-build-run/commit/6e757aaa))
* Address tech debt from milestone audit ([c1a86cad](https://github.com/SienkLogic/plan-build-run/commit/c1a86cad))
* Revise plans based on checker feedback ([3230fdfd](https://github.com/SienkLogic/plan-build-run/commit/3230fdfd))
* Inline file contents in Task prompts ([ce4fc96f](https://github.com/SienkLogic/plan-build-run/commit/ce4fc96f))
* Add uncommitted planning mode (#107) ([1f18ec89](https://github.com/SienkLogic/plan-build-run/commit/1f18ec89))
* Use numbered prefix for PLAN and SUMMARY files ([c1727a3b](https://github.com/SienkLogic/plan-build-run/commit/c1727a3b))
* Create 90s-style HTML command reference page ([fc3287c8](https://github.com/SienkLogic/plan-build-run/commit/fc3287c8))
* Create PBR commands HTML reference page ([deec75c8](https://github.com/SienkLogic/plan-build-run/commit/deec75c8))
* Implement final commit and completion output ([942e6591](https://github.com/SienkLogic/plan-build-run/commit/942e6591))
* Implement STATE.md Quick Tasks Completed table update ([2dbc802f](https://github.com/SienkLogic/plan-build-run/commit/2dbc802f))
* Create quick.md command file with structure ([2b36394f](https://github.com/SienkLogic/plan-build-run/commit/2b36394f))
* Clamp progress bar value to 0-100 range (#176) ([99362f1e](https://github.com/SienkLogic/plan-build-run/commit/99362f1e))
* Validate empty --config-dir value (#177) ([80414a78](https://github.com/SienkLogic/plan-build-run/commit/80414a78))
* Use consistent allowed-tools YAML format (#179) ([76cba3bf](https://github.com/SienkLogic/plan-build-run/commit/76cba3bf))
* Handle non-TTY stdin and verify file installation ([c233f711](https://github.com/SienkLogic/plan-build-run/commit/c233f711))
* Clean up orphaned pbr-notify.sh from previous versions ([6c435b3d](https://github.com/SienkLogic/plan-build-run/commit/6c435b3d))
* Add --gaps-only flag for gap closure execution ([200e0047](https://github.com/SienkLogic/plan-build-run/commit/200e0047))
* Clean install removes orphaned files ([acd62c0f](https://github.com/SienkLogic/plan-build-run/commit/acd62c0f))
* Add offer_next section with routing templates ([54f2d560](https://github.com/SienkLogic/plan-build-run/commit/54f2d560))
* Remove code blocks from output templates for proper markdown rendering ([8d199427](https://github.com/SienkLogic/plan-build-run/commit/8d199427))
* Recommend discuss-phase before plan-phase in all next-step suggestions ([cfe237d4](https://github.com/SienkLogic/plan-build-run/commit/cfe237d4))
* Recommend discuss-phase before plan-phase ([60ebda93](https://github.com/SienkLogic/plan-build-run/commit/60ebda93))
* Normalize phase input at command entry points ([567bdd2e](https://github.com/SienkLogic/plan-build-run/commit/567bdd2e))
* Phase directory matching and orphaned references ([a31f730f](https://github.com/SienkLogic/plan-build-run/commit/a31f730f))
* Commit orchestrator corrections before verification ([12373d2f](https://github.com/SienkLogic/plan-build-run/commit/12373d2f))
* Commit revised plans after checker feedback ([3e80a2a8](https://github.com/SienkLogic/plan-build-run/commit/3e80a2a8))
* Hardcode read for CONTEXT.md ([d7463e2f](https://github.com/SienkLogic/plan-build-run/commit/d7463e2f))
* Hardcode reads for CONTEXT.md and RESEARCH.md ([734134f4](https://github.com/SienkLogic/plan-build-run/commit/734134f4))
* Add upstream CONTEXT.md awareness ([d1df08cf](https://github.com/SienkLogic/plan-build-run/commit/d1df08cf))
* Show update indicator when new PBR version available ([7a451e64](https://github.com/SienkLogic/plan-build-run/commit/7a451e64))
* Update ROADMAP.md placeholders after planning ([2569be69](https://github.com/SienkLogic/plan-build-run/commit/2569be69))
* Don't surface user_setup in planning output ([d9625ed3](https://github.com/SienkLogic/plan-build-run/commit/d9625ed3))
* Restore {phase}-{plan}-PLAN.md naming convention ([8c6e503c](https://github.com/SienkLogic/plan-build-run/commit/8c6e503c))
* Add checkpoint box with clear action prompt ([2b797ed4](https://github.com/SienkLogic/plan-build-run/commit/2b797ed4))
* Add PBR brand system for consistent UI ([daa54737](https://github.com/SienkLogic/plan-build-run/commit/daa54737))
* Add explicit roadmap approval gate before committing ([6ae0923c](https://github.com/SienkLogic/plan-build-run/commit/6ae0923c))
* Unify project initialization into single /pbr:new-project flow ([18351fe3](https://github.com/SienkLogic/plan-build-run/commit/18351fe3))
* Remove premature research likelihood predictions from roadmap ([9875df57](https://github.com/SienkLogic/plan-build-run/commit/9875df57))
* Intelligent gray area analysis with scope guardrails ([a7249ebe](https://github.com/SienkLogic/plan-build-run/commit/a7249ebe))
* Run in forked context ([d45261e3](https://github.com/SienkLogic/plan-build-run/commit/d45261e3))
* Add statusline with context usage, model, and current task ([159925c0](https://github.com/SienkLogic/plan-build-run/commit/159925c0))
* Add update command with changelog display ([7865f123](https://github.com/SienkLogic/plan-build-run/commit/7865f123))
* Add explicit MILESTONE-CONTEXT.md reference ([ac316e8f](https://github.com/SienkLogic/plan-build-run/commit/ac316e8f))
* Batch UAT file writes instead of per-response ([8c66a716](https://github.com/SienkLogic/plan-build-run/commit/8c66a716))
* Always route to execute-phase regardless of plan count ([09608820](https://github.com/SienkLogic/plan-build-run/commit/09608820))
* Present research as equal option in routing ([794e0841](https://github.com/SienkLogic/plan-build-run/commit/794e0841))
* Add Route F for between-milestones state ([d1c1c179](https://github.com/SienkLogic/plan-build-run/commit/d1c1c179))
* Version MILESTONE-AUDIT.md and archive on completion ([60070b9b](https://github.com/SienkLogic/plan-build-run/commit/60070b9b))
* Reuse previous must-haves on re-verification ([da95980d](https://github.com/SienkLogic/plan-build-run/commit/da95980d))
* Include VERIFICATION.md in phase completion commit ([70cfd76c](https://github.com/SienkLogic/plan-build-run/commit/70cfd76c))
* Recommend audit-milestone when milestone completes ([6b4f73ef](https://github.com/SienkLogic/plan-build-run/commit/6b4f73ef))
* Add milestone audit system ([6630c321](https://github.com/SienkLogic/plan-build-run/commit/6630c321))
* Remove domain gatekeeping ([b920d47c](https://github.com/SienkLogic/plan-build-run/commit/b920d47c))
* Add verify → plan → execute loop for gap closure ([8e6ad96a](https://github.com/SienkLogic/plan-build-run/commit/8e6ad96a))
* Add phase verification when phase completes ([c7fbb815](https://github.com/SienkLogic/plan-build-run/commit/c7fbb815))
* Enhance roadmap and planning workflows ([87909f97](https://github.com/SienkLogic/plan-build-run/commit/87909f97))
* Add phase verification system ([6d7246dc](https://github.com/SienkLogic/plan-build-run/commit/6d7246dc))
* Bundle phase metadata into single commit ([23833251](https://github.com/SienkLogic/plan-build-run/commit/23833251))
* Load REQUIREMENTS.md for focused research ([3b0ea318](https://github.com/SienkLogic/plan-build-run/commit/3b0ea318))
* Update requirement status to Complete when phase finishes ([e1b6655d](https://github.com/SienkLogic/plan-build-run/commit/e1b6655d))
* Align research-project next steps (both point to define-requirements) ([fc0f8618](https://github.com/SienkLogic/plan-build-run/commit/fc0f8618))
* Add requirements traceability to roadmap and plan-phase ([b708a8d3](https://github.com/SienkLogic/plan-build-run/commit/b708a8d3))
* Show full requirements list, not just counts ([36ff4f4f](https://github.com/SienkLogic/plan-build-run/commit/36ff4f4f))
* Offer both define-requirements and create-roadmap as next steps ([1ccc66f1](https://github.com/SienkLogic/plan-build-run/commit/1ccc66f1))
* Add define-requirements command for scoped v1 requirements ([d0488c50](https://github.com/SienkLogic/plan-build-run/commit/d0488c50))
* Add research-project command for pre-roadmap ecosystem research ([53efcfbf](https://github.com/SienkLogic/plan-build-run/commit/53efcfbf))
* Restore rich documentation and fix continuation pattern ([e98bebfe](https://github.com/SienkLogic/plan-build-run/commit/e98bebfe))
* Restore offer_next routing to orchestrator commands ([e8199d92](https://github.com/SienkLogic/plan-build-run/commit/e8199d92))
* Write VERSION file during installation ([b281148a](https://github.com/SienkLogic/plan-build-run/commit/b281148a))
* Create whats-new.md command ([1a55ac85](https://github.com/SienkLogic/plan-build-run/commit/1a55ac85))
* Update installer to copy CHANGELOG.md ([35cf2511](https://github.com/SienkLogic/plan-build-run/commit/35cf2511))
* Create CHANGELOG.md with Keep-a-Changelog format ([63113e95](https://github.com/SienkLogic/plan-build-run/commit/63113e95))
* Add USER-SETUP.md for external service configuration ([4da80d64](https://github.com/SienkLogic/plan-build-run/commit/4da80d64))
* Add DEBUG_DIR path constant to prevent typos ([b1066c1f](https://github.com/SienkLogic/plan-build-run/commit/b1066c1f))
* Add SlashCommand to plan-fix allowed-tools ([93fc60c1](https://github.com/SienkLogic/plan-build-run/commit/93fc60c1))
* Standardize debug file naming and invoke execute-plan ([0e5f1ce8](https://github.com/SienkLogic/plan-build-run/commit/0e5f1ce8))
* Auto-diagnose issues instead of offering choice ([1f358c55](https://github.com/SienkLogic/plan-build-run/commit/1f358c55))
* Add parallel diagnosis before plan-fix ([d4986629](https://github.com/SienkLogic/plan-build-run/commit/d4986629))
* Redesign verify-work as conversational UAT with persistent state ([9e0808b4](https://github.com/SienkLogic/plan-build-run/commit/9e0808b4))
* Add pre-execution summary for interactive mode (#57) ([136a30e1](https://github.com/SienkLogic/plan-build-run/commit/136a30e1))
* Pre-compute wave numbers at plan time ([d30893a8](https://github.com/SienkLogic/plan-build-run/commit/d30893a8))
* Convert to orchestrator pattern ([8ed6a8fa](https://github.com/SienkLogic/plan-build-run/commit/8ed6a8fa))
* Remove "what's out of scope" question ([a4c83cf2](https://github.com/SienkLogic/plan-build-run/commit/a4c83cf2))
* Load project state before execution ([d5c08e16](https://github.com/SienkLogic/plan-build-run/commit/d5c08e16))
* Parallel execution is recommended, not experimental ([c4e3023d](https://github.com/SienkLogic/plan-build-run/commit/c4e3023d))
* Parallel-first planning with dependency graphs and checkpoint-resume ([e5d4ecc2](https://github.com/SienkLogic/plan-build-run/commit/e5d4ecc2))
* Add .claude/rules/ for auto-loaded contribution rules ([a97c567b](https://github.com/SienkLogic/plan-build-run/commit/a97c567b))
* Inline listing for multiple active sessions ([7d109fde](https://github.com/SienkLogic/plan-build-run/commit/7d109fde))
* Add /pbr:debug for systematic debugging with persistent state ([f0b4c7d8](https://github.com/SienkLogic/plan-build-run/commit/f0b4c7d8))
* Parallel phase execution ([dae8943c](https://github.com/SienkLogic/plan-build-run/commit/dae8943c))
* Suggest execute-phase when multiple plans created ([c163004a](https://github.com/SienkLogic/plan-build-run/commit/c163004a))
* Create animal-facts.md with 5 animal facts ([0ab169df](https://github.com/SienkLogic/plan-build-run/commit/0ab169df))
* Create random-numbers.md ([47980ce5](https://github.com/SienkLogic/plan-build-run/commit/47980ce5))
* Create dad-jokes.md ([92a2a1af](https://github.com/SienkLogic/plan-build-run/commit/92a2a1af))
* Add parallel vs sequential examples to phase-prompt.md ([67afce6c](https://github.com/SienkLogic/plan-build-run/commit/67afce6c))
* Add parallel-aware splitting strategy to scope-estimation.md ([a1f6e9f1](https://github.com/SienkLogic/plan-build-run/commit/a1f6e9f1))
* Add parallelization_aware step to plan-phase ([082c6896](https://github.com/SienkLogic/plan-build-run/commit/082c6896))
* Separate parallelization question from config creation ([454def13](https://github.com/SienkLogic/plan-build-run/commit/454def13))
* Add parallelization question to /pbr:new-project ([27d0f087](https://github.com/SienkLogic/plan-build-run/commit/27d0f087))
* Sync execute-phase command with execute-plan content ([31f56506](https://github.com/SienkLogic/plan-build-run/commit/31f56506))
* Document parallel execution resume support ([3743d1cf](https://github.com/SienkLogic/plan-build-run/commit/3743d1cf))
* Load execute-plan.md context in execute-phase command ([8e8fba27](https://github.com/SienkLogic/plan-build-run/commit/8e8fba27))
* Create execute-phase command ([18a1fd17](https://github.com/SienkLogic/plan-build-run/commit/18a1fd17))
* Implement parallel spawning and monitoring ([511def76](https://github.com/SienkLogic/plan-build-run/commit/511def76))
* Implement dependency analysis step ([caf28103](https://github.com/SienkLogic/plan-build-run/commit/caf28103))
* Add todo capture system for mid-session ideas ([3787f50e](https://github.com/SienkLogic/plan-build-run/commit/3787f50e))
* Consistent zero-padding for decimal phase numbers ([9ec422ac](https://github.com/SienkLogic/plan-build-run/commit/9ec422ac))
* Add planning principles for security, performance, observability ([810409c3](https://github.com/SienkLogic/plan-build-run/commit/810409c3))
* Surface verify-work option after plan execution ([863f86e4](https://github.com/SienkLogic/plan-build-run/commit/863f86e4))
* Add plan-fix command and progress routing for UAT issues ([d72bd743](https://github.com/SienkLogic/plan-build-run/commit/d72bd743))
* Add validation for --config-dir edge cases ([8a0967de](https://github.com/SienkLogic/plan-build-run/commit/8a0967de))
* Add /pbr:remove-phase command ([c096ead2](https://github.com/SienkLogic/plan-build-run/commit/c096ead2))
* Add --config-dir CLI argument for multi-account setups (#20) ([952ead71](https://github.com/SienkLogic/plan-build-run/commit/952ead71))
* Enforce mandatory verification before phase/milestone completion routing ([da884ea7](https://github.com/SienkLogic/plan-build-run/commit/da884ea7))
* Add Claude Code marketplace plugin support ([4d92b3cd](https://github.com/SienkLogic/plan-build-run/commit/4d92b3cd))
* Commit phase artifacts when created (#12) ([1b9c2f24](https://github.com/SienkLogic/plan-build-run/commit/1b9c2f24))
* Persist milestone discussion context across /clear (#11) ([002a819a](https://github.com/SienkLogic/plan-build-run/commit/002a819a))
* Support CLAUDE_CONFIG_DIR environment variable ([0ef716c0](https://github.com/SienkLogic/plan-build-run/commit/0ef716c0))
* Implement per-task atomic commits for better AI observability ([875ac900](https://github.com/SienkLogic/plan-build-run/commit/875ac900))
* Clarify create-milestone.md file locations with explicit instructions ([f34fd45a](https://github.com/SienkLogic/plan-build-run/commit/f34fd45a))
* Clarify depth controls compression, not inflation ([35739c84](https://github.com/SienkLogic/plan-build-run/commit/35739c84))
* Add depth parameter for planning thoroughness ([484134e6](https://github.com/SienkLogic/plan-build-run/commit/484134e6))
* Add /pbr:auto command for autonomous execution ([b0403426](https://github.com/SienkLogic/plan-build-run/commit/b0403426))
* Load tdd.md reference directly in commands ([507b28cf](https://github.com/SienkLogic/plan-build-run/commit/507b28cf))
* TDD integration with detection, annotation, and execution flow ([5390b33b](https://github.com/SienkLogic/plan-build-run/commit/5390b33b))
* Restore deterministic bash commands, remove redundant decision_gate ([86878b97](https://github.com/SienkLogic/plan-build-run/commit/86878b97))
* 70% context reduction for plan-phase (scope-estimation 74%, plan-phase.md 66%) ([df1f1384](https://github.com/SienkLogic/plan-build-run/commit/df1f1384))
* Merge cli-automation into checkpoints, compress plan-format ([5d164328](https://github.com/SienkLogic/plan-build-run/commit/5d164328))
* Explicit plan count check in offer_next step ([f24203dc](https://github.com/SienkLogic/plan-build-run/commit/f24203dc))
* Evolutionary PROJECT.md system ([31597a94](https://github.com/SienkLogic/plan-build-run/commit/31597a94))
* Improve incremental codebase map updates ([c11b744f](https://github.com/SienkLogic/plan-build-run/commit/c11b744f))
* Add file paths to codebase mapping output ([b1f9d574](https://github.com/SienkLogic/plan-build-run/commit/b1f9d574))
* Remove arbitrary 100-line limit from codebase mapping ([dccde98f](https://github.com/SienkLogic/plan-build-run/commit/dccde98f))
* Use inline code for Next Up commands (avoids nesting ambiguity) ([c3273a50](https://github.com/SienkLogic/plan-build-run/commit/c3273a50))
* Check PROJECT.md not .planning/ dir for existing project ([8697c5fd](https://github.com/SienkLogic/plan-build-run/commit/8697c5fd))
* Brownfield integration into PBR workflows ([8d2f3074](https://github.com/SienkLogic/plan-build-run/commit/8d2f3074))
* Codebase map templates for integrations and concerns ([65825928](https://github.com/SienkLogic/plan-build-run/commit/65825928))
* Codebase map templates for conventions and testing ([33c832e7](https://github.com/SienkLogic/plan-build-run/commit/33c832e7))
* Codebase map templates for stack, architecture, structure ([de16552e](https://github.com/SienkLogic/plan-build-run/commit/de16552e))
* Improved continuation UI with context and visual hierarchy ([733fc144](https://github.com/SienkLogic/plan-build-run/commit/733fc144))
* First question should be freeform, not AskUserQuestion ([1b772351](https://github.com/SienkLogic/plan-build-run/commit/1b772351))
* Remove shell context to fix permission errors for non-DSP users ([c21c5e97](https://github.com/SienkLogic/plan-build-run/commit/c21c5e97))
* Replace inline command invocation with clear-then-paste pattern ([d45fbd84](https://github.com/SienkLogic/plan-build-run/commit/d45fbd84))
* Ensure git init runs in current directory ([2be9dd82](https://github.com/SienkLogic/plan-build-run/commit/2be9dd82))
* Mandate AskUserQuestion for all exploration questions ([293447d6](https://github.com/SienkLogic/plan-build-run/commit/293447d6))
* Update stale CONTEXT.md references to new vision structure ([b4de126a](https://github.com/SienkLogic/plan-build-run/commit/b4de126a))
* Remove enterprise language from help and discuss-milestone ([508e0c86](https://github.com/SienkLogic/plan-build-run/commit/508e0c86))
* Present new-project completion inline instead of as question ([3e8e5d53](https://github.com/SienkLogic/plan-build-run/commit/3e8e5d53))
* Restore AskUserQuestion for decision gate in questioning flow ([3d7b9657](https://github.com/SienkLogic/plan-build-run/commit/3d7b9657))
* Yolo mode now skips confirmation gates in plan-phase ([46d63991](https://github.com/SienkLogic/plan-build-run/commit/46d63991))
* Rewrite questioning as thinking partner, not interviewer ([83e27785](https://github.com/SienkLogic/plan-build-run/commit/83e27785))
* Add research-phase for niche domain ecosystem discovery ([e8d68685](https://github.com/SienkLogic/plan-build-run/commit/e8d68685))

