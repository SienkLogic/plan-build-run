# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.19.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.18.1...plan-build-run-v2.19.0) (2026-02-22)


### Features

* **dashboard:** add responsive mobile layout with sidebar hamburger menu ([5621739](https://github.com/SienkLogic/plan-build-run/commit/5621739b1b1b85bf5854bf52582908251fdeff13))
* **tools:** add D10 test plan coverage dimension to plan-checker agent ([a4ff196](https://github.com/SienkLogic/plan-build-run/commit/a4ff19664c723861b262f9d6feccdd9e1ef95221))
* **tools:** add PreToolUse additionalContext soft warnings for risky operations ([1d39406](https://github.com/SienkLogic/plan-build-run/commit/1d394066071959e4abafdcc1e84d472f05584018))
* **tools:** add STATE.md backup step before health skill auto-fix regeneration ([43a52dd](https://github.com/SienkLogic/plan-build-run/commit/43a52dd36df9afc2f0aa3ddebfd588904b562bcd))
* **tools:** require user confirmation before debugger agent applies fixes ([5446654](https://github.com/SienkLogic/plan-build-run/commit/544665487093210c6f6e412f7af79e02d33cf19a))
* **tools:** use last_assistant_message in Stop/SubagentStop hooks ([ab73122](https://github.com/SienkLogic/plan-build-run/commit/ab731222549b6c251d93de123a3a2475b8d41a13))


### Bug Fixes

* **dashboard:** handle todo files with H1 title and high/medium/low priority ([9edb601](https://github.com/SienkLogic/plan-build-run/commit/9edb601bdeb974c3f1d47f612697516b67d5aa2e))
* **dashboard:** show completed milestones on roadmap when all phases archived ([656ec04](https://github.com/SienkLogic/plan-build-run/commit/656ec04120931e5092ee608f23022276c5d79381))
* **tools:** add commonjs package.json to scripts for ESM project compat ([8ca8780](https://github.com/SienkLogic/plan-build-run/commit/8ca878023ce90257ccb9fe0cdabe5a3040ece9e9))


### Documentation

* **tools:** document minimum Claude Code v2.1.47 requirement for Windows hooks ([2ecb231](https://github.com/SienkLogic/plan-build-run/commit/2ecb23172f154e1fe68460c087eb055deea1df94))

## [2.18.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.18.0...plan-build-run-v2.18.1) (2026-02-22)


### Bug Fixes

* **tools:** add Skill tool to 4 PBR skills that use auto-advance chaining ([2be11a4](https://github.com/SienkLogic/plan-build-run/commit/2be11a4dd4fe0ad875787fc65d7f217919f4a662))
* **tools:** update critical agents to use model: sonnet instead of inherit ([6d66573](https://github.com/SienkLogic/plan-build-run/commit/6d66573b72352a1c412ff7e1e74adee2e1d2b59f))

## [2.18.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.17.1...plan-build-run-v2.18.0) (2026-02-22)


### Features

* **16-01:** redesign dashboard home, fix analytics duration, add bar charts, mermaid dark mode ([9ea3936](https://github.com/SienkLogic/plan-build-run/commit/9ea3936bb5c35305b57250c83e596c4704bc8868))
* **17-01:** add notes page, verification viewer, milestone progress bars, dynamic footer version ([71625ff](https://github.com/SienkLogic/plan-build-run/commit/71625ff769638be8d75840b48f455a1fe5664b88))


### Bug Fixes

* **18-01:** HTMX navigation consistency, SSE tooltip, error page fix, remove deprecated layout ([0f40f3c](https://github.com/SienkLogic/plan-build-run/commit/0f40f3c9de389f7eb33f8eb83c78a0880f485e4e))

## [2.17.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.17.0...plan-build-run-v2.17.1) (2026-02-22)


### Bug Fixes

* **dashboard:** plan count regex and mermaid rendering ([204838b](https://github.com/SienkLogic/plan-build-run/commit/204838b8be197cfa0835005e79a288f1d7d3d646))

## [2.17.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.16.0...plan-build-run-v2.17.0) (2026-02-22)


### Features

* **tools:** add /pbr:audit skill for session compliance and UX review ([ea9920e](https://github.com/SienkLogic/plan-build-run/commit/ea9920e3ce9d982d222644e8898569b2dbfa71f8))

## [2.16.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.15.0...plan-build-run-v2.16.0) (2026-02-22)


### Features

* **11-01:** create tokens.css with dual-mode design tokens ([53afcc1](https://github.com/SienkLogic/plan-build-run/commit/53afcc1cc84e56d3d98b66a5758591f79af5c725))
* **11-01:** refactor layout.css to use semantic design tokens ([f0fa53c](https://github.com/SienkLogic/plan-build-run/commit/f0fa53c88ac4345b135033e14dc37b937a65d5dd))
* **11-02:** add theme toggle button with localStorage persistence ([f84576e](https://github.com/SienkLogic/plan-build-run/commit/f84576ec4596dedc9643b7cb76e55d14865ebffb))
* **11-02:** pin Pico.css CDN to v2.0.6 ([1e46ef6](https://github.com/SienkLogic/plan-build-run/commit/1e46ef6bd56e12222d735590d9dea3b3c7f1f5b6))
* **12-01:** add current-phase middleware for sidebar context ([d7d0e16](https://github.com/SienkLogic/plan-build-run/commit/d7d0e16419f692aa9883d9262b119dc514f7e9b0))
* **12-01:** implement mobile overlay sidebar with backdrop ([3cc59ac](https://github.com/SienkLogic/plan-build-run/commit/3cc59acf55ab90568d4f11c11df43c7a07ca43f4))
* **12-01:** redesign sidebar with collapsible sections and current phase card ([0b6aa07](https://github.com/SienkLogic/plan-build-run/commit/0b6aa076bfea6fdac3c7c855a6ad522f6d8f50ce))
* **12-02:** add breadcrumb data to routes and include partial in content templates ([a90684e](https://github.com/SienkLogic/plan-build-run/commit/a90684e7752fcf232bcaee223e392e1dd4a9d52e))
* **12-02:** create breadcrumbs partial and CSS styles ([82ba448](https://github.com/SienkLogic/plan-build-run/commit/82ba44833b09398d5abec88bf6e6a60032694412))
* **13-01:** add milestone history expandable table with stats and deliverables ([ccc82d5](https://github.com/SienkLogic/plan-build-run/commit/ccc82d59f28e67b8ab5cb0db803d228e35af8339))
* **13-01:** add todo filtering by priority, status, and search with bulk complete ([0abbf4c](https://github.com/SienkLogic/plan-build-run/commit/0abbf4c173395bfeda4b5c73f312a3820e86ad67))
* **13-02:** add dependency graph route, views, and sidebar link ([d7224c2](https://github.com/SienkLogic/plan-build-run/commit/d7224c297dcbd07ac3659e95c4047448e5c6292b))
* **13-02:** add Mermaid dependency graph generation to roadmap service ([662056b](https://github.com/SienkLogic/plan-build-run/commit/662056b703f4ef4d7910d7afb1f79444be6e11d1))
* **13-03:** add analytics route, views, and sidebar link ([750562b](https://github.com/SienkLogic/plan-build-run/commit/750562b94287f151d89d7160ab124e2dc3279abc))
* **13-03:** create analytics service with git-based metrics and TTL cache ([41eb38a](https://github.com/SienkLogic/plan-build-run/commit/41eb38aebf930ec085edaee416913c2319a6d216))
* **14-01:** add Last-Event-ID state recovery to SSE endpoint ([b41c8dd](https://github.com/SienkLogic/plan-build-run/commit/b41c8ddc0638cd1bd103110ed6aa74a1512ca137))
* **14-01:** create custom SSE client with exponential backoff ([8d75876](https://github.com/SienkLogic/plan-build-run/commit/8d758765f0465820560a72fdad745481e091f04b))
* **14-01:** reduce chokidar stability threshold to 500ms ([1ef4dc4](https://github.com/SienkLogic/plan-build-run/commit/1ef4dc49604d98f5b6d9847f6ce835ee909b519f))
* **14-02:** add hx-indicator spinners to todo complete actions ([a166d94](https://github.com/SienkLogic/plan-build-run/commit/a166d946323255696f46f0550892878eda622ebd))
* **14-02:** add TTL cache utility and integrate into analytics and milestone services ([123c2d2](https://github.com/SienkLogic/plan-build-run/commit/123c2d25ea7050515e685c05231401de76d4cd7c))
* **15-01:** add error-card styling, loading indicator, and favicon ([6f3c550](https://github.com/SienkLogic/plan-build-run/commit/6f3c550f79885010af59377a95c7dfd2e53038c3))
* **15-01:** add skip-to-content link, focus-visible styles, and ARIA labels ([47c3c9b](https://github.com/SienkLogic/plan-build-run/commit/47c3c9bcaf8f2a5e143fe1b5a8ed18e5da9b20ba))
* **15-01:** create reusable empty-state partial and integrate into views ([48c6807](https://github.com/SienkLogic/plan-build-run/commit/48c6807b9f19fcd4abc8582820155c5ccc73a244))
* **15-02:** GREEN - analytics, cache, SSE tests pass against existing code ([1f6e3c2](https://github.com/SienkLogic/plan-build-run/commit/1f6e3c2feef7ba601afe66c68e41401aa44568be))
* **15-02:** GREEN - dependencies and breadcrumbs tests pass ([8fd48fc](https://github.com/SienkLogic/plan-build-run/commit/8fd48fc63e5414cf93bec4d7afadf86b463a6f32))


### Bug Fixes

* **14-01:** add missing #sse-status element to header ([b831104](https://github.com/SienkLogic/plan-build-run/commit/b831104feaee62a5f6768ec8060aa2387e82322c))
* **14-02:** clear milestone cache between tests to prevent stale data ([192b53c](https://github.com/SienkLogic/plan-build-run/commit/192b53cbb4777350950ed8bd0d4993d3229f1630))

## [2.15.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.14.0...plan-build-run-v2.15.0) (2026-02-22)


### Features

* **tools:** add rollback downstream invalidation, complete help docs, dashboard route tests ([4461211](https://github.com/SienkLogic/plan-build-run/commit/446121187494306e81ceb642083858ac6353b5d8))

## [2.14.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.13.0...plan-build-run-v2.14.0) (2026-02-22)


### Features

* **tools:** add EnterPlanMode interception hook to redirect to PBR commands ([57e2b55](https://github.com/SienkLogic/plan-build-run/commit/57e2b551d326457c44feccdf3c3fdf6c02d9c1b8))

## [2.13.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.12.0...plan-build-run-v2.13.0) (2026-02-22)


### Features

* **tools:** add stale active-skill session-start warning and copilot hook limitation docs ([158a78d](https://github.com/SienkLogic/plan-build-run/commit/158a78d03b482f56ab6f09e89bf9ef67b81fb409))

## [2.12.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.11.0...plan-build-run-v2.12.0) (2026-02-21)


### Features

* **tools:** add review verifier post-check and stale active-skill detection ([dbd2eb8](https://github.com/SienkLogic/plan-build-run/commit/dbd2eb899c2b15cc2ac61913b29ca1aaab6b0b1f))
* **tools:** add scan mapper area validation and stale Building status detection ([8d8a438](https://github.com/SienkLogic/plan-build-run/commit/8d8a43809095722ae9d00242f90f29d32bef4d1f))


### Bug Fixes

* **tools:** extend executor commit check to quick skill and add .catch() to log-tool-failure ([197efc7](https://github.com/SienkLogic/plan-build-run/commit/197efc70cb5e2a36f014ee2c5c7d653b4b1898f4))
* **tools:** warn on context budget tracker reset and roadmap sync parse failures ([f5aef28](https://github.com/SienkLogic/plan-build-run/commit/f5aef2804e42a934d3e7a480e3045ac6c0e0fc9b))

## [2.11.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.10.0...plan-build-run-v2.11.0) (2026-02-21)


### Features

* **06-01:** add .active-skill write and cleanup to begin, plan, review, import skills ([e16c0cb](https://github.com/SienkLogic/plan-build-run/commit/e16c0cbe73da7abd08008c56d918106e73a3535a))
* **06-02:** add CRITICAL markers to file-creation steps in begin, build, milestone, setup, pause ([edd9322](https://github.com/SienkLogic/plan-build-run/commit/edd932287bfeb390aa67aee0cb17b44c886339d2))
* **07-01:** add Write tool to verifier/integration-checker and update prose across all plugins ([20bcd55](https://github.com/SienkLogic/plan-build-run/commit/20bcd550cb3c01312c805c543e01e72a7dd8dd88))
* **07-01:** register missing skills in check-skill-workflow.js switch statement ([26c4264](https://github.com/SienkLogic/plan-build-run/commit/26c42640f199eae7de4570cb0fcb8fdab514cc64))
* **07-02:** add debugger advisory gate and milestone gaps_found status check ([d999fe0](https://github.com/SienkLogic/plan-build-run/commit/d999fe0cf65febf877c731d983edb49e1cfa3dc7))
* **07-02:** add mtime-based recency checks for researcher and synthesizer output ([4581529](https://github.com/SienkLogic/plan-build-run/commit/45815292c8e1604d2b5307092b2b2d6fdb3c2eec))
* **08-01:** add inline fallback formats to 7 template-dependent agents ([e383118](https://github.com/SienkLogic/plan-build-run/commit/e3831187a35e0bf2924f0e156971b530d71dada3))
* **08-02:** add CRITICAL markers and fix agent handoff issues ([a921c29](https://github.com/SienkLogic/plan-build-run/commit/a921c29005b232aa662ee7364f19154f103c827f))
* **09-01:** add gate error fix guidance and discuss deep-dive CRITICAL enforcement ([6257ac5](https://github.com/SienkLogic/plan-build-run/commit/6257ac5bb69c04078fc1fd845049900274e4079c))
* **09-01:** add health auto-fix for common corruption patterns ([6209e20](https://github.com/SienkLogic/plan-build-run/commit/6209e2012ec972ae351bd967cd1fa1087b767474))
* **09-01:** add rollback safety, setup idempotency, and todo archive safety ([8106793](https://github.com/SienkLogic/plan-build-run/commit/8106793c6dc728a58c8be6a5f1ccaffc9cef83a6))
* **09-02:** rewrite ui-formatting.md with unified double-line box format ([1030f30](https://github.com/SienkLogic/plan-build-run/commit/1030f3078d171f200d1d85a29481deb65f927875))
* **09-02:** update error-reporting fragment with block reason guidance ([55780b2](https://github.com/SienkLogic/plan-build-run/commit/55780b2b54725b8d503e0b46291c80fe5a92219b))
* **09-03:** replace heavy bar and thin divider banners with double-line box format in all 24 skills ([1754b2b](https://github.com/SienkLogic/plan-build-run/commit/1754b2bc8dbb625c48ef618036eef3bda06f6380))
* **09-03:** sync banner replacements and 09-01/09-02 changes to cursor-pbr and copilot-pbr ([4b01088](https://github.com/SienkLogic/plan-build-run/commit/4b010881e275b10ed8ebcace60e74535e66f8d49))
* **09-04:** replace Next Up headings with double-line box format in all PBR skills ([8f34dbc](https://github.com/SienkLogic/plan-build-run/commit/8f34dbc157a67a353e3b4c977249aac667838f32))
* **09-04:** sync Next Up box format to cursor-pbr and copilot-pbr derivatives ([a819e95](https://github.com/SienkLogic/plan-build-run/commit/a819e952483fb348a8c64c27abe59f80590ad712))
* **tools:** add state-sync plans_total fix, anti-pattern rule for Skill-in-Task, and social images ([afdc5f2](https://github.com/SienkLogic/plan-build-run/commit/afdc5f2d10c9cae77e2382332e9243a238c1f54e))


### Bug Fixes

* **06-03:** fix planner naming convention, executor timestamps, and statusline backup ([92c9b8d](https://github.com/SienkLogic/plan-build-run/commit/92c9b8d5fe95a2b339267206185daf38a125ad56))
* **tools:** resolve markdownlint errors in planner agent and milestone skill ([9ef8548](https://github.com/SienkLogic/plan-build-run/commit/9ef8548642cba021d9c917e612116aebe77cf570))
* **tools:** update AskUserQuestion audit to reflect health skill auto-fix gates ([e20bbe5](https://github.com/SienkLogic/plan-build-run/commit/e20bbe51a9f3ad2a7f2a8cd609abee52ef2ce942))


### Documentation

* **08-03:** add agent-contracts.md reference documenting handoff schemas ([89a86cf](https://github.com/SienkLogic/plan-build-run/commit/89a86cf2c21635290f6d048d1b5ef045a686730d))
* **10-01:** wire agent-contracts.md into agents and document abandoned debug resolution ([f30762d](https://github.com/SienkLogic/plan-build-run/commit/f30762d62dbafd0f1705822a295c1eb2c6288017))

## [2.10.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.9.1...plan-build-run-v2.10.0) (2026-02-20)


### Features

* **tools:** add post-compaction recovery, pbr-tools CLI reference, and dashboard UI banner ([84291f2](https://github.com/SienkLogic/plan-build-run/commit/84291f2ff0f9646eea96c02fd50073b8dd17487d))

## [2.9.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.9.0...plan-build-run-v2.9.1) (2026-02-20)


### Documentation

* update CLAUDE.md coverage thresholds to 70% and test count to ~1666 ([7d10002](https://github.com/SienkLogic/plan-build-run/commit/7d10002a6d7814d98808f812060d48a4d49da1bb))

## [2.9.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.8.3...plan-build-run-v2.9.0) (2026-02-20)


### Features

* **tools:** add PR title validation and improved PR template ([5a718b0](https://github.com/SienkLogic/plan-build-run/commit/5a718b0890e9150b1f518cfa8b68873a04372015))

## [2.8.3](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.8.2...plan-build-run-v2.8.3) (2026-02-20)


### Bug Fixes

* **tools:** remove unsupported --local flag from Copilot plugin install ([9d405db](https://github.com/SienkLogic/plan-build-run/commit/9d405db1926f3de42e13e05aa507279aa208124f))

## [2.8.2](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.8.1...plan-build-run-v2.8.2) (2026-02-20)


### Bug Fixes

* **tools:** use RELEASE_PAT for release-please to trigger CI on PRs ([2e4d107](https://github.com/SienkLogic/plan-build-run/commit/2e4d1074f791c78d7cac2dc185f584b2ee641899))

## [2.8.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.8.0...plan-build-run-v2.8.1) (2026-02-20)


### Bug Fixes

* **tools:** lower coverage thresholds to match actual coverage after validate-task.js addition ([352d1b7](https://github.com/SienkLogic/plan-build-run/commit/352d1b7015904957c30c4d3fb08024767c2031bf))

## [2.8.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.7.0...plan-build-run-v2.8.0) (2026-02-20)


### Features

* **03-01:** add review verifier, milestone complete, and build dependency gates ([bda474d](https://github.com/SienkLogic/plan-build-run/commit/bda474d8b88b128464df375d62de9acdeb9dff05))
* **04-01:** add post-artifact validation for begin/plan/build and VERIFICATION.md ([3cb4bc1](https://github.com/SienkLogic/plan-build-run/commit/3cb4bc1c0f277c6beca99f7c336fba5e7376f9ec))
* **05-01:** add STATE.md validation, checkpoint manifest check, and active-skill integrity warning ([d780d97](https://github.com/SienkLogic/plan-build-run/commit/d780d97e620915cb05e70372ce8c9d6003fd1ac8))

## [2.7.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.6.0...plan-build-run-v2.7.0) (2026-02-19)


### Features

* **02-01:** add milestone, explore, import, scan write guards to checkSkillRules ([bd21366](https://github.com/SienkLogic/plan-build-run/commit/bd21366f8f63277566035f0827e3fde2ebc39400))
* **02-02:** add review planner gate to validate-task.js ([89ffb05](https://github.com/SienkLogic/plan-build-run/commit/89ffb05bc6384fc47fbf85ac7c875e16a29db0b9))
* **02-02:** strengthen ROADMAP sync warnings to CRITICAL level ([7120d60](https://github.com/SienkLogic/plan-build-run/commit/7120d60fdc6678d8c9853679b0d3464116821097))


### Bug Fixes

* **tools:** auto-route quick skill to plan skill when user selects Full plan ([252a35e](https://github.com/SienkLogic/plan-build-run/commit/252a35ed9942c2b1902f38923bb80d92d819ae4e))

## [2.6.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.5.0...plan-build-run-v2.6.0) (2026-02-19)


### Features

* **01-01:** add build and plan executor gates to validate-task.js ([4d882e0](https://github.com/SienkLogic/plan-build-run/commit/4d882e07d9560c0540c2277149338137a9a7e05d))
* **01-01:** extend agent output validation to all 10 PBR agent types ([9f4384f](https://github.com/SienkLogic/plan-build-run/commit/9f4384fa2391c3e5905243119da5bebbf65f6218))
* **01-02:** add skill-specific workflow rules and CRITICAL enforcement ([173e89e](https://github.com/SienkLogic/plan-build-run/commit/173e89e0dfc81aa425b222efd982b83a19e2b3d0))
* **tools:** add /pbr:statusline command to install PBR status line ([8bd9e7a](https://github.com/SienkLogic/plan-build-run/commit/8bd9e7a98b76cf8e1686eb7a936da8539fe20a08))


### Bug Fixes

* **01-01:** hasPlanFile now matches numbered plan files like PLAN-01.md ([00c4af8](https://github.com/SienkLogic/plan-build-run/commit/00c4af8066c4c0c24f25be7cd6731acb2b13cb61))
* **tools:** prefix unused name var with underscore in version sync test ([8b8b81d](https://github.com/SienkLogic/plan-build-run/commit/8b8b81dea5eff86fb4503cecdc9e677f573faf03))
* **tools:** resolve lint errors in statusline workflow rules ([6c32db7](https://github.com/SienkLogic/plan-build-run/commit/6c32db7947ccaf392457750a26406ca92a3eef77))
* **tools:** revert release branch CI trigger (using non-strict protection instead) ([836ac24](https://github.com/SienkLogic/plan-build-run/commit/836ac2401d3381b395fcf6b2bf252ff78745abd5))
* **tools:** trigger CI on release-please branch pushes for auto-merge ([443e046](https://github.com/SienkLogic/plan-build-run/commit/443e0466f27eb51269999755eb2f8d37093d0f65))

## [2.5.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.4.1...plan-build-run-v2.5.0) (2026-02-19)


### Features

* **tools:** auto-close satisfied pending todos after quick task and build completion ([e1f8034](https://github.com/SienkLogic/plan-build-run/commit/e1f80349ca5b646ee1380014dec24dfdc0d3f800))


### Bug Fixes

* **tools:** add --repo flag to gh pr merge in release workflow ([4923c81](https://github.com/SienkLogic/plan-build-run/commit/4923c811244092a322c331c7f10dcb0f855a8177))
* **tools:** add milestone routing to explore skill completion ([57c3d9d](https://github.com/SienkLogic/plan-build-run/commit/57c3d9daea154b4bfb9ebe69ad1a09a8c617412d))
* **tools:** enforce quick task directory creation with CRITICAL markers and hook validation ([c7d61ba](https://github.com/SienkLogic/plan-build-run/commit/c7d61ba333423a228d930ccd6e7d63688f8cbb58))

## [2.4.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.4.0...plan-build-run-v2.4.1) (2026-02-19)


### Bug Fixes

* **tools:** add pull_request trigger to CI so branch protection checks pass ([6e7ada4](https://github.com/SienkLogic/plan-build-run/commit/6e7ada4cf1e24e05ddace4706d7ddee527bde81a))

## [2.4.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.3.1...plan-build-run-v2.4.0) (2026-02-19)


### Features

* **tools:** add GitHub Copilot CLI plugin port ([3977261](https://github.com/SienkLogic/plan-build-run/commit/39772618479551a58123d08d99cbcb1178a0cd2a))
* **tools:** archive milestones into versioned directories with phase migration ([206b925](https://github.com/SienkLogic/plan-build-run/commit/206b925dd6692131f0d9127d10cd07208c777e40))


### Bug Fixes

* **tools:** parse simple two-column roadmap table in dashboard ([f881004](https://github.com/SienkLogic/plan-build-run/commit/f8810045739ffeaf29a495f824bc34828c8e6c4d))
* **tools:** resolve lint errors in cross-plugin compat tests ([731efb2](https://github.com/SienkLogic/plan-build-run/commit/731efb221cf630a697a48bf732eed736b9514b1c))
* **tools:** sync dashboard skill paths and missing templates across all plugins ([ee7d770](https://github.com/SienkLogic/plan-build-run/commit/ee7d770c09f8dd7da1b1b9f76d162f0e87fc58a5))


### Documentation

* **tools:** add /pbr:dashboard command to README dashboard section ([e1d3a60](https://github.com/SienkLogic/plan-build-run/commit/e1d3a60e0f8cffcd2f093725e73a0eca0a6c67ad))
* **tools:** add missing 2.3.0 and 2.3.1 changelog entries ([82c5cb2](https://github.com/SienkLogic/plan-build-run/commit/82c5cb21a741be4bfe13613debdeb54f862ce1f3))
* **tools:** make platform badges clickable links to install pages ([a1f6b68](https://github.com/SienkLogic/plan-build-run/commit/a1f6b68a786458a6040d0fa50a99e01431016332))
* **tools:** update README with Copilot CLI support and current stats ([edad2d9](https://github.com/SienkLogic/plan-build-run/commit/edad2d924198d6598eed1fb0b0a23c164617e5b6))

## [Unreleased]

## [2.3.1] - 2026-02-19

### Added
- **GitHub Copilot CLI plugin** (`plugins/copilot-pbr/`) — complete port with 22 skills, 10 agents (`.agent.md` format), and Copilot CLI hook configuration
- Setup scripts (`setup.sh`, `setup.ps1`) for Copilot CLI plugin installation with `copilot plugin install` support
- Cross-plugin compatibility tests now cover all three plugins (Claude Code, Cursor, Copilot CLI) — 164 tests via data-driven `describe.each`
- New cross-plugin guard tests: `references/ files match PBR` and `templates/ files match PBR` catch drift automatically
- Dashboard skill now works from Copilot CLI sessions (`/pbr:dashboard`)
- Platform badges in README link to install pages (wiki or anchor)

### Fixed
- Synced 13 missing template files (`codebase/`, `research/`, `research-outputs/`) to Cursor and Copilot plugins
- Dashboard skill in derivative plugins now references correct relative path (`../../dashboard/`) instead of nonexistent `<plugin-root>/dashboard/`
- Cross-plugin frontmatter parser now handles both `\r\n` and `\n` line endings (was silently failing on Windows-style files)
- Test count: 1219 tests across 44 suites (up from 1134)

## [2.3.0] - 2026-02-19

### Added
- `/pbr:do` freeform router — routes natural language input to the right PBR skill automatically
- Smart skill suggestions in hook feedback when freeform text is detected
- Freeform text guard hook for `/pbr:plan` and todo work subcommand

### Fixed
- Dashboard skill `argument-hint` synced to Cursor plugin

## [2.2.0] - 2026-02-19

### Added
- Milestone integration into workflow lifecycle — milestones are now created automatically during `/pbr:begin` roadmap generation
- Planner agent generates milestone-grouped roadmaps (single milestone for standard projects, multiple for 8+ phase comprehensive projects)
- Milestone-aware boundary detection in `/pbr:build` and `/pbr:review` — reads ROADMAP.md phase ranges instead of just "last phase overall"
- Between-milestones state handling in `/pbr:continue`
- Audit report detection in `/pbr:status` — suggests the correct next action based on whether an audit exists and its result

### Fixed
- "Skip audit" option in build/review completion banners now correctly says "archive milestone after audit passes" (consistent with milestone anti-pattern rules)
- `auto_advance` hard-stop message at milestone boundaries now explains why it paused

## [2.1.0] - 2026-02-19

### Added
- **Cursor IDE plugin** (`plugins/cursor-pbr/`) — complete port with 21 skills, 10 agents, and `.mdc` workflow rules
- Cross-plugin compatibility: shared `.planning/` state between Claude Code and Cursor plugins
- Setup scripts (`setup.sh` for macOS/Linux, `setup.ps1` for Windows) for easy Cursor plugin installation
- Summary gate hook (`check-summary-gate.js`) — enforces SUMMARY file before phase state can advance
- Cross-plugin compatibility test suite (7 tests)
- Cursor plugin validation test suite (92 tests)
- Companion web dashboard improvements: service and route enhancements

### Changed
- Agent definitions optimized — 48% average size reduction across all 10 agents
- Hook scripts improved with better error handling and dispatch logic
- Test count increased from 758 to 1008 across 42 suites
- Removed `.gitkeep` placeholder files from `cursor-pbr/` (replaced by real content)

## [2.0.0] - 2026-02-17

### Added
- Token-saving CLI: 6 new commands in `towline-tools.js` — `frontmatter`, `must-haves`, `phase-info`, `state update`, `roadmap update-status`, `roadmap update-plans`
- Companion web dashboard (Express 5.x, EJS, Pico.css v2, HTMX 2.0) with overview, phase detail, roadmap, todos, and SSE live updates
- `/dev:import` skill — Import external plan documents into Towline format
- `/dev:note` skill — Zero-friction idea capture with promote-to-todo support
- `/dev:setup` skill — Interactive onboarding wizard for new installations
- `/dev:explore` skill — Socratic conversation for idea exploration
- `/dev:continue` skill — Execute the next logical step automatically
- `/dev:health` skill — Validate `.planning/` directory integrity
- General agent — Lightweight Towline-aware agent for ad-hoc tasks
- `/dev:build <N> --team` variant — Agent Teams for complex inter-agent coordination
- `/dev:review <N> --auto-fix` variant — Auto-diagnose and fix verification failures
- Hook spawn tests for all lifecycle hooks
- Iterative retrieval protocol for researcher agent
- Behavioral contexts for agent prompt refinement
- Published to npm with OIDC trusted publishing

### Changed
- Skill count increased from 15 to 21
- Agent count increased from 9 to 10 (added General agent)
- Hook scripts consolidated: Write/Edit dispatch reduced from 4 spawns to 2
- All hook scripts now use `logHook()` from `hook-logger.js` for unified logging
- Agents reference new CLI tooling shortcuts instead of manual YAML parsing
- README rewritten with badges, comparison table, and acknowledgments
- Package tarball trimmed from 1.9MB to 305KB via explicit `files` field

### Fixed
- Windows CI: `parseMustHaves` now trims CRLF line endings
- Context budget: main orchestrator no longer reads agent definitions (saves ~15% context)
- Hook logger rotation: `.hook-log` now caps at 200 entries with JSONL format
- Status line ANSI rendering on Windows terminals

## [1.0.0] - 2025-02-07

### Added
- Initial release of Plan-Build-Run plugin for Claude Code
- 15 skills: begin, plan, build, review, discuss, quick, debug, status, pause, resume, milestone, scan, todo, config, help
- 9 specialized agents: researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer
- Hook-enforced quality gates: commit validation, plan format checking, session state injection, pre-compact preservation
- Wave-based parallel execution via Task() subagents
- Goal-backward verification at phase and milestone levels
- Persistent file-based state management (.planning/ directory)
- Configurable workflow: depth, models, gates, parallelization, git branching
- Cross-platform Node.js hook scripts (Windows + macOS + Linux)
- Plugin distribution via npm
