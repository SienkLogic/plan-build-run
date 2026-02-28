# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.41.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.40.1...plan-build-run-v2.41.0) (2026-02-28)


### Features

* **47-01:** expand stateUpdate to cover all 9 STATE.md frontmatter fields ([de6a6b3](https://github.com/SienkLogic/plan-build-run/commit/de6a6b3b3f577c436396927a4b5511b5163a527c))
* **47-02:** add [@file](https://github.com/file): escape hatch tests and documentation ([6634f50](https://github.com/SienkLogic/plan-build-run/commit/6634f504c7e64f25caaecb0b06561c3a03b88d35))


### Bug Fixes

* **47-01:** update stale state update usage hint to list all 9 fields ([e0d0e39](https://github.com/SienkLogic/plan-build-run/commit/e0d0e39fa11c8a210b7f44f1e311f80ce761b6c6))


### Documentation

* **46-02:** add agent contract compliance audit for phase 46 ([78bca43](https://github.com/SienkLogic/plan-build-run/commit/78bca43bb1c37375c9b7bd3704d874d957f61b26))

## [2.40.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.40.0...plan-build-run-v2.40.1) (2026-02-27)


### Bug Fixes

* **hooks:** use flexible regex for PLAN file detection in hooks ([402d602](https://github.com/SienkLogic/plan-build-run/commit/402d60286b9184aa0155c0840785a8e5872872d2))

## [2.40.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.39.0...plan-build-run-v2.40.0) (2026-02-27)


### Features

* **milestone:** add push/publish step after milestone complete ([dc26503](https://github.com/SienkLogic/plan-build-run/commit/dc26503975691480e805893e1fb400cf41b01226))


### Bug Fixes

* **tools:** find per-plan SUMMARY-{id}.md files in milestone-learnings aggregation ([2ecda9f](https://github.com/SienkLogic/plan-build-run/commit/2ecda9ff555d3787e2bea92f339d7abb9afc5e04))

## [2.39.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.38.1...plan-build-run-v2.39.0) (2026-02-27)


### Features

* **45-01:** add learnings subcommands to pbr-tools.js dispatcher ([a2c9b98](https://github.com/SienkLogic/plan-build-run/commit/a2c9b98a60291611b85b086a4c274fa4ee82477b))
* **45-01:** add lib/learnings.js with schema, storage, ingest, and query ([feb6bf6](https://github.com/SienkLogic/plan-build-run/commit/feb6bf6b2b1adcedc71d0558804a722be60aac77))
* **45-03:** add deferral notifications to progress-tracker and aggregation step to milestone skill ([ac89d05](https://github.com/SienkLogic/plan-build-run/commit/ac89d05323d8b8468718bfad52181cf72b635ce6))
* **45-03:** GREEN - milestone-learnings.js aggregation script ([68fa377](https://github.com/SienkLogic/plan-build-run/commit/68fa3778937825ad09b1b38cb5b626abf68dffc1))
* **45-04:** add learnings injection to begin/SKILL.md researcher spawn step ([ebe3970](https://github.com/SienkLogic/plan-build-run/commit/ebe39702e4f04a2576b6e0ad6b7edb6e93672a4c))
* **45-04:** add learnings injection to explore/SKILL.md and plan skill planner spawn ([53644cf](https://github.com/SienkLogic/plan-build-run/commit/53644cf9601ff47341ebde40c712e99d54f34ebb))
* **45-05:** sync learnings injection and aggregation to cursor-pbr and copilot-pbr ([eef6a0c](https://github.com/SienkLogic/plan-build-run/commit/eef6a0caa5f19629d08d0cce878b51a7823b9424))
* **quick-019:** add ecosystem integration — PR creation, CI gate, issue sync, smoke test ([c57e44e](https://github.com/SienkLogic/plan-build-run/commit/c57e44ede58d167cd69ffe5403cc20645c537635))

## [2.38.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.38.0...plan-build-run-v2.38.1) (2026-02-27)


### Documentation

* **quick-018:** add TDD decision heuristic to plan-authoring reference ([b6744ab](https://github.com/SienkLogic/plan-build-run/commit/b6744abd33befddb0650f584fe8f8f3c6ebdf77f))

## [2.38.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.37.0...plan-build-run-v2.38.0) (2026-02-27)


### Features

* **quick-016:** add L4 verification, failure markers, roadmap dual format, requirement coverage ([1260623](https://github.com/SienkLogic/plan-build-run/commit/1260623f483ae0e62a22b7637bfd3400da7883df))
* **quick-016:** enhance agent success criteria and behavioral anchors from GSD gap analysis ([a3ac95a](https://github.com/SienkLogic/plan-build-run/commit/a3ac95a7cb0cfc6a44905bdbba1b2e354aabb7ea))
* **quick-017:** add migrate subcommand to pbr-tools.js dispatcher ([8b4737a](https://github.com/SienkLogic/plan-build-run/commit/8b4737aa11eca1eea46a259805bd128ff3bee2e4))
* **quick-017:** GREEN - implement migrate.js and wire CURRENT_SCHEMA_VERSION into config.js ([84beb51](https://github.com/SienkLogic/plan-build-run/commit/84beb51b77af7e4ee6db59e868df291f114e621e))
* **scripts:** add CRITICAL tier to context-bridge ([4f46411](https://github.com/SienkLogic/plan-build-run/commit/4f464114b1401de3c6bb22c3fb2baff56ce3502f))
* **skills:** add /pbr:test skill with command across all plugins ([a38d6e3](https://github.com/SienkLogic/plan-build-run/commit/a38d6e3f8fc3eda17a5810b38bd17fddaccb730a))
* **skills:** add save-defaults, load-defaults, and --repair flag ([a56d1c9](https://github.com/SienkLogic/plan-build-run/commit/a56d1c9468c7212b802b18d71b7fe951b924d1c0))
* **tools:** add todo.js library with tests ([2ba058b](https://github.com/SienkLogic/plan-build-run/commit/2ba058bb2f143333a920ef8dd14b09021d7abe11))


### Bug Fixes

* **tests:** force-add fixture todo files ignored by .gitignore ([1b89f11](https://github.com/SienkLogic/plan-build-run/commit/1b89f1178b3980b9e167d8d137e300b0f2aa9e7d))
* **tools:** clean up .bak files in atomicWrite + add agent body sync tests ([af1aba2](https://github.com/SienkLogic/plan-build-run/commit/af1aba29ed80e46ec0e901974f6c851151274579))

## [2.37.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.36.0...plan-build-run-v2.37.0) (2026-02-27)


### Features

* **01-01:** add build and plan executor gates to validate-task.js ([eb50498](https://github.com/SienkLogic/plan-build-run/commit/eb5049838fa24fc4e327f3fd63779e94a08225df))
* **01-01:** extend agent output validation to all 10 PBR agent types ([ec7d1dc](https://github.com/SienkLogic/plan-build-run/commit/ec7d1dc647ce72c3806f70a86576289991c23608))
* **01-01:** scaffold Cursor plugin directory structure and manifest ([4743cb2](https://github.com/SienkLogic/plan-build-run/commit/4743cb2598dbba1339101cc9c738869017117fe4))
* **01-02:** add skill-specific workflow rules and CRITICAL enforcement ([5b51b7e](https://github.com/SienkLogic/plan-build-run/commit/5b51b7e28ae935b1d5bfca3584d0fedd0c865c7c))
* **02-01:** add milestone, explore, import, scan write guards to checkSkillRules ([7c5bb1d](https://github.com/SienkLogic/plan-build-run/commit/7c5bb1daf6aec0db18e39f1be62393c6eb147267))
* **02-01:** port 10 agent definitions and workflow rules to Cursor format ([126fe76](https://github.com/SienkLogic/plan-build-run/commit/126fe764497186aaff24ac33782036f87b063409))
* **02-02:** add review planner gate to validate-task.js ([30f9031](https://github.com/SienkLogic/plan-build-run/commit/30f90313c6add9063f15fdff041d8bcb1671e625))
* **02-02:** strengthen ROADMAP sync warnings to CRITICAL level ([127f506](https://github.com/SienkLogic/plan-build-run/commit/127f5062d6d7006181616d0a3386a153d95f5909))
* **03-01:** add review verifier, milestone complete, and build dependency gates ([cfcf0d5](https://github.com/SienkLogic/plan-build-run/commit/cfcf0d55510ac52ec27c4ff466b751dd4635570c))
* **03-01:** port 6 core skills to Cursor format ([6c984a4](https://github.com/SienkLogic/plan-build-run/commit/6c984a4d56dfd1c3dcf40f29cc7e926775744b6c))
* **04-01:** add post-artifact validation for begin/plan/build and VERIFICATION.md ([353b8be](https://github.com/SienkLogic/plan-build-run/commit/353b8be3687db03843e0996914116231220b82a8))
* **04-01:** port 15 supporting skills to Cursor format ([ae0a8ae](https://github.com/SienkLogic/plan-build-run/commit/ae0a8aec895036a56d85b38ed7841ec800840a62))
* **05-01:** adapt hooks.json for Cursor plugin with shared script paths ([eaa1a0c](https://github.com/SienkLogic/plan-build-run/commit/eaa1a0c2d82db06c2c21eb3b680bda766562aa1c))
* **05-01:** add STATE.md validation, checkpoint manifest check, and active-skill integrity warning ([3f0c7bc](https://github.com/SienkLogic/plan-build-run/commit/3f0c7bc09ae2508ae849972057b88818f0e18eb6))
* **06-01:** add .active-skill write and cleanup to begin, plan, review, import skills ([8c1132a](https://github.com/SienkLogic/plan-build-run/commit/8c1132ab93115f27f926637c89079a701dec2c43))
* **06-01:** port templates, references, and shared fragments to Cursor plugin ([43fc161](https://github.com/SienkLogic/plan-build-run/commit/43fc1610997caf0e13523896e97e2fd6ed25d757))
* **06-02:** add CRITICAL markers to file-creation steps in begin, build, milestone, setup, pause ([5b10576](https://github.com/SienkLogic/plan-build-run/commit/5b10576334f92cbf5464362044564b6eae0977b1))
* **07-01:** add Cursor plugin validation test suite with 92 tests ([72c328e](https://github.com/SienkLogic/plan-build-run/commit/72c328e2cc939bf08d59e530afb96e3dacc4bc87))
* **07-01:** add Write tool to verifier/integration-checker and update prose across all plugins ([a9fe348](https://github.com/SienkLogic/plan-build-run/commit/a9fe348654d434ab9c0f68d53bfeb52256354225))
* **07-01:** register missing skills in check-skill-workflow.js switch statement ([63bac6f](https://github.com/SienkLogic/plan-build-run/commit/63bac6f4338d5f9d22a8ea804a6f1851118f208e))
* **07-02:** add debugger advisory gate and milestone gaps_found status check ([c5acda2](https://github.com/SienkLogic/plan-build-run/commit/c5acda2f73ea6ce7ddd21bc5e8c52990c0abdacb))
* **07-02:** add mtime-based recency checks for researcher and synthesizer output ([c3685ad](https://github.com/SienkLogic/plan-build-run/commit/c3685adb2b051fce0f7b002272daa54d770016da))
* **08-01:** add cross-plugin compatibility test suite ([bad35e7](https://github.com/SienkLogic/plan-build-run/commit/bad35e746d6d9e64e309597e20acf58d1e82363f))
* **08-01:** add inline fallback formats to 7 template-dependent agents ([f9a1038](https://github.com/SienkLogic/plan-build-run/commit/f9a1038e8145e9c0dc48affd648ec4485a5008d3))
* **08-02:** add CRITICAL markers and fix agent handoff issues ([800bf5e](https://github.com/SienkLogic/plan-build-run/commit/800bf5e2d231ad36b3f5097ff889b22bd5577544))
* **09-01:** add gate error fix guidance and discuss deep-dive CRITICAL enforcement ([8f18fb7](https://github.com/SienkLogic/plan-build-run/commit/8f18fb72674061284f11d375b73ff51a25d5c387))
* **09-01:** add health auto-fix for common corruption patterns ([22f666a](https://github.com/SienkLogic/plan-build-run/commit/22f666a943449ecff5ccb3a24eda5d464055a9b0))
* **09-01:** add marketplace documentation, logo, and finalize manifest ([6a317af](https://github.com/SienkLogic/plan-build-run/commit/6a317afbd5356065ac984782154ade5c9518e43d))
* **09-01:** add rollback safety, setup idempotency, and todo archive safety ([914cc9b](https://github.com/SienkLogic/plan-build-run/commit/914cc9bd91a821e18c65e8c9c239976ddf47fb09))
* **09-02:** rewrite ui-formatting.md with unified double-line box format ([d5d96b4](https://github.com/SienkLogic/plan-build-run/commit/d5d96b45f717e556b3e8c9c0d3a9eb3e521a03fd))
* **09-02:** update error-reporting fragment with block reason guidance ([a266081](https://github.com/SienkLogic/plan-build-run/commit/a266081a19966e2925c9c05128f3ee97ab0dd38a))
* **09-03:** replace heavy bar and thin divider banners with double-line box format in all 24 skills ([a602cbb](https://github.com/SienkLogic/plan-build-run/commit/a602cbb03d25c65c89e41422cb0c66c6a831b9ca))
* **09-03:** sync banner replacements and 09-01/09-02 changes to cursor-pbr and copilot-pbr ([c6473f8](https://github.com/SienkLogic/plan-build-run/commit/c6473f8b6908a1d8252385b49c711fd023c257c7))
* **09-04:** replace Next Up headings with double-line box format in all PBR skills ([2f30dbe](https://github.com/SienkLogic/plan-build-run/commit/2f30dbe933be1714c87250cc86ffc2047f2705c4))
* **09-04:** sync Next Up box format to cursor-pbr and copilot-pbr derivatives ([2e3b848](https://github.com/SienkLogic/plan-build-run/commit/2e3b8487840c0f2d0673259817c63041f3ca66f5))
* **11-01:** create tokens.css with dual-mode design tokens ([efcc30c](https://github.com/SienkLogic/plan-build-run/commit/efcc30c856d7c0c1e888daa2dbb27b5aaeeeaa77))
* **11-01:** refactor layout.css to use semantic design tokens ([2f13a93](https://github.com/SienkLogic/plan-build-run/commit/2f13a93032d47cd6e52b0b669dd928ed8b0f5ffa))
* **11-02:** add theme toggle button with localStorage persistence ([f2a2c9b](https://github.com/SienkLogic/plan-build-run/commit/f2a2c9b8fea7c74fa2344593ceedf3d64ecfd6c5))
* **11-02:** pin Pico.css CDN to v2.0.6 ([54fdd1f](https://github.com/SienkLogic/plan-build-run/commit/54fdd1f5c20d7b411fa0e1ffcb70b76106f48241))
* **12-01:** add current-phase middleware for sidebar context ([bef4dd8](https://github.com/SienkLogic/plan-build-run/commit/bef4dd897b202acfe61b64b492efaa4acd022b82))
* **12-01:** implement mobile overlay sidebar with backdrop ([98548db](https://github.com/SienkLogic/plan-build-run/commit/98548db578ad7db06335fdce5b94a2a5b8fbfffa))
* **12-01:** redesign sidebar with collapsible sections and current phase card ([3d3e05c](https://github.com/SienkLogic/plan-build-run/commit/3d3e05c698bdfd0980ed1c51cdb08d800b3bcc42))
* **12-02:** add breadcrumb data to routes and include partial in content templates ([ed79edd](https://github.com/SienkLogic/plan-build-run/commit/ed79edd432310162256010e5db891b8c258b2722))
* **12-02:** create breadcrumbs partial and CSS styles ([232e917](https://github.com/SienkLogic/plan-build-run/commit/232e9173bdaefe92cd5780775e96c76396dcc0b3))
* **13-01:** add milestone history expandable table with stats and deliverables ([8774c0f](https://github.com/SienkLogic/plan-build-run/commit/8774c0fe9f2ad9dd4955131fbc7a8a240af797e2))
* **13-01:** add todo filtering by priority, status, and search with bulk complete ([95e9dfd](https://github.com/SienkLogic/plan-build-run/commit/95e9dfd3ca96b25526ff8016e7791dc1d8475a91))
* **13-02:** add dependency graph route, views, and sidebar link ([f972435](https://github.com/SienkLogic/plan-build-run/commit/f9724351166d360122cb66e4c15110ee3279890e))
* **13-02:** add Mermaid dependency graph generation to roadmap service ([b194455](https://github.com/SienkLogic/plan-build-run/commit/b194455f298b2ea0660fd26936d333fbb0f1feef))
* **13-03:** add analytics route, views, and sidebar link ([431dad7](https://github.com/SienkLogic/plan-build-run/commit/431dad79bedcba831a8e7d731803f3987b82a0ac))
* **13-03:** create analytics service with git-based metrics and TTL cache ([6c8c41a](https://github.com/SienkLogic/plan-build-run/commit/6c8c41a23cdfd736a4d2bceea01502ebe64514e8))
* **14-01:** add Last-Event-ID state recovery to SSE endpoint ([4b48cf1](https://github.com/SienkLogic/plan-build-run/commit/4b48cf1d03f2b6191dc6eb7c856abaf0a1aacdf6))
* **14-01:** create custom SSE client with exponential backoff ([5b855ec](https://github.com/SienkLogic/plan-build-run/commit/5b855ec7a19c606a286fbf6b6d4f40e89afce87f))
* **14-01:** reduce chokidar stability threshold to 500ms ([8a65e43](https://github.com/SienkLogic/plan-build-run/commit/8a65e43720a17d9b37ba63f55bfe5b37e83fb80f))
* **14-02:** add hx-indicator spinners to todo complete actions ([fc8c325](https://github.com/SienkLogic/plan-build-run/commit/fc8c32583e2a2eaa5b972344777091c4ce5bc67f))
* **14-02:** add TTL cache utility and integrate into analytics and milestone services ([19bd3ea](https://github.com/SienkLogic/plan-build-run/commit/19bd3eadfa5f13368176991e525c5adbdd3b8309))
* **15-01:** add error-card styling, loading indicator, and favicon ([f48c40f](https://github.com/SienkLogic/plan-build-run/commit/f48c40fca341d9144e7fa3bf7f2c2e0db9b1d5ab))
* **15-01:** add skip-to-content link, focus-visible styles, and ARIA labels ([fe2963b](https://github.com/SienkLogic/plan-build-run/commit/fe2963b266eae933a23ea0b74859ae8655964ad5))
* **15-01:** create reusable empty-state partial and integrate into views ([be8e5f5](https://github.com/SienkLogic/plan-build-run/commit/be8e5f57dc60e4c02d2cc656a156dd450bd45fa4))
* **15-02:** GREEN - analytics, cache, SSE tests pass against existing code ([1948189](https://github.com/SienkLogic/plan-build-run/commit/1948189fd9a74912017c3901413f3f0da0f1f073))
* **15-02:** GREEN - dependencies and breadcrumbs tests pass ([9b3f987](https://github.com/SienkLogic/plan-build-run/commit/9b3f9874fb3b5d50288ef36af6cb3edb4ea91260))
* **16-01:** redesign dashboard home, fix analytics duration, add bar charts, mermaid dark mode ([ba820a1](https://github.com/SienkLogic/plan-build-run/commit/ba820a111afd8f65350ff0caa30e4a7be0c1489e))
* **17-01:** add notes page, verification viewer, milestone progress bars, dynamic footer version ([51b2092](https://github.com/SienkLogic/plan-build-run/commit/51b2092e0e89d2d31626cc94be8e5f6712b79116))
* **24-01:** add check-agent-state-write.js module ([c407826](https://github.com/SienkLogic/plan-build-run/commit/c4078264dead22d20998aeb14c35ea545289ccf5))
* **24-01:** wire agent state write blocker into pre-write-dispatch ([1adf149](https://github.com/SienkLogic/plan-build-run/commit/1adf149bb79de4750b5e7462a656a90a1de42ea6))
* **24-02:** add .auto-next fallback writes to auto_advance hard stops in build skill ([f96b05d](https://github.com/SienkLogic/plan-build-run/commit/f96b05de1da60032de889b416d2a4e978cd2ec8a))
* **25-01:** add ROADMAP.md read to continue skill for milestone boundary detection ([85077b1](https://github.com/SienkLogic/plan-build-run/commit/85077b109d17d9ef01348e489c1f2b4cdcb6c57d))
* **25-01:** GREEN - add validateRoadmap and ROADMAP.md validation to check-plan-format ([e77f0d7](https://github.com/SienkLogic/plan-build-run/commit/e77f0d7f629f8ff35be9c9718b4ec4fc54472550))
* **25-01:** GREEN - PLAN.md writes trigger ROADMAP Planning status without regression ([97c4d91](https://github.com/SienkLogic/plan-build-run/commit/97c4d91c4d0adda1b5e4caa2c632a2d26cf4a450))
* **25-02:** GREEN - add checkRoadmapWrite routing to post-write-dispatch ([d40887d](https://github.com/SienkLogic/plan-build-run/commit/d40887d1ee8d69df6f433c9b9e340d5e58dbe263))
* **25-02:** GREEN - implement isHighRisk with status regression and phase gap detection ([f46f8c9](https://github.com/SienkLogic/plan-build-run/commit/f46f8c909c69873c6a6aaf3b4a5570ab336fac3a))
* **25-02:** GREEN - implement validatePostMilestone for milestone completion checks ([a46886e](https://github.com/SienkLogic/plan-build-run/commit/a46886eafe65a636ddf9972a3a75e61c8f347d41))
* **26-02:** GREEN - add 150-line advisory warning to checkStateWrite ([7b0d0a3](https://github.com/SienkLogic/plan-build-run/commit/7b0d0a35b41fe51cc3821cd9e2a95c6bd86c438f))
* **26-02:** GREEN - add cross-plugin sync advisory hook ([fffe35c](https://github.com/SienkLogic/plan-build-run/commit/fffe35c127c81be72be901ecbc8f81ae36661ab8))
* **27-01:** add PreToolUse Read hook to block SKILL.md self-reads ([8d4775e](https://github.com/SienkLogic/plan-build-run/commit/8d4775e67d820a7ce136094e994b3d25f5c63b9a))
* **27-01:** add session length guard to auto-continue with warn at 3, hard-stop at 6 ([3ecd460](https://github.com/SienkLogic/plan-build-run/commit/3ecd4605df1edfaf8589526cbc937e886d87c1dc))
* **28-01:** add local LLM foundation — client, health, metrics, config schema, hook integrations, tests ([331f337](https://github.com/SienkLogic/plan-build-run/commit/331f337b6623e926da3f1c86491876b0565d9281))
* **29-01:** integrate local LLM into hooks — artifact classification, task validation, error classification, CLI ([1d42a14](https://github.com/SienkLogic/plan-build-run/commit/1d42a1400227680cab271f1761159de76b091e1f))
* **30-01:** add metrics display — session summaries, status skill, CLI, dashboard analytics ([4d5d614](https://github.com/SienkLogic/plan-build-run/commit/4d5d614fc246fc3a6f2a3d43fc8ae7611cf0c63f))
* **30-03:** add local-llm-metrics.service.js with getLlmMetrics and Vitest tests ([37d8e59](https://github.com/SienkLogic/plan-build-run/commit/37d8e5951d8ccea935d0ad71e99e026245a0dc47))
* **30-03:** wire getLlmMetrics into /analytics route and add Local LLM Offload section to EJS template ([e980348](https://github.com/SienkLogic/plan-build-run/commit/e980348c75a904e49d2262aafc7932a2f59a32a3))
* **31-01:** add adaptive router — complexity heuristic, confidence gate, 3 routing strategies ([91db4be](https://github.com/SienkLogic/plan-build-run/commit/91db4be5562ba05915905e931a10e47af7246e9e))
* **32-01:** add agent support — source scoring, error classification, context summarization, prompt injection ([83890f9](https://github.com/SienkLogic/plan-build-run/commit/83890f96117f8fe776248c0f28f560d960c32ce7))
* **33-01:** add shadow mode, threshold tuner, comprehensive tests, docs, cross-plugin sync ([379ce7f](https://github.com/SienkLogic/plan-build-run/commit/379ce7f6a88ec4ffa5c11dc9bf0c2c28462ec9e8))
* **34-01:** add config.features.source_scoring feature flag guard to score-source.js ([a7bd37a](https://github.com/SienkLogic/plan-build-run/commit/a7bd37a629e0fafefe4f0484deee965923f0364c))
* **34-01:** wire runShadow() into router.js post-call path for all 3 routing strategies ([06fcfb5](https://github.com/SienkLogic/plan-build-run/commit/06fcfb501c64a9769501715f0afc99978dbc7398))
* **35-01:** GREEN - add escapeHtml helper and use it in HTMX error handler path ([f29965e](https://github.com/SienkLogic/plan-build-run/commit/f29965ea450f56e71b7cef132f0fe6d3db9cfe74))
* **35-01:** GREEN - add sanitize-html post-processing to planning.repository ([440a97a](https://github.com/SienkLogic/plan-build-run/commit/440a97a08378e58eb931c5f62d2e2852561a581a))
* **35-03:** add Quick Tasks view with /quick and /quick/:id routes ([921b288](https://github.com/SienkLogic/plan-build-run/commit/921b288d327867d8033afb6fc51e3f5dd88f0657))
* **35-05:** add Audit Reports view with /audits and /audits/:filename routes ([aba41ce](https://github.com/SienkLogic/plan-build-run/commit/aba41ce7eccfcf4fedff7116ee0afb1f20cd796b))
* **35-05:** GREEN - implement audit.service.js with listAuditReports and getAuditReport ([6025452](https://github.com/SienkLogic/plan-build-run/commit/602545216c12f7472111b54db24489eab88394b0))
* **36-01:** add .status-badge--sm and .status-badge--lg variants; tokenize base badge sizing ([864afc9](https://github.com/SienkLogic/plan-build-run/commit/864afc9d542390f04dfcf4f9ef47e7ca3ef2894f))
* **36-01:** expand tokens.css with card, shadow, transition, table, and badge tokens ([62a2469](https://github.com/SienkLogic/plan-build-run/commit/62a2469f1230ef8c36ed0f72b44cd956b9d430d2))
* **36-02:** create phase-timeline.ejs and activity-feed.ejs partials ([f5ae581](https://github.com/SienkLogic/plan-build-run/commit/f5ae581819ab03e38939064aa4352e4d75f63387))
* **36-02:** GREEN - add getRecentActivity and deriveQuickActions to dashboard.service.js ([82883ae](https://github.com/SienkLogic/plan-build-run/commit/82883ae7c914a9ac26c16182aa423ea0e4848658))
* **36-02:** rework dashboard-content.ejs with status cards, timeline, activity feed, and quick actions ([54b138b](https://github.com/SienkLogic/plan-build-run/commit/54b138b38203239e27159a5bad72019fdb994d69))
* **36-03:** add prev/next phase navigation to phase detail view ([334812d](https://github.com/SienkLogic/plan-build-run/commit/334812d61632d5f0acd1ad06dba1a326bd4e6ab7))
* **36-04:** enrich getPhaseDetail with planTitle, taskCount, and mustHaves ([44a89ad](https://github.com/SienkLogic/plan-build-run/commit/44a89ad9e521aede77e0593e18843ad2d41e8e2a))
* **36-04:** overhaul plan cards to use .card component with wave, task count, and status ([1df3a6b](https://github.com/SienkLogic/plan-build-run/commit/1df3a6b17fbe6fe40d1bd38182e1ef5b05c803c9))
* **36-04:** replace commit history table with visual .commit-timeline in phase-content.ejs ([baece7b](https://github.com/SienkLogic/plan-build-run/commit/baece7b1fe9502a3f947ac67927a4beccf18e03a))
* **36-05:** add config page CSS to layout.css ([cce9a90](https://github.com/SienkLogic/plan-build-run/commit/cce9a90a20c867f63eb74c3cb66b557ee5a4f18e))
* **36-05:** add config shell page, hybrid form partial, and config CSS ([e40a82d](https://github.com/SienkLogic/plan-build-run/commit/e40a82d5e6a4ab2f0531ecd703ce37c4b0c44d9a))
* **36-05:** add config.service with readConfig, writeConfig, validateConfig (TDD) ([4df72f4](https://github.com/SienkLogic/plan-build-run/commit/4df72f400c37a313fe4b60266075203fddc88bba))
* **36-05:** add GET /config and POST /api/config routes ([150f7e4](https://github.com/SienkLogic/plan-build-run/commit/150f7e49d76315da74206a00c9d0b7d63efc9201))
* **36-06:** add GET /research and GET /research/:slug routes with HTMX support ([5a79666](https://github.com/SienkLogic/plan-build-run/commit/5a7966658417460606ab49613099acf180e62bf2))
* **36-06:** add research list and detail EJS templates with card layout and HTMX navigation ([5433ba5](https://github.com/SienkLogic/plan-build-run/commit/5433ba5b086ea5022f20c01e1a8142a9ca4b71f1))
* **36-06:** GREEN - implement research.service with listResearchDocs, listCodebaseDocs, getResearchDocBySlug ([6e50a75](https://github.com/SienkLogic/plan-build-run/commit/6e50a757c2c9e0bd224a8971f7eb195c40f563fa))
* **36-07:** add GET /requirements route and EJS templates ([e64a2a5](https://github.com/SienkLogic/plan-build-run/commit/e64a2a553240c6295cd41963ae0c9d36e5b4f065))
* **36-07:** GREEN - implement getRequirementsData service ([c3e018e](https://github.com/SienkLogic/plan-build-run/commit/c3e018e1ef9889e966975b88df5ff14ea0ca3674))
* **36-08:** add GET /logs route and GET /logs/stream SSE endpoint ([215e7a5](https://github.com/SienkLogic/plan-build-run/commit/215e7a5ffeb74b37a98b3d71dc16cafe374ffd9d))
* **36-08:** create logs EJS templates with SSE live-tail and filter controls ([baf6c78](https://github.com/SienkLogic/plan-build-run/commit/baf6c7875c58fcf4986f5c5da4befadce29e8958))
* **36-08:** GREEN - implement log.service with listLogFiles, readLogPage, tailLogFile ([34bd22e](https://github.com/SienkLogic/plan-build-run/commit/34bd22e7f496e98878f9bbac76a18c3dc7042ce7))
* **38-01:** rebuild dashboard foundation with Hono + JSX + Open Props ([533f782](https://github.com/SienkLogic/plan-build-run/commit/533f782ea3909dd42e8072e3ebccb1a76dd30309))
* **39-01:** add Command Center view with live-updating dashboard components ([9d333a2](https://github.com/SienkLogic/plan-build-run/commit/9d333a251de19b52726f9dc3ac466acf8c104a7a))
* **40-01:** add Explorer view shell with phases tab and Alpine.js tabs ([1746054](https://github.com/SienkLogic/plan-build-run/commit/1746054f37065a598e780a3cfae1ab357c5a00bd))
* **40-02:** add MilestonesTab component and milestone.service type declarations ([9393bf2](https://github.com/SienkLogic/plan-build-run/commit/9393bf220ba82eb00b707438271da504e9adfe95))
* **40-02:** add TodosTab component with TodoListFragment and TodoCreateForm ([86c178c](https://github.com/SienkLogic/plan-build-run/commit/86c178ca6fb22eff43aafa10b42323ef72846e68))
* **40-02:** wire todos and milestones routes into explorer.routes.tsx ([7e0071e](https://github.com/SienkLogic/plan-build-run/commit/7e0071e179647d58375bc5055ae627045091a9fa))
* **40-03:** add NotesTab, AuditsTab, and QuickTab components ([fa98f5b](https://github.com/SienkLogic/plan-build-run/commit/fa98f5b907c18de4ee328051714cc5947e6e6bb6))
* **40-03:** add ResearchTab and RequirementsTab components with requirements CSS ([d5cccdc](https://github.com/SienkLogic/plan-build-run/commit/d5cccdc398dee7d113f5abfa6b1119de16ac7814))
* **40-03:** wire research, requirements, notes, audits, quick routes; add service .d.ts files ([6ee4421](https://github.com/SienkLogic/plan-build-run/commit/6ee4421e734f218d563ca957d659d6a2547a0204))
* **41-01:** create timeline routes, wire into app, link timeline CSS in Layout ([2daf291](https://github.com/SienkLogic/plan-build-run/commit/2daf291f26b83736b6dc70ea040ed11b563487c8))
* **41-01:** create timeline.service.js with event aggregation and filtering ([49ea52a](https://github.com/SienkLogic/plan-build-run/commit/49ea52a84878065c0ce5a84f22b22b94f1deae89))
* **41-01:** create TimelinePage component, EventStreamFragment, and timeline CSS ([380ae24](https://github.com/SienkLogic/plan-build-run/commit/380ae24e73d0aac74f71cc15b5575191399e556d))
* **41-02:** add analytics and dependency-graph routes; refactor TimelinePage with section tabs ([1444176](https://github.com/SienkLogic/plan-build-run/commit/1444176156ce3c9f8b75dc52c72989f3c1f5fe5b))
* **41-02:** add analytics/graph CSS sections and Mermaid CDN to Layout ([865d647](https://github.com/SienkLogic/plan-build-run/commit/865d6473b8b5981517814e89ce417304aae167f3))
* **41-02:** add AnalyticsPanel and DependencyGraph components ([5786e02](https://github.com/SienkLogic/plan-build-run/commit/5786e029069082d01cda51a46a8863ebdda113de))
* **42-01:** create settings routes, CSS, wire into app, and add config.service.d.ts ([fc24060](https://github.com/SienkLogic/plan-build-run/commit/fc24060ecb165b6468bd377c340877584a5eb09e))
* **42-01:** create SettingsPage shell and ConfigEditor component (form + raw JSON modes) ([ed2a579](https://github.com/SienkLogic/plan-build-run/commit/ed2a57943c0ef9f5b379607fcfe48f8f2e5d8f98))
* **42-02:** add log viewer routes (page, entries, SSE tail) and CSS ([3656fef](https://github.com/SienkLogic/plan-build-run/commit/3656fef638bbb6bed8146555a0a5f7922d3acc24))
* **42-02:** add LogFileList, LogEntryList, and LogViewer components ([98998bb](https://github.com/SienkLogic/plan-build-run/commit/98998bbe84004e91ffba6809ec6ba198e4babc82))
* **44-01:** add inline SVG icons to sidebar nav and brand area ([4c31c64](https://github.com/SienkLogic/plan-build-run/commit/4c31c641e21997817386f6e806fd738c699fd98c))
* **44-01:** create StatCardGrid component and stat-card CSS system ([e1921cf](https://github.com/SienkLogic/plan-build-run/commit/e1921cfe939bca0417ee14dda8b4d6c0b883a8df))
* **44-01:** wire StatCardGrid into command-center route replacing StatusHeader+ProgressRing ([bc264a4](https://github.com/SienkLogic/plan-build-run/commit/bc264a4551929f7c1fb43ebda6e065fdb69e3708))
* **44-02:** add empty-state CSS component and apply to AttentionPanel and QuickActions ([92dc66e](https://github.com/SienkLogic/plan-build-run/commit/92dc66e95b9937b93b2cf4bed493d280aaa1e1cc))
* **44-02:** enhance Explorer phases rows and add status/priority filter selects to todos toolbar ([9434b3e](https://github.com/SienkLogic/plan-build-run/commit/9434b3e4ef190bbc4e6b42133e1ecf92161e6dfb))
* **44-02:** restructure Command Center into 2-column cc-two-col grid layout ([a602139](https://github.com/SienkLogic/plan-build-run/commit/a602139851abda7c7b031ac49d466c63595e768c))
* **44-03:** consolidate btn system into layout.css, add card hover shadow and cursor:pointer ([ec24c38](https://github.com/SienkLogic/plan-build-run/commit/ec24c3895b66706f7db363aa2ccd82d68fe79354))
* **44-03:** unify section label typography via --section-label-* tokens ([46b326e](https://github.com/SienkLogic/plan-build-run/commit/46b326e8c634a4f23a2e346283bdbda2a8b55932))
* **dashboard:** add responsive mobile layout with sidebar hamburger menu ([d95ee38](https://github.com/SienkLogic/plan-build-run/commit/d95ee38f71f471bd22dac818cbb34bda60d408ce))
* **quick-003:** add data-flow to plan-format reference, verification template, and integration report template ([8f61b02](https://github.com/SienkLogic/plan-build-run/commit/8f61b02a759632556e47f79b14f7c36d39aa57a3))
* **quick-003:** add data-flow verification to planner, verifier, and integration-checker agents ([eea56bc](https://github.com/SienkLogic/plan-build-run/commit/eea56bc1bba18a5a642ee52d6a9106a151f93aff))
* **quick-004:** add local LLM token counter to statusline ([52dbd8e](https://github.com/SienkLogic/plan-build-run/commit/52dbd8e960efb70f3de9f2bfbf8e046708d68ce0))
* **quick-004:** show session + lifetime LLM stats using stdin duration ([4fd0672](https://github.com/SienkLogic/plan-build-run/commit/4fd0672d184593e14f8e48e53ba72c6e4d49955d))
* **quick-008:** add block mode to checkNonPbrAgent for stronger enforcement ([5bd3614](https://github.com/SienkLogic/plan-build-run/commit/5bd361429a53f984fb1fcea69d76bf0ca1a4705c))
* **quick-008:** inject PBR workflow directive into SessionStart and PreCompact hooks ([e6fee97](https://github.com/SienkLogic/plan-build-run/commit/e6fee972cae9b551de16175607bd31da98d6f5c0))
* **quick-011:** add mobile responsive sidebar with hamburger toggle ([c0f4b23](https://github.com/SienkLogic/plan-build-run/commit/c0f4b2306e859a3c033dd63ee0ad61b21a7293a4))
* **quick-011:** fix status badge data-status attrs and mermaid dark mode ([b73eece](https://github.com/SienkLogic/plan-build-run/commit/b73eece54c5f4d510676b3e8acaa2d1b0ab01eae))
* **quick-013:** Wave C — completion markers, file read protocol, XML enhancement, context tiers ([1ff6148](https://github.com/SienkLogic/plan-build-run/commit/1ff61487bafac196723b1d368b9e6b418e8bbba9))
* **quick-014:** Wave D — inline deviation rules, scope boundaries, self-check hardening, spot-checks ([f6c377b](https://github.com/SienkLogic/plan-build-run/commit/f6c377b9120f2a12f5e671c8d48d7b0a56a30214))
* **quick-014:** Wave E + review fixes — context bridge, files_to_read, B3 completion, XML nesting ([27db68c](https://github.com/SienkLogic/plan-build-run/commit/27db68cc39fab486dbf90f482ab128852905c183))
* **tools:** add /pbr:audit skill for session compliance and UX review ([8e942bc](https://github.com/SienkLogic/plan-build-run/commit/8e942bcd2836e0fb6f0b425eddb39ebf6c5b7659))
* **tools:** add /pbr:dashboard skill with auto-launch on session start ([1ca0425](https://github.com/SienkLogic/plan-build-run/commit/1ca042584783bdfbc762fe5661b5c62e31ffcdfc))
* **tools:** add /pbr:do freeform router and smart skill suggestions in hook ([b19533e](https://github.com/SienkLogic/plan-build-run/commit/b19533ef6f57f890130d128d5816058bac3c63a7))
* **tools:** add /pbr:statusline command to install PBR status line ([f1266aa](https://github.com/SienkLogic/plan-build-run/commit/f1266aa01ed0dda9eff41da47f10287342b6b0d5))
* **tools:** add 3 local LLM operations — classify-commit, triage-test-output, classify-file-intent ([55c2558](https://github.com/SienkLogic/plan-build-run/commit/55c255887af3562eef823314f79a4db6baa7b261))
* **tools:** add D10 test plan coverage dimension to plan-checker agent ([cf36b60](https://github.com/SienkLogic/plan-build-run/commit/cf36b604371c5c6e27aa476e27b2bf782ca175a2))
* **tools:** add EnterPlanMode interception hook to redirect to PBR commands ([6b7b9f9](https://github.com/SienkLogic/plan-build-run/commit/6b7b9f94b1ebdeda207670083f5f78873964c7aa))
* **tools:** add freeform text guard hook for /pbr:plan and todo work subcommand ([42c6527](https://github.com/SienkLogic/plan-build-run/commit/42c65270ee72045a718f6111388a839d54c7a7e7))
* **tools:** add GitHub Copilot CLI plugin port ([64bb081](https://github.com/SienkLogic/plan-build-run/commit/64bb081a1739a9b8fac111f5f7d259f9d04cf39a))
* **tools:** add help docs, concurrent tests, and discuss requirements surfacing ([ef66bdc](https://github.com/SienkLogic/plan-build-run/commit/ef66bdcff94dd641a8f1a2972efac67d48200e7a))
* **tools:** add local LLM skill-level fallbacks and platform compatibility docs ([92abfc7](https://github.com/SienkLogic/plan-build-run/commit/92abfc7bc219c85b408593e8c0944db712bf07b9))
* **tools:** add milestone preview subcommand across all plugins ([a9b65fc](https://github.com/SienkLogic/plan-build-run/commit/a9b65fc142f59a24b0f3a06f303b33d3e25d55cf))
* **tools:** add milestones page to dashboard with archived milestone support ([de96735](https://github.com/SienkLogic/plan-build-run/commit/de96735af69fb14befdfc9d08f767d9fa5a13f97))
* **tools:** add post-compaction recovery, pbr-tools CLI reference, and dashboard UI banner ([9cc8f30](https://github.com/SienkLogic/plan-build-run/commit/9cc8f304072cd9f79fd18c94f25cafccf5e00163))
* **tools:** add PR title validation and improved PR template ([f33c5a7](https://github.com/SienkLogic/plan-build-run/commit/f33c5a79d290c404f177b473caffdc8d7a2afe58))
* **tools:** add PreToolUse additionalContext soft warnings for risky operations ([adb77ae](https://github.com/SienkLogic/plan-build-run/commit/adb77aee7444a5058f94a6f17bcbedc3f27643e9))
* **tools:** add review verifier post-check and stale active-skill detection ([37d819a](https://github.com/SienkLogic/plan-build-run/commit/37d819acc59b30e5d86eb2ea672d3f13122b1beb))
* **tools:** add rollback downstream invalidation, complete help docs, dashboard route tests ([bb4bcb1](https://github.com/SienkLogic/plan-build-run/commit/bb4bcb111b25284764d546f46411b844b8069a4d))
* **tools:** add run-hook.js wrapper for Windows MSYS path normalization ([20286c3](https://github.com/SienkLogic/plan-build-run/commit/20286c32bd6477eba4b075d11c7ebfdf90d0dd57))
* **tools:** add scan mapper area validation and stale Building status detection ([110db29](https://github.com/SienkLogic/plan-build-run/commit/110db29f5444c716e9558935c3e4b12cc9ab6fab))
* **tools:** add stale active-skill session-start warning and copilot hook limitation docs ([8dfcffa](https://github.com/SienkLogic/plan-build-run/commit/8dfcffa5442f0579435d2db1232215335f6167b4))
* **tools:** add state-sync plans_total fix, anti-pattern rule for Skill-in-Task, and social images ([8a2c784](https://github.com/SienkLogic/plan-build-run/commit/8a2c784469dcccb74388838348c6f31adcc89df1))
* **tools:** add STATE.md backup step before health skill auto-fix regeneration ([173cde6](https://github.com/SienkLogic/plan-build-run/commit/173cde6d90966f13ab048ba268bd3afb8b59c70e))
* **tools:** add summary gate hook to enforce SUMMARY before state advance ([55a0bd4](https://github.com/SienkLogic/plan-build-run/commit/55a0bd4578f8f122b0d3618552f51474a62431dd))
* **tools:** add worktree isolation, ConfigChange hook, and claude agents docs ([8b3d821](https://github.com/SienkLogic/plan-build-run/commit/8b3d82108febfa5a5ec80a37bcbee7a652b3beb5))
* **tools:** archive milestones into versioned directories with phase migration ([5951613](https://github.com/SienkLogic/plan-build-run/commit/5951613fa8d27b99b9a07523364a9ba7f8ac2fd9))
* **tools:** auto-close satisfied pending todos after quick task and build completion ([56ead9d](https://github.com/SienkLogic/plan-build-run/commit/56ead9d46ece7b4c6164dd983ca79e6a195db18c))
* **tools:** completion markers, file-read protocol, spot-checks for secondary skills ([efd9dc9](https://github.com/SienkLogic/plan-build-run/commit/efd9dc908c8ce523794195133beddd33e6fccdaa))
* **tools:** enable project-scoped memory for planner agent ([fb6da2d](https://github.com/SienkLogic/plan-build-run/commit/fb6da2d3fc70ebe911803ee23c4374fa30612da3))
* **tools:** GSD gap implementation — pbr-tools split, bug fixes, behavioral tests ([12cfaa6](https://github.com/SienkLogic/plan-build-run/commit/12cfaa6c93bdb541d3408377d8d75c93f78ea8d5))
* **tools:** integrate milestones into workflow lifecycle ([35bf5b7](https://github.com/SienkLogic/plan-build-run/commit/35bf5b7addfa03914012a9cc6c73eece59f2267e))
* **tools:** rebrand towline to plan-build-run ([2ce02a7](https://github.com/SienkLogic/plan-build-run/commit/2ce02a7422f7e8a5ccd9098e0cd3e06126ce6e65))
* **tools:** require user confirmation before debugger agent applies fixes ([604e775](https://github.com/SienkLogic/plan-build-run/commit/604e77592cee630a74dc2f2b71671e6fa3dbd3c5))
* **tools:** resolve exploration backlog — fix script bugs, add copilot hooks, improve recovery ([ef9e81a](https://github.com/SienkLogic/plan-build-run/commit/ef9e81a662d11402c261e3acb638fc0005045d42))
* **tools:** use last_assistant_message in Stop/SubagentStop hooks ([7894c5e](https://github.com/SienkLogic/plan-build-run/commit/7894c5ecebba9ee600234ebf665d8fc422a220d6))
* **tools:** Wave B — compound init commands, bug fixes, and reference upgrades ([78deaa6](https://github.com/SienkLogic/plan-build-run/commit/78deaa6890b6c513ac1826161552beef6719109b))


### Bug Fixes

* **01-01:** add cursor-pbr entry to marketplace manifest (PLUG-03) ([2ac7ca1](https://github.com/SienkLogic/plan-build-run/commit/2ac7ca1ff7c3880f4e610433969e382c4695f19d))
* **01-01:** hasPlanFile now matches numbered plan files like PLAN-01.md ([c0a4a6d](https://github.com/SienkLogic/plan-build-run/commit/c0a4a6d279497cce6593b9825537fbba8cda6c9e))
* **01-02:** add plan skill write-guard to check-skill-workflow.js ([9c07bc4](https://github.com/SienkLogic/plan-build-run/commit/9c07bc4e725dc3655fc4a86cbbb6df7a92c3f038))
* **06-01:** add skill-local templates and prompt-partials missed in initial port ([8279c57](https://github.com/SienkLogic/plan-build-run/commit/8279c576951c37cc461373a3ee4732337a39b51b))
* **06-03:** fix planner naming convention, executor timestamps, and statusline backup ([55ecd12](https://github.com/SienkLogic/plan-build-run/commit/55ecd12810d01e1c522da7659dde8b0f4627bbf9))
* **09-01:** use relative path for logo in plugin manifest ([341bacf](https://github.com/SienkLogic/plan-build-run/commit/341bacf776b31a321e1b2ac06678c8072b4addf0))
* **14-01:** add missing #sse-status element to header ([7a2b7ba](https://github.com/SienkLogic/plan-build-run/commit/7a2b7ba5b451ff87a9435c45feecf4ef76f794f1))
* **14-02:** clear milestone cache between tests to prevent stale data ([449f15e](https://github.com/SienkLogic/plan-build-run/commit/449f15ec05d8aecea14d4ea5c8a533747f73959d))
* **18-01:** HTMX navigation consistency, SSE tooltip, error page fix, remove deprecated layout ([79ddc58](https://github.com/SienkLogic/plan-build-run/commit/79ddc588b29329cff878ceea813be9e8d8cef5f8))
* **23-01:** register /pbr:do command and fix critical audit findings ([d73e8a7](https://github.com/SienkLogic/plan-build-run/commit/d73e8a7acdcb5bf9b9494de66eb73312c2d36204))
* **23-02:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in cursor-pbr ([e36c614](https://github.com/SienkLogic/plan-build-run/commit/e36c6145da3d27f1a6f0cea1290a1245208bf1f3))
* **23-03:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in copilot-pbr ([27181a4](https://github.com/SienkLogic/plan-build-run/commit/27181a47d056183266bb12bf2131bf1f3cd250d0))
* **23-04:** replace subagents terminology with agents in cursor-pbr ([f5af300](https://github.com/SienkLogic/plan-build-run/commit/f5af300cabedf3c8f45217b4c46c90f22ef65031))
* **23-05:** fix subagents terminology in copilot-pbr and sync ROADMAP template ([9b999f0](https://github.com/SienkLogic/plan-build-run/commit/9b999f080711f7515db95d71245a2e0f826d6403))
* **23-07:** strip hookSpecificOutput wrapper from check-phase-boundary and pre-write-dispatch ([19db6d6](https://github.com/SienkLogic/plan-build-run/commit/19db6d634f023c86bfe1e51d259c815d813aca60))
* **23-09:** reorder copilot-pbr hooks.json postToolUseFailure before preToolUse to match pbr canonical ordering ([d8003d8](https://github.com/SienkLogic/plan-build-run/commit/d8003d808b614bfc4bab77c524b0931413dc8171))
* **23-09:** use decision:block in validate-skill-args.js, remove orphaned JSDoc in validate-task.js ([ada9e3d](https://github.com/SienkLogic/plan-build-run/commit/ada9e3d0914e6d47c190792d3f66340ca22e3857))
* **23-10:** correct dispatch table — move check-doc-sprawl and check-skill-workflow to pre-write-dispatch ([e1709f7](https://github.com/SienkLogic/plan-build-run/commit/e1709f70b8262d1c673ea80895cda7086c6de45b))
* **23-10:** remove dead body from checkStatuslineRules in check-skill-workflow.js ([8bf0218](https://github.com/SienkLogic/plan-build-run/commit/8bf0218f69aa040bbcfc87e11d8b602f6d9958bb))
* **23-10:** remove redundant allowed-tools Note from health SKILL.md Auto-Fix section ([93757f2](https://github.com/SienkLogic/plan-build-run/commit/93757f200ee6f77bd173d02d84e7e8e25edac5c1))
* **23-12:** fix remaining subagents terminology in scan SKILL.md derivatives ([8d49259](https://github.com/SienkLogic/plan-build-run/commit/8d4925943ab8cde0521843636bb1c81b2e388ece))
* **23-12:** fix test property paths and heredoc extraction to achieve 70% branch coverage ([85f0fa1](https://github.com/SienkLogic/plan-build-run/commit/85f0fa14fb9ea1c904f402ac8a2129ca5e22c56b))
* **23-12:** remove excess tool grants from synthesizer and plan-checker agents ([3e1284d](https://github.com/SienkLogic/plan-build-run/commit/3e1284d129e9b6ebdc1a53f8e02bbddef63337d8))
* **24-01:** remove building from ADVANCED_STATUSES gate ([36bd3da](https://github.com/SienkLogic/plan-build-run/commit/36bd3daa43c4463da0f34234ddd1f7816c26b24d))
* **24-02:** raise consecutive-continue guard threshold from 3 to 6 ([069b385](https://github.com/SienkLogic/plan-build-run/commit/069b385df469712db0abe3eb64424bfbddd2164c))
* **24-02:** remove .auto-next cleanup from session-cleanup to prevent race with Stop hook ([64b72d2](https://github.com/SienkLogic/plan-build-run/commit/64b72d200d1475f1d2ecb21260c163fdd69d2348))
* **25-02:** remove unused path import and result variable (lint) ([c63b390](https://github.com/SienkLogic/plan-build-run/commit/c63b3904ec532cf6ba353fb922384876ee7d6364))
* **26-01:** add CRITICAL dual-update markers to import Step 8b and milestone new Step 8 ([2652908](https://github.com/SienkLogic/plan-build-run/commit/26529088bd2f1e8c998a4f2fc6bd87489d3655d9))
* **26-01:** add CRITICAL frontmatter update marker to pause skill STATE.md step ([880ec8d](https://github.com/SienkLogic/plan-build-run/commit/880ec8d937d6befca07b7db43525da6cbacabe27))
* **26-02:** sync cross-plugin-sync hook to cursor-pbr and copilot-pbr hooks.json ([73e0470](https://github.com/SienkLogic/plan-build-run/commit/73e0470f48c97d4635ca801505f55eca4b0933b8))
* **36-01:** replace hardcoded CSS values with design tokens and expand config.service.js ([284fcf2](https://github.com/SienkLogic/plan-build-run/commit/284fcf270ead0ab7688cb6b1017f31891cd34c3d))
* **36-02:** add typeof guard for quickActions in dashboard template ([e75c4d1](https://github.com/SienkLogic/plan-build-run/commit/e75c4d129537ab4d4af30b6b66a45285376298f7))
* **36-08:** improve dashboard UX across 12 pages with 16 visual fixes ([7c51cb8](https://github.com/SienkLogic/plan-build-run/commit/7c51cb874e1868b7d92caf8dde380defe66ad2d5))
* **37-05:** fix breadcrumb icon, milestone spacing, summary lookup, and config mode dropdown ([d5661fd](https://github.com/SienkLogic/plan-build-run/commit/d5661fd01150adc9d9d889af4a68857c739c79c8))
* **40-02:** use JSX-compatible hx-on attribute syntax in TodoCreateForm ([d9cd51d](https://github.com/SienkLogic/plan-build-run/commit/d9cd51d9e7cc6c2e2e4df82d608c323d7ca04fdf))
* **42-02:** move beforeunload cleanup to addEventListener for JSX compatibility ([b93b0e4](https://github.com/SienkLogic/plan-build-run/commit/b93b0e4dcb0dc4db85408fd6db11fe683e5b3270))
* **43-02:** use tsx runtime with absolute static path for cross-cwd dashboard launch ([605c99d](https://github.com/SienkLogic/plan-build-run/commit/605c99d604c60db06477f87deac2e89bd5b3cc45))
* **dashboard:** handle todo files with H1 title and high/medium/low priority ([a8dadcf](https://github.com/SienkLogic/plan-build-run/commit/a8dadcfe3b7226c2af8406df3a8dfe627b2c1cf5))
* **dashboard:** plan count regex and mermaid rendering ([a423a7c](https://github.com/SienkLogic/plan-build-run/commit/a423a7c0c336a1907c6c22b27d94495dfa857018))
* **dashboard:** show completed milestones on roadmap when all phases archived ([a3469dc](https://github.com/SienkLogic/plan-build-run/commit/a3469dc2f399ff32241a0ad0630f980ee6b1b759))
* **quick-001:** fix agent prompt issues from audit (items 4-7) ([bf9cde2](https://github.com/SienkLogic/plan-build-run/commit/bf9cde2a9ba2b74ea4b523ab49e6101b6e26bb83))
* **quick-001:** fix agent prompt issues from audit (items 8-10) ([ca374fc](https://github.com/SienkLogic/plan-build-run/commit/ca374fc002b955893c38e5c8b7ceeaeb7c8398d3))
* **quick-001:** fix STATE.md body drift, stale status line, and ROADMAP sync gaps ([994977c](https://github.com/SienkLogic/plan-build-run/commit/994977c196c0d4f3f851e5ad6c7049fb1952d858))
* **quick-003:** pass data.session_id to LLM operations instead of undefined ([6670377](https://github.com/SienkLogic/plan-build-run/commit/6670377a42a5030c11283f7578ad3c882a15b2aa))
* **quick-004:** render LLM stats on second line with explicit Local LLM label ([89a8dae](https://github.com/SienkLogic/plan-build-run/commit/89a8dae9aa390788e7513149e01d946b038b5918))
* **quick-006:** bump vitest to ^4.0.18 to match @vitest/coverage-v8 peer dep ([a959641](https://github.com/SienkLogic/plan-build-run/commit/a9596419355803f031c7e71ff649ffd33ca7a3ab))
* **quick-007:** correct todo test to match title fallback behavior (H1 heading recovery) ([8e5012d](https://github.com/SienkLogic/plan-build-run/commit/8e5012d84843d96dc780888dba200f81e5f85c45))
* **quick-008:** propagate block exit code from checkNonPbrAgent in validate-task dispatcher ([f02fc19](https://github.com/SienkLogic/plan-build-run/commit/f02fc198e1e7d9eb8be17a85805a413e250be2a0))
* **quick-009:** fix dashboard UX across milestones, timeline, logs, todos, and layout ([0b09776](https://github.com/SienkLogic/plan-build-run/commit/0b09776c7251c3587587c637e107514462c30c14))
* **quick-010:** use lockedFileUpdate for atomic writes, fix shell injection, add writeActiveSkill ([c18107d](https://github.com/SienkLogic/plan-build-run/commit/c18107d05a29558b8d7167609128ade4f83c0baf))
* **quick-011:** move hamburger button outside sidebar for correct fixed positioning ([2034b2d](https://github.com/SienkLogic/plan-build-run/commit/2034b2deb77c2bdf584282879f561a72d90929eb))
* **quick-012:** remove cursor-pbr from Claude Code marketplace listing ([5baf0be](https://github.com/SienkLogic/plan-build-run/commit/5baf0be27015411e69f7d6f9f148029d1d3502ea))
* **quick-012:** remove unrecognized 'platform' key from marketplace.json ([d4c91d4](https://github.com/SienkLogic/plan-build-run/commit/d4c91d436f1460d8fdd5e18642e5d7d83a39e7bc))
* **quick-014:** add /clear recommendations to derivative plugin completion sections ([1bc81da](https://github.com/SienkLogic/plan-build-run/commit/1bc81da6a7c0f1b130afbf803e9675205437f462))
* **quick-014:** review pass 2 — XML nesting, KNOWN_AGENTS prefix, completion markers, spot-check sync ([836e47d](https://github.com/SienkLogic/plan-build-run/commit/836e47dcdf649340f15ab72782006c366d832fae))
* **tools:** add --repo flag to gh pr merge in release workflow ([dffd1ed](https://github.com/SienkLogic/plan-build-run/commit/dffd1ede2abaef29333dcb6e184de5a2ba26ccef))
* **tools:** add commonjs package.json to scripts for ESM project compat ([b2f59eb](https://github.com/SienkLogic/plan-build-run/commit/b2f59eb2938da8c6ff1300c18134e4f1e9d00614))
* **tools:** add milestone routing to explore skill completion ([9629c34](https://github.com/SienkLogic/plan-build-run/commit/9629c343d41f4ba61b7129a51ce7f958058e8607))
* **tools:** add pull_request trigger to CI so branch protection checks pass ([ffbe56b](https://github.com/SienkLogic/plan-build-run/commit/ffbe56b63fd297e72ba09836c5c854a1f2177747))
* **tools:** add Skill tool to 4 PBR skills that use auto-advance chaining ([e073cb7](https://github.com/SienkLogic/plan-build-run/commit/e073cb752c2e26254512c204cadc2a2765142231))
* **tools:** auto-route quick skill to plan skill when user selects Full plan ([8b471d8](https://github.com/SienkLogic/plan-build-run/commit/8b471d8d58bbe0f08ef818e2dc2423c8e698beef))
* **tools:** comprehensive codebase review — 33 improvements across 7 waves ([16d3f34](https://github.com/SienkLogic/plan-build-run/commit/16d3f342c8814517a1ddb98c5af84e39e1f3ef9e))
* **tools:** dashboard derives phase statuses from STATE.md frontmatter ([f30b48d](https://github.com/SienkLogic/plan-build-run/commit/f30b48dd30c191f90cdabfe2f1cac058ec7d628a))
* **tools:** dashboard parses H3-style ROADMAP.md phases and flexible bold syntax ([bcf6f8f](https://github.com/SienkLogic/plan-build-run/commit/bcf6f8f430e20411ec0b2831c22a7be963ca895e))
* **tools:** dashboard service and route improvements ([191eae1](https://github.com/SienkLogic/plan-build-run/commit/191eae10188521632dcf780c874d1f3ba3f40c26))
* **tools:** enforce quick task directory creation with CRITICAL markers and hook validation ([12a4fcc](https://github.com/SienkLogic/plan-build-run/commit/12a4fcc86722be30dbd7c8d22075b571da03d579))
* **tools:** exclude plugin files from context budget tracking + skill refinements ([6ed0c43](https://github.com/SienkLogic/plan-build-run/commit/6ed0c43132dbd6574c63b05f5c9e03f16bd9ab39))
* **tools:** extend executor commit check to quick skill and add .catch() to log-tool-failure ([23f52d7](https://github.com/SienkLogic/plan-build-run/commit/23f52d7b8db4d63f84619fcc1f9e7131828bcf8f))
* **tools:** fix CI lint errors and macOS symlink test failure ([2b85f6b](https://github.com/SienkLogic/plan-build-run/commit/2b85f6b68d07390452769be23b1751525dafc4ad))
* **tools:** fix lint errors and bump version to 2.1.0 ([5d88416](https://github.com/SienkLogic/plan-build-run/commit/5d8841632af6934ca704cf7bb201c42a4254db7a))
* **tools:** fix release workflow auth and CI lint paths ([4774474](https://github.com/SienkLogic/plan-build-run/commit/47744742c04fac89a822ce608bae777f57820fae))
* **tools:** handle concurrent write corruption in flaky test across platforms ([1b5b129](https://github.com/SienkLogic/plan-build-run/commit/1b5b129eec546323ca13a94b6acfebf6850d1f0a))
* **tools:** handle empty string race in concurrent .active-skill test on Windows ([fd1628f](https://github.com/SienkLogic/plan-build-run/commit/fd1628ff0528f74f766e593cc0f2353a4d504308))
* **tools:** improve dashboard markdown rendering and font loading ([59fd4c2](https://github.com/SienkLogic/plan-build-run/commit/59fd4c21482239d0410fc176d1303c28d81200f2))
* **tools:** lower coverage thresholds to match actual coverage after validate-task.js addition ([df1c396](https://github.com/SienkLogic/plan-build-run/commit/df1c396cd22a1f8246d2dbb58a63f13760f784bc))
* **tools:** parse simple two-column roadmap table in dashboard ([69f5a6f](https://github.com/SienkLogic/plan-build-run/commit/69f5a6f9e129926b660b34acb0e80012bf90e2dc))
* **tools:** prefix unused name var with underscore in version sync test ([a534b05](https://github.com/SienkLogic/plan-build-run/commit/a534b059e99c816c8b7053b1f33bf92bad41643a))
* **tools:** prevent lifetime LLM metrics from plateauing at 200 entries ([a62f5d8](https://github.com/SienkLogic/plan-build-run/commit/a62f5d837efce2b1aa48c5920f809d278ad4e53d))
* **tools:** remove platform-specific rollup dep from dashboard devDependencies ([009e17c](https://github.com/SienkLogic/plan-build-run/commit/009e17c39734bb3d1655906ec48186bd37360cbe))
* **tools:** remove unsupported --local flag from Copilot plugin install ([2f7bd2b](https://github.com/SienkLogic/plan-build-run/commit/2f7bd2bcb45d695713638e40539c0ccbf168efe6))
* **tools:** resolve lint errors in cross-plugin compat tests ([1bb6fd5](https://github.com/SienkLogic/plan-build-run/commit/1bb6fd5066189f27f9dee58d49533e28bb9f9556))
* **tools:** resolve lint errors in statusline workflow rules ([b801059](https://github.com/SienkLogic/plan-build-run/commit/b801059ce0d3361434a687a318a95b96a97313d6))
* **tools:** resolve markdownlint errors in planner agent and milestone skill ([178da16](https://github.com/SienkLogic/plan-build-run/commit/178da160313900472dcd3de9efe8ee111039b4d9))
* **tools:** resolve npm audit vulnerabilities via overrides ([fb7c798](https://github.com/SienkLogic/plan-build-run/commit/fb7c7989a8b2cb7eef0445a98331aa799d262f74))
* **tools:** revert npm overrides and relax audit level to critical ([b81015b](https://github.com/SienkLogic/plan-build-run/commit/b81015b126683c44fc0ab3abf8f10bb5c7ea9ba0))
* **tools:** revert release branch CI trigger (using non-strict protection instead) ([23a54c1](https://github.com/SienkLogic/plan-build-run/commit/23a54c11a87080a07fa70342aee1b1a4997e4aee))
* **tools:** standardize error messages with severity prefix and actionable next-steps ([7ab926c](https://github.com/SienkLogic/plan-build-run/commit/7ab926cdecffa0793b70529a9ed06205e7f0a9b9))
* **tools:** sync dashboard skill argument-hint to cursor plugin ([a180529](https://github.com/SienkLogic/plan-build-run/commit/a180529ae577c523332f368fa7792038408c91c0))
* **tools:** sync dashboard skill paths and missing templates across all plugins ([44e61ac](https://github.com/SienkLogic/plan-build-run/commit/44e61ac996db1a4cdf2d475e24f425ad442b3654))
* **tools:** trigger CI on release-please branch pushes for auto-merge ([f103a27](https://github.com/SienkLogic/plan-build-run/commit/f103a2739bbb5f452a76f2ea6e9771aa4459c04a))
* **tools:** update AskUserQuestion audit to reflect health skill auto-fix gates ([952a67f](https://github.com/SienkLogic/plan-build-run/commit/952a67ff5287a6e30f23b3f7eddeaf187f862c19))
* **tools:** update critical agents to use model: sonnet instead of inherit ([d3c77b2](https://github.com/SienkLogic/plan-build-run/commit/d3c77b2d85cd1d4a8c49c92b06d6ab6db5d2ab5a))
* **tools:** update validation script to handle run-hook.js bootstrap pattern ([080c6eb](https://github.com/SienkLogic/plan-build-run/commit/080c6eb3f3ad59e7a2c516f8e94d719daaacfed4))
* **tools:** use RELEASE_PAT for release-please to trigger CI on PRs ([5bbd50e](https://github.com/SienkLogic/plan-build-run/commit/5bbd50e7771df0409f35f5f229f855513a30bf8c))
* **tools:** warn on context budget tracker reset and roadmap sync parse failures ([32ce00f](https://github.com/SienkLogic/plan-build-run/commit/32ce00fafa4906801bbffcbd440658e933833522))


### Documentation

* **08-03:** add agent-contracts.md reference documenting handoff schemas ([33e148e](https://github.com/SienkLogic/plan-build-run/commit/33e148e4761e261d0b1b65a2ab9e783269bae080))
* **09-01:** add setup scripts and improve installation instructions ([44ad95d](https://github.com/SienkLogic/plan-build-run/commit/44ad95d710d7491b0fb6ff8292c30fe81de20075))
* **10-01:** wire agent-contracts.md into agents and document abandoned debug resolution ([0d9159e](https://github.com/SienkLogic/plan-build-run/commit/0d9159e44e6e414420b6cbee9eca2dfe32e2acfa))
* **27-01:** add no-reread anti-pattern to executor agents across all plugins ([99f9805](https://github.com/SienkLogic/plan-build-run/commit/99f98052c39ca88d9f6323acb6adfa27581f5239))
* **34-01:** mark all LLM-01 through LLM-34 traceability entries as Verified ([182b858](https://github.com/SienkLogic/plan-build-run/commit/182b858478863495be0b7ca7a9150818a961873d))
* **quick-002:** add .active-skill stale detection to health Check 10 ([0ebf077](https://github.com/SienkLogic/plan-build-run/commit/0ebf0770f7bb84af4e503055e65f377a46d5cd93))
* **quick-002:** fix NEXT UP banner indentation in milestone SKILL.md ([b24f2af](https://github.com/SienkLogic/plan-build-run/commit/b24f2af7f8d141e3f946cf31dd3acd9373f0455d))
* **quick-002:** replace arrow-list with bullet style in help SKILL.md ([e268d85](https://github.com/SienkLogic/plan-build-run/commit/e268d85aa8f9904fba90bd0dbaf3002b187810eb))
* **quick-005:** add Local LLM nav link and mention in feature highlights ([4a905fc](https://github.com/SienkLogic/plan-build-run/commit/4a905fc3d329ecb899117c5adc0f8d01bbce49a9))
* **quick-005:** add Local LLM Offload section and update stats across README and Getting Started ([6c22b14](https://github.com/SienkLogic/plan-build-run/commit/6c22b1484f550c86a2da02450874e5851f11722d))
* **tools:** add /pbr:dashboard command to README dashboard section ([e36bdfd](https://github.com/SienkLogic/plan-build-run/commit/e36bdfd1d5b5f71ccdf0593a10a4f29202feebcb))
* **tools:** add missing 2.3.0 and 2.3.1 changelog entries ([93643be](https://github.com/SienkLogic/plan-build-run/commit/93643beee79322906aef2724cbfaa14f970688a2))
* **tools:** document minimum Claude Code v2.1.47 requirement for Windows hooks ([b3d5633](https://github.com/SienkLogic/plan-build-run/commit/b3d5633a80665a78b6f56c0bdf4da668af45774d))
* **tools:** fix banner consistency, add status/continue/do comparison, fix continue description ([1350ef3](https://github.com/SienkLogic/plan-build-run/commit/1350ef34af046b1f176d865ec57c630332e14e4e))
* **tools:** make platform badges clickable links to install pages ([cf9cf13](https://github.com/SienkLogic/plan-build-run/commit/cf9cf136aec349e411ccde36b36cf758c0b3bb3d))
* **tools:** resize header logo to 550px width ([e954e40](https://github.com/SienkLogic/plan-build-run/commit/e954e4055bf30f434a7d9dae5b7d71a54743ac29))
* **tools:** update demo GIF and rebrand demo scripts ([2c22cf1](https://github.com/SienkLogic/plan-build-run/commit/2c22cf1a97578cb81a8e8d07dd73ef0225c29afa))
* **tools:** update header logo ([f2bfa84](https://github.com/SienkLogic/plan-build-run/commit/f2bfa84ed0ad4bef12f0225ad60f374f59599093))
* **tools:** update header logo to pbr_banner_logo.png ([134852c](https://github.com/SienkLogic/plan-build-run/commit/134852c9f233727a65923d1e49f6dbccd5bb92ea))
* **tools:** update README with Copilot CLI support and current stats ([ac81ee6](https://github.com/SienkLogic/plan-build-run/commit/ac81ee6a1825971347e23f878c584ab9b04b44da))
* **tools:** update README with Cursor plugin section and CHANGELOG for v2.1.0 ([d68ff68](https://github.com/SienkLogic/plan-build-run/commit/d68ff689c974df9e1908b70206bcebe7d96ac09a))
* update CLAUDE.md coverage thresholds to 70% and test count to ~1666 ([0379115](https://github.com/SienkLogic/plan-build-run/commit/037911513fc9a335721fb3d8c14060c64c0f8e4a))

## [2.36.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.35.1...plan-build-run-v2.36.0) (2026-02-27)


### Features

* **01-01:** add build and plan executor gates to validate-task.js ([eb50498](https://github.com/SienkLogic/plan-build-run/commit/eb5049838fa24fc4e327f3fd63779e94a08225df))
* **01-01:** extend agent output validation to all 10 PBR agent types ([ec7d1dc](https://github.com/SienkLogic/plan-build-run/commit/ec7d1dc647ce72c3806f70a86576289991c23608))
* **01-01:** scaffold Cursor plugin directory structure and manifest ([4743cb2](https://github.com/SienkLogic/plan-build-run/commit/4743cb2598dbba1339101cc9c738869017117fe4))
* **01-02:** add skill-specific workflow rules and CRITICAL enforcement ([5b51b7e](https://github.com/SienkLogic/plan-build-run/commit/5b51b7e28ae935b1d5bfca3584d0fedd0c865c7c))
* **02-01:** add milestone, explore, import, scan write guards to checkSkillRules ([7c5bb1d](https://github.com/SienkLogic/plan-build-run/commit/7c5bb1daf6aec0db18e39f1be62393c6eb147267))
* **02-01:** port 10 agent definitions and workflow rules to Cursor format ([126fe76](https://github.com/SienkLogic/plan-build-run/commit/126fe764497186aaff24ac33782036f87b063409))
* **02-02:** add review planner gate to validate-task.js ([30f9031](https://github.com/SienkLogic/plan-build-run/commit/30f90313c6add9063f15fdff041d8bcb1671e625))
* **02-02:** strengthen ROADMAP sync warnings to CRITICAL level ([127f506](https://github.com/SienkLogic/plan-build-run/commit/127f5062d6d7006181616d0a3386a153d95f5909))
* **03-01:** add review verifier, milestone complete, and build dependency gates ([cfcf0d5](https://github.com/SienkLogic/plan-build-run/commit/cfcf0d55510ac52ec27c4ff466b751dd4635570c))
* **03-01:** port 6 core skills to Cursor format ([6c984a4](https://github.com/SienkLogic/plan-build-run/commit/6c984a4d56dfd1c3dcf40f29cc7e926775744b6c))
* **04-01:** add post-artifact validation for begin/plan/build and VERIFICATION.md ([353b8be](https://github.com/SienkLogic/plan-build-run/commit/353b8be3687db03843e0996914116231220b82a8))
* **04-01:** port 15 supporting skills to Cursor format ([ae0a8ae](https://github.com/SienkLogic/plan-build-run/commit/ae0a8aec895036a56d85b38ed7841ec800840a62))
* **05-01:** adapt hooks.json for Cursor plugin with shared script paths ([eaa1a0c](https://github.com/SienkLogic/plan-build-run/commit/eaa1a0c2d82db06c2c21eb3b680bda766562aa1c))
* **05-01:** add STATE.md validation, checkpoint manifest check, and active-skill integrity warning ([3f0c7bc](https://github.com/SienkLogic/plan-build-run/commit/3f0c7bc09ae2508ae849972057b88818f0e18eb6))
* **06-01:** add .active-skill write and cleanup to begin, plan, review, import skills ([8c1132a](https://github.com/SienkLogic/plan-build-run/commit/8c1132ab93115f27f926637c89079a701dec2c43))
* **06-01:** port templates, references, and shared fragments to Cursor plugin ([43fc161](https://github.com/SienkLogic/plan-build-run/commit/43fc1610997caf0e13523896e97e2fd6ed25d757))
* **06-02:** add CRITICAL markers to file-creation steps in begin, build, milestone, setup, pause ([5b10576](https://github.com/SienkLogic/plan-build-run/commit/5b10576334f92cbf5464362044564b6eae0977b1))
* **07-01:** add Cursor plugin validation test suite with 92 tests ([72c328e](https://github.com/SienkLogic/plan-build-run/commit/72c328e2cc939bf08d59e530afb96e3dacc4bc87))
* **07-01:** add Write tool to verifier/integration-checker and update prose across all plugins ([a9fe348](https://github.com/SienkLogic/plan-build-run/commit/a9fe348654d434ab9c0f68d53bfeb52256354225))
* **07-01:** register missing skills in check-skill-workflow.js switch statement ([63bac6f](https://github.com/SienkLogic/plan-build-run/commit/63bac6f4338d5f9d22a8ea804a6f1851118f208e))
* **07-02:** add debugger advisory gate and milestone gaps_found status check ([c5acda2](https://github.com/SienkLogic/plan-build-run/commit/c5acda2f73ea6ce7ddd21bc5e8c52990c0abdacb))
* **07-02:** add mtime-based recency checks for researcher and synthesizer output ([c3685ad](https://github.com/SienkLogic/plan-build-run/commit/c3685adb2b051fce0f7b002272daa54d770016da))
* **08-01:** add cross-plugin compatibility test suite ([bad35e7](https://github.com/SienkLogic/plan-build-run/commit/bad35e746d6d9e64e309597e20acf58d1e82363f))
* **08-01:** add inline fallback formats to 7 template-dependent agents ([f9a1038](https://github.com/SienkLogic/plan-build-run/commit/f9a1038e8145e9c0dc48affd648ec4485a5008d3))
* **08-02:** add CRITICAL markers and fix agent handoff issues ([800bf5e](https://github.com/SienkLogic/plan-build-run/commit/800bf5e2d231ad36b3f5097ff889b22bd5577544))
* **09-01:** add gate error fix guidance and discuss deep-dive CRITICAL enforcement ([8f18fb7](https://github.com/SienkLogic/plan-build-run/commit/8f18fb72674061284f11d375b73ff51a25d5c387))
* **09-01:** add health auto-fix for common corruption patterns ([22f666a](https://github.com/SienkLogic/plan-build-run/commit/22f666a943449ecff5ccb3a24eda5d464055a9b0))
* **09-01:** add marketplace documentation, logo, and finalize manifest ([6a317af](https://github.com/SienkLogic/plan-build-run/commit/6a317afbd5356065ac984782154ade5c9518e43d))
* **09-01:** add rollback safety, setup idempotency, and todo archive safety ([914cc9b](https://github.com/SienkLogic/plan-build-run/commit/914cc9bd91a821e18c65e8c9c239976ddf47fb09))
* **09-02:** rewrite ui-formatting.md with unified double-line box format ([d5d96b4](https://github.com/SienkLogic/plan-build-run/commit/d5d96b45f717e556b3e8c9c0d3a9eb3e521a03fd))
* **09-02:** update error-reporting fragment with block reason guidance ([a266081](https://github.com/SienkLogic/plan-build-run/commit/a266081a19966e2925c9c05128f3ee97ab0dd38a))
* **09-03:** replace heavy bar and thin divider banners with double-line box format in all 24 skills ([a602cbb](https://github.com/SienkLogic/plan-build-run/commit/a602cbb03d25c65c89e41422cb0c66c6a831b9ca))
* **09-03:** sync banner replacements and 09-01/09-02 changes to cursor-pbr and copilot-pbr ([c6473f8](https://github.com/SienkLogic/plan-build-run/commit/c6473f8b6908a1d8252385b49c711fd023c257c7))
* **09-04:** replace Next Up headings with double-line box format in all PBR skills ([2f30dbe](https://github.com/SienkLogic/plan-build-run/commit/2f30dbe933be1714c87250cc86ffc2047f2705c4))
* **09-04:** sync Next Up box format to cursor-pbr and copilot-pbr derivatives ([2e3b848](https://github.com/SienkLogic/plan-build-run/commit/2e3b8487840c0f2d0673259817c63041f3ca66f5))
* **11-01:** create tokens.css with dual-mode design tokens ([efcc30c](https://github.com/SienkLogic/plan-build-run/commit/efcc30c856d7c0c1e888daa2dbb27b5aaeeeaa77))
* **11-01:** refactor layout.css to use semantic design tokens ([2f13a93](https://github.com/SienkLogic/plan-build-run/commit/2f13a93032d47cd6e52b0b669dd928ed8b0f5ffa))
* **11-02:** add theme toggle button with localStorage persistence ([f2a2c9b](https://github.com/SienkLogic/plan-build-run/commit/f2a2c9b8fea7c74fa2344593ceedf3d64ecfd6c5))
* **11-02:** pin Pico.css CDN to v2.0.6 ([54fdd1f](https://github.com/SienkLogic/plan-build-run/commit/54fdd1f5c20d7b411fa0e1ffcb70b76106f48241))
* **12-01:** add current-phase middleware for sidebar context ([bef4dd8](https://github.com/SienkLogic/plan-build-run/commit/bef4dd897b202acfe61b64b492efaa4acd022b82))
* **12-01:** implement mobile overlay sidebar with backdrop ([98548db](https://github.com/SienkLogic/plan-build-run/commit/98548db578ad7db06335fdce5b94a2a5b8fbfffa))
* **12-01:** redesign sidebar with collapsible sections and current phase card ([3d3e05c](https://github.com/SienkLogic/plan-build-run/commit/3d3e05c698bdfd0980ed1c51cdb08d800b3bcc42))
* **12-02:** add breadcrumb data to routes and include partial in content templates ([ed79edd](https://github.com/SienkLogic/plan-build-run/commit/ed79edd432310162256010e5db891b8c258b2722))
* **12-02:** create breadcrumbs partial and CSS styles ([232e917](https://github.com/SienkLogic/plan-build-run/commit/232e9173bdaefe92cd5780775e96c76396dcc0b3))
* **13-01:** add milestone history expandable table with stats and deliverables ([8774c0f](https://github.com/SienkLogic/plan-build-run/commit/8774c0fe9f2ad9dd4955131fbc7a8a240af797e2))
* **13-01:** add todo filtering by priority, status, and search with bulk complete ([95e9dfd](https://github.com/SienkLogic/plan-build-run/commit/95e9dfd3ca96b25526ff8016e7791dc1d8475a91))
* **13-02:** add dependency graph route, views, and sidebar link ([f972435](https://github.com/SienkLogic/plan-build-run/commit/f9724351166d360122cb66e4c15110ee3279890e))
* **13-02:** add Mermaid dependency graph generation to roadmap service ([b194455](https://github.com/SienkLogic/plan-build-run/commit/b194455f298b2ea0660fd26936d333fbb0f1feef))
* **13-03:** add analytics route, views, and sidebar link ([431dad7](https://github.com/SienkLogic/plan-build-run/commit/431dad79bedcba831a8e7d731803f3987b82a0ac))
* **13-03:** create analytics service with git-based metrics and TTL cache ([6c8c41a](https://github.com/SienkLogic/plan-build-run/commit/6c8c41a23cdfd736a4d2bceea01502ebe64514e8))
* **14-01:** add Last-Event-ID state recovery to SSE endpoint ([4b48cf1](https://github.com/SienkLogic/plan-build-run/commit/4b48cf1d03f2b6191dc6eb7c856abaf0a1aacdf6))
* **14-01:** create custom SSE client with exponential backoff ([5b855ec](https://github.com/SienkLogic/plan-build-run/commit/5b855ec7a19c606a286fbf6b6d4f40e89afce87f))
* **14-01:** reduce chokidar stability threshold to 500ms ([8a65e43](https://github.com/SienkLogic/plan-build-run/commit/8a65e43720a17d9b37ba63f55bfe5b37e83fb80f))
* **14-02:** add hx-indicator spinners to todo complete actions ([fc8c325](https://github.com/SienkLogic/plan-build-run/commit/fc8c32583e2a2eaa5b972344777091c4ce5bc67f))
* **14-02:** add TTL cache utility and integrate into analytics and milestone services ([19bd3ea](https://github.com/SienkLogic/plan-build-run/commit/19bd3eadfa5f13368176991e525c5adbdd3b8309))
* **15-01:** add error-card styling, loading indicator, and favicon ([f48c40f](https://github.com/SienkLogic/plan-build-run/commit/f48c40fca341d9144e7fa3bf7f2c2e0db9b1d5ab))
* **15-01:** add skip-to-content link, focus-visible styles, and ARIA labels ([fe2963b](https://github.com/SienkLogic/plan-build-run/commit/fe2963b266eae933a23ea0b74859ae8655964ad5))
* **15-01:** create reusable empty-state partial and integrate into views ([be8e5f5](https://github.com/SienkLogic/plan-build-run/commit/be8e5f57dc60e4c02d2cc656a156dd450bd45fa4))
* **15-02:** GREEN - analytics, cache, SSE tests pass against existing code ([1948189](https://github.com/SienkLogic/plan-build-run/commit/1948189fd9a74912017c3901413f3f0da0f1f073))
* **15-02:** GREEN - dependencies and breadcrumbs tests pass ([9b3f987](https://github.com/SienkLogic/plan-build-run/commit/9b3f9874fb3b5d50288ef36af6cb3edb4ea91260))
* **16-01:** redesign dashboard home, fix analytics duration, add bar charts, mermaid dark mode ([ba820a1](https://github.com/SienkLogic/plan-build-run/commit/ba820a111afd8f65350ff0caa30e4a7be0c1489e))
* **17-01:** add notes page, verification viewer, milestone progress bars, dynamic footer version ([51b2092](https://github.com/SienkLogic/plan-build-run/commit/51b2092e0e89d2d31626cc94be8e5f6712b79116))
* **24-01:** add check-agent-state-write.js module ([c407826](https://github.com/SienkLogic/plan-build-run/commit/c4078264dead22d20998aeb14c35ea545289ccf5))
* **24-01:** wire agent state write blocker into pre-write-dispatch ([1adf149](https://github.com/SienkLogic/plan-build-run/commit/1adf149bb79de4750b5e7462a656a90a1de42ea6))
* **24-02:** add .auto-next fallback writes to auto_advance hard stops in build skill ([f96b05d](https://github.com/SienkLogic/plan-build-run/commit/f96b05de1da60032de889b416d2a4e978cd2ec8a))
* **25-01:** add ROADMAP.md read to continue skill for milestone boundary detection ([85077b1](https://github.com/SienkLogic/plan-build-run/commit/85077b109d17d9ef01348e489c1f2b4cdcb6c57d))
* **25-01:** GREEN - add validateRoadmap and ROADMAP.md validation to check-plan-format ([e77f0d7](https://github.com/SienkLogic/plan-build-run/commit/e77f0d7f629f8ff35be9c9718b4ec4fc54472550))
* **25-01:** GREEN - PLAN.md writes trigger ROADMAP Planning status without regression ([97c4d91](https://github.com/SienkLogic/plan-build-run/commit/97c4d91c4d0adda1b5e4caa2c632a2d26cf4a450))
* **25-02:** GREEN - add checkRoadmapWrite routing to post-write-dispatch ([d40887d](https://github.com/SienkLogic/plan-build-run/commit/d40887d1ee8d69df6f433c9b9e340d5e58dbe263))
* **25-02:** GREEN - implement isHighRisk with status regression and phase gap detection ([f46f8c9](https://github.com/SienkLogic/plan-build-run/commit/f46f8c909c69873c6a6aaf3b4a5570ab336fac3a))
* **25-02:** GREEN - implement validatePostMilestone for milestone completion checks ([a46886e](https://github.com/SienkLogic/plan-build-run/commit/a46886eafe65a636ddf9972a3a75e61c8f347d41))
* **26-02:** GREEN - add 150-line advisory warning to checkStateWrite ([7b0d0a3](https://github.com/SienkLogic/plan-build-run/commit/7b0d0a35b41fe51cc3821cd9e2a95c6bd86c438f))
* **26-02:** GREEN - add cross-plugin sync advisory hook ([fffe35c](https://github.com/SienkLogic/plan-build-run/commit/fffe35c127c81be72be901ecbc8f81ae36661ab8))
* **27-01:** add PreToolUse Read hook to block SKILL.md self-reads ([8d4775e](https://github.com/SienkLogic/plan-build-run/commit/8d4775e67d820a7ce136094e994b3d25f5c63b9a))
* **27-01:** add session length guard to auto-continue with warn at 3, hard-stop at 6 ([3ecd460](https://github.com/SienkLogic/plan-build-run/commit/3ecd4605df1edfaf8589526cbc937e886d87c1dc))
* **28-01:** add local LLM foundation — client, health, metrics, config schema, hook integrations, tests ([331f337](https://github.com/SienkLogic/plan-build-run/commit/331f337b6623e926da3f1c86491876b0565d9281))
* **29-01:** integrate local LLM into hooks — artifact classification, task validation, error classification, CLI ([1d42a14](https://github.com/SienkLogic/plan-build-run/commit/1d42a1400227680cab271f1761159de76b091e1f))
* **30-01:** add metrics display — session summaries, status skill, CLI, dashboard analytics ([4d5d614](https://github.com/SienkLogic/plan-build-run/commit/4d5d614fc246fc3a6f2a3d43fc8ae7611cf0c63f))
* **30-03:** add local-llm-metrics.service.js with getLlmMetrics and Vitest tests ([37d8e59](https://github.com/SienkLogic/plan-build-run/commit/37d8e5951d8ccea935d0ad71e99e026245a0dc47))
* **30-03:** wire getLlmMetrics into /analytics route and add Local LLM Offload section to EJS template ([e980348](https://github.com/SienkLogic/plan-build-run/commit/e980348c75a904e49d2262aafc7932a2f59a32a3))
* **31-01:** add adaptive router — complexity heuristic, confidence gate, 3 routing strategies ([91db4be](https://github.com/SienkLogic/plan-build-run/commit/91db4be5562ba05915905e931a10e47af7246e9e))
* **32-01:** add agent support — source scoring, error classification, context summarization, prompt injection ([83890f9](https://github.com/SienkLogic/plan-build-run/commit/83890f96117f8fe776248c0f28f560d960c32ce7))
* **33-01:** add shadow mode, threshold tuner, comprehensive tests, docs, cross-plugin sync ([379ce7f](https://github.com/SienkLogic/plan-build-run/commit/379ce7f6a88ec4ffa5c11dc9bf0c2c28462ec9e8))
* **34-01:** add config.features.source_scoring feature flag guard to score-source.js ([a7bd37a](https://github.com/SienkLogic/plan-build-run/commit/a7bd37a629e0fafefe4f0484deee965923f0364c))
* **34-01:** wire runShadow() into router.js post-call path for all 3 routing strategies ([06fcfb5](https://github.com/SienkLogic/plan-build-run/commit/06fcfb501c64a9769501715f0afc99978dbc7398))
* **35-01:** GREEN - add escapeHtml helper and use it in HTMX error handler path ([f29965e](https://github.com/SienkLogic/plan-build-run/commit/f29965ea450f56e71b7cef132f0fe6d3db9cfe74))
* **35-01:** GREEN - add sanitize-html post-processing to planning.repository ([440a97a](https://github.com/SienkLogic/plan-build-run/commit/440a97a08378e58eb931c5f62d2e2852561a581a))
* **35-03:** add Quick Tasks view with /quick and /quick/:id routes ([921b288](https://github.com/SienkLogic/plan-build-run/commit/921b288d327867d8033afb6fc51e3f5dd88f0657))
* **35-05:** add Audit Reports view with /audits and /audits/:filename routes ([aba41ce](https://github.com/SienkLogic/plan-build-run/commit/aba41ce7eccfcf4fedff7116ee0afb1f20cd796b))
* **35-05:** GREEN - implement audit.service.js with listAuditReports and getAuditReport ([6025452](https://github.com/SienkLogic/plan-build-run/commit/602545216c12f7472111b54db24489eab88394b0))
* **36-01:** add .status-badge--sm and .status-badge--lg variants; tokenize base badge sizing ([864afc9](https://github.com/SienkLogic/plan-build-run/commit/864afc9d542390f04dfcf4f9ef47e7ca3ef2894f))
* **36-01:** expand tokens.css with card, shadow, transition, table, and badge tokens ([62a2469](https://github.com/SienkLogic/plan-build-run/commit/62a2469f1230ef8c36ed0f72b44cd956b9d430d2))
* **36-02:** create phase-timeline.ejs and activity-feed.ejs partials ([f5ae581](https://github.com/SienkLogic/plan-build-run/commit/f5ae581819ab03e38939064aa4352e4d75f63387))
* **36-02:** GREEN - add getRecentActivity and deriveQuickActions to dashboard.service.js ([82883ae](https://github.com/SienkLogic/plan-build-run/commit/82883ae7c914a9ac26c16182aa423ea0e4848658))
* **36-02:** rework dashboard-content.ejs with status cards, timeline, activity feed, and quick actions ([54b138b](https://github.com/SienkLogic/plan-build-run/commit/54b138b38203239e27159a5bad72019fdb994d69))
* **36-03:** add prev/next phase navigation to phase detail view ([334812d](https://github.com/SienkLogic/plan-build-run/commit/334812d61632d5f0acd1ad06dba1a326bd4e6ab7))
* **36-04:** enrich getPhaseDetail with planTitle, taskCount, and mustHaves ([44a89ad](https://github.com/SienkLogic/plan-build-run/commit/44a89ad9e521aede77e0593e18843ad2d41e8e2a))
* **36-04:** overhaul plan cards to use .card component with wave, task count, and status ([1df3a6b](https://github.com/SienkLogic/plan-build-run/commit/1df3a6b17fbe6fe40d1bd38182e1ef5b05c803c9))
* **36-04:** replace commit history table with visual .commit-timeline in phase-content.ejs ([baece7b](https://github.com/SienkLogic/plan-build-run/commit/baece7b1fe9502a3f947ac67927a4beccf18e03a))
* **36-05:** add config page CSS to layout.css ([cce9a90](https://github.com/SienkLogic/plan-build-run/commit/cce9a90a20c867f63eb74c3cb66b557ee5a4f18e))
* **36-05:** add config shell page, hybrid form partial, and config CSS ([e40a82d](https://github.com/SienkLogic/plan-build-run/commit/e40a82d5e6a4ab2f0531ecd703ce37c4b0c44d9a))
* **36-05:** add config.service with readConfig, writeConfig, validateConfig (TDD) ([4df72f4](https://github.com/SienkLogic/plan-build-run/commit/4df72f400c37a313fe4b60266075203fddc88bba))
* **36-05:** add GET /config and POST /api/config routes ([150f7e4](https://github.com/SienkLogic/plan-build-run/commit/150f7e49d76315da74206a00c9d0b7d63efc9201))
* **36-06:** add GET /research and GET /research/:slug routes with HTMX support ([5a79666](https://github.com/SienkLogic/plan-build-run/commit/5a7966658417460606ab49613099acf180e62bf2))
* **36-06:** add research list and detail EJS templates with card layout and HTMX navigation ([5433ba5](https://github.com/SienkLogic/plan-build-run/commit/5433ba5b086ea5022f20c01e1a8142a9ca4b71f1))
* **36-06:** GREEN - implement research.service with listResearchDocs, listCodebaseDocs, getResearchDocBySlug ([6e50a75](https://github.com/SienkLogic/plan-build-run/commit/6e50a757c2c9e0bd224a8971f7eb195c40f563fa))
* **36-07:** add GET /requirements route and EJS templates ([e64a2a5](https://github.com/SienkLogic/plan-build-run/commit/e64a2a553240c6295cd41963ae0c9d36e5b4f065))
* **36-07:** GREEN - implement getRequirementsData service ([c3e018e](https://github.com/SienkLogic/plan-build-run/commit/c3e018e1ef9889e966975b88df5ff14ea0ca3674))
* **36-08:** add GET /logs route and GET /logs/stream SSE endpoint ([215e7a5](https://github.com/SienkLogic/plan-build-run/commit/215e7a5ffeb74b37a98b3d71dc16cafe374ffd9d))
* **36-08:** create logs EJS templates with SSE live-tail and filter controls ([baf6c78](https://github.com/SienkLogic/plan-build-run/commit/baf6c7875c58fcf4986f5c5da4befadce29e8958))
* **36-08:** GREEN - implement log.service with listLogFiles, readLogPage, tailLogFile ([34bd22e](https://github.com/SienkLogic/plan-build-run/commit/34bd22e7f496e98878f9bbac76a18c3dc7042ce7))
* **38-01:** rebuild dashboard foundation with Hono + JSX + Open Props ([533f782](https://github.com/SienkLogic/plan-build-run/commit/533f782ea3909dd42e8072e3ebccb1a76dd30309))
* **39-01:** add Command Center view with live-updating dashboard components ([9d333a2](https://github.com/SienkLogic/plan-build-run/commit/9d333a251de19b52726f9dc3ac466acf8c104a7a))
* **40-01:** add Explorer view shell with phases tab and Alpine.js tabs ([1746054](https://github.com/SienkLogic/plan-build-run/commit/1746054f37065a598e780a3cfae1ab357c5a00bd))
* **40-02:** add MilestonesTab component and milestone.service type declarations ([9393bf2](https://github.com/SienkLogic/plan-build-run/commit/9393bf220ba82eb00b707438271da504e9adfe95))
* **40-02:** add TodosTab component with TodoListFragment and TodoCreateForm ([86c178c](https://github.com/SienkLogic/plan-build-run/commit/86c178ca6fb22eff43aafa10b42323ef72846e68))
* **40-02:** wire todos and milestones routes into explorer.routes.tsx ([7e0071e](https://github.com/SienkLogic/plan-build-run/commit/7e0071e179647d58375bc5055ae627045091a9fa))
* **40-03:** add NotesTab, AuditsTab, and QuickTab components ([fa98f5b](https://github.com/SienkLogic/plan-build-run/commit/fa98f5b907c18de4ee328051714cc5947e6e6bb6))
* **40-03:** add ResearchTab and RequirementsTab components with requirements CSS ([d5cccdc](https://github.com/SienkLogic/plan-build-run/commit/d5cccdc398dee7d113f5abfa6b1119de16ac7814))
* **40-03:** wire research, requirements, notes, audits, quick routes; add service .d.ts files ([6ee4421](https://github.com/SienkLogic/plan-build-run/commit/6ee4421e734f218d563ca957d659d6a2547a0204))
* **41-01:** create timeline routes, wire into app, link timeline CSS in Layout ([2daf291](https://github.com/SienkLogic/plan-build-run/commit/2daf291f26b83736b6dc70ea040ed11b563487c8))
* **41-01:** create timeline.service.js with event aggregation and filtering ([49ea52a](https://github.com/SienkLogic/plan-build-run/commit/49ea52a84878065c0ce5a84f22b22b94f1deae89))
* **41-01:** create TimelinePage component, EventStreamFragment, and timeline CSS ([380ae24](https://github.com/SienkLogic/plan-build-run/commit/380ae24e73d0aac74f71cc15b5575191399e556d))
* **41-02:** add analytics and dependency-graph routes; refactor TimelinePage with section tabs ([1444176](https://github.com/SienkLogic/plan-build-run/commit/1444176156ce3c9f8b75dc52c72989f3c1f5fe5b))
* **41-02:** add analytics/graph CSS sections and Mermaid CDN to Layout ([865d647](https://github.com/SienkLogic/plan-build-run/commit/865d6473b8b5981517814e89ce417304aae167f3))
* **41-02:** add AnalyticsPanel and DependencyGraph components ([5786e02](https://github.com/SienkLogic/plan-build-run/commit/5786e029069082d01cda51a46a8863ebdda113de))
* **42-01:** create settings routes, CSS, wire into app, and add config.service.d.ts ([fc24060](https://github.com/SienkLogic/plan-build-run/commit/fc24060ecb165b6468bd377c340877584a5eb09e))
* **42-01:** create SettingsPage shell and ConfigEditor component (form + raw JSON modes) ([ed2a579](https://github.com/SienkLogic/plan-build-run/commit/ed2a57943c0ef9f5b379607fcfe48f8f2e5d8f98))
* **42-02:** add log viewer routes (page, entries, SSE tail) and CSS ([3656fef](https://github.com/SienkLogic/plan-build-run/commit/3656fef638bbb6bed8146555a0a5f7922d3acc24))
* **42-02:** add LogFileList, LogEntryList, and LogViewer components ([98998bb](https://github.com/SienkLogic/plan-build-run/commit/98998bbe84004e91ffba6809ec6ba198e4babc82))
* **44-01:** add inline SVG icons to sidebar nav and brand area ([4c31c64](https://github.com/SienkLogic/plan-build-run/commit/4c31c641e21997817386f6e806fd738c699fd98c))
* **44-01:** create StatCardGrid component and stat-card CSS system ([e1921cf](https://github.com/SienkLogic/plan-build-run/commit/e1921cfe939bca0417ee14dda8b4d6c0b883a8df))
* **44-01:** wire StatCardGrid into command-center route replacing StatusHeader+ProgressRing ([bc264a4](https://github.com/SienkLogic/plan-build-run/commit/bc264a4551929f7c1fb43ebda6e065fdb69e3708))
* **44-02:** add empty-state CSS component and apply to AttentionPanel and QuickActions ([92dc66e](https://github.com/SienkLogic/plan-build-run/commit/92dc66e95b9937b93b2cf4bed493d280aaa1e1cc))
* **44-02:** enhance Explorer phases rows and add status/priority filter selects to todos toolbar ([9434b3e](https://github.com/SienkLogic/plan-build-run/commit/9434b3e4ef190bbc4e6b42133e1ecf92161e6dfb))
* **44-02:** restructure Command Center into 2-column cc-two-col grid layout ([a602139](https://github.com/SienkLogic/plan-build-run/commit/a602139851abda7c7b031ac49d466c63595e768c))
* **44-03:** consolidate btn system into layout.css, add card hover shadow and cursor:pointer ([ec24c38](https://github.com/SienkLogic/plan-build-run/commit/ec24c3895b66706f7db363aa2ccd82d68fe79354))
* **44-03:** unify section label typography via --section-label-* tokens ([46b326e](https://github.com/SienkLogic/plan-build-run/commit/46b326e8c634a4f23a2e346283bdbda2a8b55932))
* **dashboard:** add responsive mobile layout with sidebar hamburger menu ([d95ee38](https://github.com/SienkLogic/plan-build-run/commit/d95ee38f71f471bd22dac818cbb34bda60d408ce))
* **quick-003:** add data-flow to plan-format reference, verification template, and integration report template ([8f61b02](https://github.com/SienkLogic/plan-build-run/commit/8f61b02a759632556e47f79b14f7c36d39aa57a3))
* **quick-003:** add data-flow verification to planner, verifier, and integration-checker agents ([eea56bc](https://github.com/SienkLogic/plan-build-run/commit/eea56bc1bba18a5a642ee52d6a9106a151f93aff))
* **quick-004:** add local LLM token counter to statusline ([52dbd8e](https://github.com/SienkLogic/plan-build-run/commit/52dbd8e960efb70f3de9f2bfbf8e046708d68ce0))
* **quick-004:** show session + lifetime LLM stats using stdin duration ([4fd0672](https://github.com/SienkLogic/plan-build-run/commit/4fd0672d184593e14f8e48e53ba72c6e4d49955d))
* **quick-008:** add block mode to checkNonPbrAgent for stronger enforcement ([5bd3614](https://github.com/SienkLogic/plan-build-run/commit/5bd361429a53f984fb1fcea69d76bf0ca1a4705c))
* **quick-008:** inject PBR workflow directive into SessionStart and PreCompact hooks ([e6fee97](https://github.com/SienkLogic/plan-build-run/commit/e6fee972cae9b551de16175607bd31da98d6f5c0))
* **quick-011:** add mobile responsive sidebar with hamburger toggle ([c0f4b23](https://github.com/SienkLogic/plan-build-run/commit/c0f4b2306e859a3c033dd63ee0ad61b21a7293a4))
* **quick-011:** fix status badge data-status attrs and mermaid dark mode ([b73eece](https://github.com/SienkLogic/plan-build-run/commit/b73eece54c5f4d510676b3e8acaa2d1b0ab01eae))
* **quick-013:** Wave C — completion markers, file read protocol, XML enhancement, context tiers ([1ff6148](https://github.com/SienkLogic/plan-build-run/commit/1ff61487bafac196723b1d368b9e6b418e8bbba9))
* **quick-014:** Wave D — inline deviation rules, scope boundaries, self-check hardening, spot-checks ([f6c377b](https://github.com/SienkLogic/plan-build-run/commit/f6c377b9120f2a12f5e671c8d48d7b0a56a30214))
* **quick-014:** Wave E + review fixes — context bridge, files_to_read, B3 completion, XML nesting ([27db68c](https://github.com/SienkLogic/plan-build-run/commit/27db68cc39fab486dbf90f482ab128852905c183))
* **tools:** add /pbr:audit skill for session compliance and UX review ([8e942bc](https://github.com/SienkLogic/plan-build-run/commit/8e942bcd2836e0fb6f0b425eddb39ebf6c5b7659))
* **tools:** add /pbr:dashboard skill with auto-launch on session start ([1ca0425](https://github.com/SienkLogic/plan-build-run/commit/1ca042584783bdfbc762fe5661b5c62e31ffcdfc))
* **tools:** add /pbr:do freeform router and smart skill suggestions in hook ([b19533e](https://github.com/SienkLogic/plan-build-run/commit/b19533ef6f57f890130d128d5816058bac3c63a7))
* **tools:** add /pbr:statusline command to install PBR status line ([f1266aa](https://github.com/SienkLogic/plan-build-run/commit/f1266aa01ed0dda9eff41da47f10287342b6b0d5))
* **tools:** add 3 local LLM operations — classify-commit, triage-test-output, classify-file-intent ([55c2558](https://github.com/SienkLogic/plan-build-run/commit/55c255887af3562eef823314f79a4db6baa7b261))
* **tools:** add D10 test plan coverage dimension to plan-checker agent ([cf36b60](https://github.com/SienkLogic/plan-build-run/commit/cf36b604371c5c6e27aa476e27b2bf782ca175a2))
* **tools:** add EnterPlanMode interception hook to redirect to PBR commands ([6b7b9f9](https://github.com/SienkLogic/plan-build-run/commit/6b7b9f94b1ebdeda207670083f5f78873964c7aa))
* **tools:** add freeform text guard hook for /pbr:plan and todo work subcommand ([42c6527](https://github.com/SienkLogic/plan-build-run/commit/42c65270ee72045a718f6111388a839d54c7a7e7))
* **tools:** add GitHub Copilot CLI plugin port ([64bb081](https://github.com/SienkLogic/plan-build-run/commit/64bb081a1739a9b8fac111f5f7d259f9d04cf39a))
* **tools:** add help docs, concurrent tests, and discuss requirements surfacing ([ef66bdc](https://github.com/SienkLogic/plan-build-run/commit/ef66bdcff94dd641a8f1a2972efac67d48200e7a))
* **tools:** add local LLM skill-level fallbacks and platform compatibility docs ([92abfc7](https://github.com/SienkLogic/plan-build-run/commit/92abfc7bc219c85b408593e8c0944db712bf07b9))
* **tools:** add milestone preview subcommand across all plugins ([a9b65fc](https://github.com/SienkLogic/plan-build-run/commit/a9b65fc142f59a24b0f3a06f303b33d3e25d55cf))
* **tools:** add milestones page to dashboard with archived milestone support ([de96735](https://github.com/SienkLogic/plan-build-run/commit/de96735af69fb14befdfc9d08f767d9fa5a13f97))
* **tools:** add post-compaction recovery, pbr-tools CLI reference, and dashboard UI banner ([9cc8f30](https://github.com/SienkLogic/plan-build-run/commit/9cc8f304072cd9f79fd18c94f25cafccf5e00163))
* **tools:** add PR title validation and improved PR template ([f33c5a7](https://github.com/SienkLogic/plan-build-run/commit/f33c5a79d290c404f177b473caffdc8d7a2afe58))
* **tools:** add PreToolUse additionalContext soft warnings for risky operations ([adb77ae](https://github.com/SienkLogic/plan-build-run/commit/adb77aee7444a5058f94a6f17bcbedc3f27643e9))
* **tools:** add review verifier post-check and stale active-skill detection ([37d819a](https://github.com/SienkLogic/plan-build-run/commit/37d819acc59b30e5d86eb2ea672d3f13122b1beb))
* **tools:** add rollback downstream invalidation, complete help docs, dashboard route tests ([bb4bcb1](https://github.com/SienkLogic/plan-build-run/commit/bb4bcb111b25284764d546f46411b844b8069a4d))
* **tools:** add run-hook.js wrapper for Windows MSYS path normalization ([20286c3](https://github.com/SienkLogic/plan-build-run/commit/20286c32bd6477eba4b075d11c7ebfdf90d0dd57))
* **tools:** add scan mapper area validation and stale Building status detection ([110db29](https://github.com/SienkLogic/plan-build-run/commit/110db29f5444c716e9558935c3e4b12cc9ab6fab))
* **tools:** add stale active-skill session-start warning and copilot hook limitation docs ([8dfcffa](https://github.com/SienkLogic/plan-build-run/commit/8dfcffa5442f0579435d2db1232215335f6167b4))
* **tools:** add state-sync plans_total fix, anti-pattern rule for Skill-in-Task, and social images ([8a2c784](https://github.com/SienkLogic/plan-build-run/commit/8a2c784469dcccb74388838348c6f31adcc89df1))
* **tools:** add STATE.md backup step before health skill auto-fix regeneration ([173cde6](https://github.com/SienkLogic/plan-build-run/commit/173cde6d90966f13ab048ba268bd3afb8b59c70e))
* **tools:** add summary gate hook to enforce SUMMARY before state advance ([55a0bd4](https://github.com/SienkLogic/plan-build-run/commit/55a0bd4578f8f122b0d3618552f51474a62431dd))
* **tools:** add worktree isolation, ConfigChange hook, and claude agents docs ([8b3d821](https://github.com/SienkLogic/plan-build-run/commit/8b3d82108febfa5a5ec80a37bcbee7a652b3beb5))
* **tools:** archive milestones into versioned directories with phase migration ([5951613](https://github.com/SienkLogic/plan-build-run/commit/5951613fa8d27b99b9a07523364a9ba7f8ac2fd9))
* **tools:** auto-close satisfied pending todos after quick task and build completion ([56ead9d](https://github.com/SienkLogic/plan-build-run/commit/56ead9d46ece7b4c6164dd983ca79e6a195db18c))
* **tools:** completion markers, file-read protocol, spot-checks for secondary skills ([efd9dc9](https://github.com/SienkLogic/plan-build-run/commit/efd9dc908c8ce523794195133beddd33e6fccdaa))
* **tools:** enable project-scoped memory for planner agent ([fb6da2d](https://github.com/SienkLogic/plan-build-run/commit/fb6da2d3fc70ebe911803ee23c4374fa30612da3))
* **tools:** integrate milestones into workflow lifecycle ([35bf5b7](https://github.com/SienkLogic/plan-build-run/commit/35bf5b7addfa03914012a9cc6c73eece59f2267e))
* **tools:** rebrand towline to plan-build-run ([2ce02a7](https://github.com/SienkLogic/plan-build-run/commit/2ce02a7422f7e8a5ccd9098e0cd3e06126ce6e65))
* **tools:** require user confirmation before debugger agent applies fixes ([604e775](https://github.com/SienkLogic/plan-build-run/commit/604e77592cee630a74dc2f2b71671e6fa3dbd3c5))
* **tools:** resolve exploration backlog — fix script bugs, add copilot hooks, improve recovery ([ef9e81a](https://github.com/SienkLogic/plan-build-run/commit/ef9e81a662d11402c261e3acb638fc0005045d42))
* **tools:** use last_assistant_message in Stop/SubagentStop hooks ([7894c5e](https://github.com/SienkLogic/plan-build-run/commit/7894c5ecebba9ee600234ebf665d8fc422a220d6))
* **tools:** Wave B — compound init commands, bug fixes, and reference upgrades ([78deaa6](https://github.com/SienkLogic/plan-build-run/commit/78deaa6890b6c513ac1826161552beef6719109b))


### Bug Fixes

* **01-01:** add cursor-pbr entry to marketplace manifest (PLUG-03) ([2ac7ca1](https://github.com/SienkLogic/plan-build-run/commit/2ac7ca1ff7c3880f4e610433969e382c4695f19d))
* **01-01:** hasPlanFile now matches numbered plan files like PLAN-01.md ([c0a4a6d](https://github.com/SienkLogic/plan-build-run/commit/c0a4a6d279497cce6593b9825537fbba8cda6c9e))
* **01-02:** add plan skill write-guard to check-skill-workflow.js ([9c07bc4](https://github.com/SienkLogic/plan-build-run/commit/9c07bc4e725dc3655fc4a86cbbb6df7a92c3f038))
* **06-01:** add skill-local templates and prompt-partials missed in initial port ([8279c57](https://github.com/SienkLogic/plan-build-run/commit/8279c576951c37cc461373a3ee4732337a39b51b))
* **06-03:** fix planner naming convention, executor timestamps, and statusline backup ([55ecd12](https://github.com/SienkLogic/plan-build-run/commit/55ecd12810d01e1c522da7659dde8b0f4627bbf9))
* **09-01:** use relative path for logo in plugin manifest ([341bacf](https://github.com/SienkLogic/plan-build-run/commit/341bacf776b31a321e1b2ac06678c8072b4addf0))
* **14-01:** add missing #sse-status element to header ([7a2b7ba](https://github.com/SienkLogic/plan-build-run/commit/7a2b7ba5b451ff87a9435c45feecf4ef76f794f1))
* **14-02:** clear milestone cache between tests to prevent stale data ([449f15e](https://github.com/SienkLogic/plan-build-run/commit/449f15ec05d8aecea14d4ea5c8a533747f73959d))
* **18-01:** HTMX navigation consistency, SSE tooltip, error page fix, remove deprecated layout ([79ddc58](https://github.com/SienkLogic/plan-build-run/commit/79ddc588b29329cff878ceea813be9e8d8cef5f8))
* **23-01:** register /pbr:do command and fix critical audit findings ([d73e8a7](https://github.com/SienkLogic/plan-build-run/commit/d73e8a7acdcb5bf9b9494de66eb73312c2d36204))
* **23-02:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in cursor-pbr ([e36c614](https://github.com/SienkLogic/plan-build-run/commit/e36c6145da3d27f1a6f0cea1290a1245208bf1f3))
* **23-03:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in copilot-pbr ([27181a4](https://github.com/SienkLogic/plan-build-run/commit/27181a47d056183266bb12bf2131bf1f3cd250d0))
* **23-04:** replace subagents terminology with agents in cursor-pbr ([f5af300](https://github.com/SienkLogic/plan-build-run/commit/f5af300cabedf3c8f45217b4c46c90f22ef65031))
* **23-05:** fix subagents terminology in copilot-pbr and sync ROADMAP template ([9b999f0](https://github.com/SienkLogic/plan-build-run/commit/9b999f080711f7515db95d71245a2e0f826d6403))
* **23-07:** strip hookSpecificOutput wrapper from check-phase-boundary and pre-write-dispatch ([19db6d6](https://github.com/SienkLogic/plan-build-run/commit/19db6d634f023c86bfe1e51d259c815d813aca60))
* **23-09:** reorder copilot-pbr hooks.json postToolUseFailure before preToolUse to match pbr canonical ordering ([d8003d8](https://github.com/SienkLogic/plan-build-run/commit/d8003d808b614bfc4bab77c524b0931413dc8171))
* **23-09:** use decision:block in validate-skill-args.js, remove orphaned JSDoc in validate-task.js ([ada9e3d](https://github.com/SienkLogic/plan-build-run/commit/ada9e3d0914e6d47c190792d3f66340ca22e3857))
* **23-10:** correct dispatch table — move check-doc-sprawl and check-skill-workflow to pre-write-dispatch ([e1709f7](https://github.com/SienkLogic/plan-build-run/commit/e1709f70b8262d1c673ea80895cda7086c6de45b))
* **23-10:** remove dead body from checkStatuslineRules in check-skill-workflow.js ([8bf0218](https://github.com/SienkLogic/plan-build-run/commit/8bf0218f69aa040bbcfc87e11d8b602f6d9958bb))
* **23-10:** remove redundant allowed-tools Note from health SKILL.md Auto-Fix section ([93757f2](https://github.com/SienkLogic/plan-build-run/commit/93757f200ee6f77bd173d02d84e7e8e25edac5c1))
* **23-12:** fix remaining subagents terminology in scan SKILL.md derivatives ([8d49259](https://github.com/SienkLogic/plan-build-run/commit/8d4925943ab8cde0521843636bb1c81b2e388ece))
* **23-12:** fix test property paths and heredoc extraction to achieve 70% branch coverage ([85f0fa1](https://github.com/SienkLogic/plan-build-run/commit/85f0fa14fb9ea1c904f402ac8a2129ca5e22c56b))
* **23-12:** remove excess tool grants from synthesizer and plan-checker agents ([3e1284d](https://github.com/SienkLogic/plan-build-run/commit/3e1284d129e9b6ebdc1a53f8e02bbddef63337d8))
* **24-01:** remove building from ADVANCED_STATUSES gate ([36bd3da](https://github.com/SienkLogic/plan-build-run/commit/36bd3daa43c4463da0f34234ddd1f7816c26b24d))
* **24-02:** raise consecutive-continue guard threshold from 3 to 6 ([069b385](https://github.com/SienkLogic/plan-build-run/commit/069b385df469712db0abe3eb64424bfbddd2164c))
* **24-02:** remove .auto-next cleanup from session-cleanup to prevent race with Stop hook ([64b72d2](https://github.com/SienkLogic/plan-build-run/commit/64b72d200d1475f1d2ecb21260c163fdd69d2348))
* **25-02:** remove unused path import and result variable (lint) ([c63b390](https://github.com/SienkLogic/plan-build-run/commit/c63b3904ec532cf6ba353fb922384876ee7d6364))
* **26-01:** add CRITICAL dual-update markers to import Step 8b and milestone new Step 8 ([2652908](https://github.com/SienkLogic/plan-build-run/commit/26529088bd2f1e8c998a4f2fc6bd87489d3655d9))
* **26-01:** add CRITICAL frontmatter update marker to pause skill STATE.md step ([880ec8d](https://github.com/SienkLogic/plan-build-run/commit/880ec8d937d6befca07b7db43525da6cbacabe27))
* **26-02:** sync cross-plugin-sync hook to cursor-pbr and copilot-pbr hooks.json ([73e0470](https://github.com/SienkLogic/plan-build-run/commit/73e0470f48c97d4635ca801505f55eca4b0933b8))
* **36-01:** replace hardcoded CSS values with design tokens and expand config.service.js ([284fcf2](https://github.com/SienkLogic/plan-build-run/commit/284fcf270ead0ab7688cb6b1017f31891cd34c3d))
* **36-02:** add typeof guard for quickActions in dashboard template ([e75c4d1](https://github.com/SienkLogic/plan-build-run/commit/e75c4d129537ab4d4af30b6b66a45285376298f7))
* **36-08:** improve dashboard UX across 12 pages with 16 visual fixes ([7c51cb8](https://github.com/SienkLogic/plan-build-run/commit/7c51cb874e1868b7d92caf8dde380defe66ad2d5))
* **37-05:** fix breadcrumb icon, milestone spacing, summary lookup, and config mode dropdown ([d5661fd](https://github.com/SienkLogic/plan-build-run/commit/d5661fd01150adc9d9d889af4a68857c739c79c8))
* **40-02:** use JSX-compatible hx-on attribute syntax in TodoCreateForm ([d9cd51d](https://github.com/SienkLogic/plan-build-run/commit/d9cd51d9e7cc6c2e2e4df82d608c323d7ca04fdf))
* **42-02:** move beforeunload cleanup to addEventListener for JSX compatibility ([b93b0e4](https://github.com/SienkLogic/plan-build-run/commit/b93b0e4dcb0dc4db85408fd6db11fe683e5b3270))
* **43-02:** use tsx runtime with absolute static path for cross-cwd dashboard launch ([605c99d](https://github.com/SienkLogic/plan-build-run/commit/605c99d604c60db06477f87deac2e89bd5b3cc45))
* **dashboard:** handle todo files with H1 title and high/medium/low priority ([a8dadcf](https://github.com/SienkLogic/plan-build-run/commit/a8dadcfe3b7226c2af8406df3a8dfe627b2c1cf5))
* **dashboard:** plan count regex and mermaid rendering ([a423a7c](https://github.com/SienkLogic/plan-build-run/commit/a423a7c0c336a1907c6c22b27d94495dfa857018))
* **dashboard:** show completed milestones on roadmap when all phases archived ([a3469dc](https://github.com/SienkLogic/plan-build-run/commit/a3469dc2f399ff32241a0ad0630f980ee6b1b759))
* **quick-001:** fix agent prompt issues from audit (items 4-7) ([bf9cde2](https://github.com/SienkLogic/plan-build-run/commit/bf9cde2a9ba2b74ea4b523ab49e6101b6e26bb83))
* **quick-001:** fix agent prompt issues from audit (items 8-10) ([ca374fc](https://github.com/SienkLogic/plan-build-run/commit/ca374fc002b955893c38e5c8b7ceeaeb7c8398d3))
* **quick-001:** fix STATE.md body drift, stale status line, and ROADMAP sync gaps ([994977c](https://github.com/SienkLogic/plan-build-run/commit/994977c196c0d4f3f851e5ad6c7049fb1952d858))
* **quick-003:** pass data.session_id to LLM operations instead of undefined ([6670377](https://github.com/SienkLogic/plan-build-run/commit/6670377a42a5030c11283f7578ad3c882a15b2aa))
* **quick-004:** render LLM stats on second line with explicit Local LLM label ([89a8dae](https://github.com/SienkLogic/plan-build-run/commit/89a8dae9aa390788e7513149e01d946b038b5918))
* **quick-006:** bump vitest to ^4.0.18 to match @vitest/coverage-v8 peer dep ([a959641](https://github.com/SienkLogic/plan-build-run/commit/a9596419355803f031c7e71ff649ffd33ca7a3ab))
* **quick-007:** correct todo test to match title fallback behavior (H1 heading recovery) ([8e5012d](https://github.com/SienkLogic/plan-build-run/commit/8e5012d84843d96dc780888dba200f81e5f85c45))
* **quick-008:** propagate block exit code from checkNonPbrAgent in validate-task dispatcher ([f02fc19](https://github.com/SienkLogic/plan-build-run/commit/f02fc198e1e7d9eb8be17a85805a413e250be2a0))
* **quick-009:** fix dashboard UX across milestones, timeline, logs, todos, and layout ([0b09776](https://github.com/SienkLogic/plan-build-run/commit/0b09776c7251c3587587c637e107514462c30c14))
* **quick-010:** use lockedFileUpdate for atomic writes, fix shell injection, add writeActiveSkill ([c18107d](https://github.com/SienkLogic/plan-build-run/commit/c18107d05a29558b8d7167609128ade4f83c0baf))
* **quick-011:** move hamburger button outside sidebar for correct fixed positioning ([2034b2d](https://github.com/SienkLogic/plan-build-run/commit/2034b2deb77c2bdf584282879f561a72d90929eb))
* **quick-012:** remove cursor-pbr from Claude Code marketplace listing ([5baf0be](https://github.com/SienkLogic/plan-build-run/commit/5baf0be27015411e69f7d6f9f148029d1d3502ea))
* **quick-012:** remove unrecognized 'platform' key from marketplace.json ([d4c91d4](https://github.com/SienkLogic/plan-build-run/commit/d4c91d436f1460d8fdd5e18642e5d7d83a39e7bc))
* **quick-014:** add /clear recommendations to derivative plugin completion sections ([1bc81da](https://github.com/SienkLogic/plan-build-run/commit/1bc81da6a7c0f1b130afbf803e9675205437f462))
* **quick-014:** review pass 2 — XML nesting, KNOWN_AGENTS prefix, completion markers, spot-check sync ([836e47d](https://github.com/SienkLogic/plan-build-run/commit/836e47dcdf649340f15ab72782006c366d832fae))
* **tools:** add --repo flag to gh pr merge in release workflow ([dffd1ed](https://github.com/SienkLogic/plan-build-run/commit/dffd1ede2abaef29333dcb6e184de5a2ba26ccef))
* **tools:** add commonjs package.json to scripts for ESM project compat ([b2f59eb](https://github.com/SienkLogic/plan-build-run/commit/b2f59eb2938da8c6ff1300c18134e4f1e9d00614))
* **tools:** add milestone routing to explore skill completion ([9629c34](https://github.com/SienkLogic/plan-build-run/commit/9629c343d41f4ba61b7129a51ce7f958058e8607))
* **tools:** add pull_request trigger to CI so branch protection checks pass ([ffbe56b](https://github.com/SienkLogic/plan-build-run/commit/ffbe56b63fd297e72ba09836c5c854a1f2177747))
* **tools:** add Skill tool to 4 PBR skills that use auto-advance chaining ([e073cb7](https://github.com/SienkLogic/plan-build-run/commit/e073cb752c2e26254512c204cadc2a2765142231))
* **tools:** auto-route quick skill to plan skill when user selects Full plan ([8b471d8](https://github.com/SienkLogic/plan-build-run/commit/8b471d8d58bbe0f08ef818e2dc2423c8e698beef))
* **tools:** close 31 UI consistency gaps found in audit round 2 ([d4ca358](https://github.com/SienkLogic/plan-build-run/commit/d4ca358cd2a553e05db3e953c65d09e30c0805df))
* **tools:** comprehensive codebase review — 33 improvements across 7 waves ([16d3f34](https://github.com/SienkLogic/plan-build-run/commit/16d3f342c8814517a1ddb98c5af84e39e1f3ef9e))
* **tools:** dashboard derives phase statuses from STATE.md frontmatter ([f30b48d](https://github.com/SienkLogic/plan-build-run/commit/f30b48dd30c191f90cdabfe2f1cac058ec7d628a))
* **tools:** dashboard parses H3-style ROADMAP.md phases and flexible bold syntax ([bcf6f8f](https://github.com/SienkLogic/plan-build-run/commit/bcf6f8f430e20411ec0b2831c22a7be963ca895e))
* **tools:** dashboard service and route improvements ([191eae1](https://github.com/SienkLogic/plan-build-run/commit/191eae10188521632dcf780c874d1f3ba3f40c26))
* **tools:** enforce quick task directory creation with CRITICAL markers and hook validation ([12a4fcc](https://github.com/SienkLogic/plan-build-run/commit/12a4fcc86722be30dbd7c8d22075b571da03d579))
* **tools:** exclude plugin files from context budget tracking + skill refinements ([6ed0c43](https://github.com/SienkLogic/plan-build-run/commit/6ed0c43132dbd6574c63b05f5c9e03f16bd9ab39))
* **tools:** extend executor commit check to quick skill and add .catch() to log-tool-failure ([23f52d7](https://github.com/SienkLogic/plan-build-run/commit/23f52d7b8db4d63f84619fcc1f9e7131828bcf8f))
* **tools:** fix CI lint errors and macOS symlink test failure ([2b85f6b](https://github.com/SienkLogic/plan-build-run/commit/2b85f6b68d07390452769be23b1751525dafc4ad))
* **tools:** fix lint errors and bump version to 2.1.0 ([5d88416](https://github.com/SienkLogic/plan-build-run/commit/5d8841632af6934ca704cf7bb201c42a4254db7a))
* **tools:** fix release workflow auth and CI lint paths ([4774474](https://github.com/SienkLogic/plan-build-run/commit/47744742c04fac89a822ce608bae777f57820fae))
* **tools:** handle concurrent write corruption in flaky test across platforms ([1b5b129](https://github.com/SienkLogic/plan-build-run/commit/1b5b129eec546323ca13a94b6acfebf6850d1f0a))
* **tools:** handle empty string race in concurrent .active-skill test on Windows ([fd1628f](https://github.com/SienkLogic/plan-build-run/commit/fd1628ff0528f74f766e593cc0f2353a4d504308))
* **tools:** improve dashboard markdown rendering and font loading ([59fd4c2](https://github.com/SienkLogic/plan-build-run/commit/59fd4c21482239d0410fc176d1303c28d81200f2))
* **tools:** lower coverage thresholds to match actual coverage after validate-task.js addition ([df1c396](https://github.com/SienkLogic/plan-build-run/commit/df1c396cd22a1f8246d2dbb58a63f13760f784bc))
* **tools:** parse simple two-column roadmap table in dashboard ([69f5a6f](https://github.com/SienkLogic/plan-build-run/commit/69f5a6f9e129926b660b34acb0e80012bf90e2dc))
* **tools:** prefix unused name var with underscore in version sync test ([a534b05](https://github.com/SienkLogic/plan-build-run/commit/a534b059e99c816c8b7053b1f33bf92bad41643a))
* **tools:** prevent lifetime LLM metrics from plateauing at 200 entries ([a62f5d8](https://github.com/SienkLogic/plan-build-run/commit/a62f5d837efce2b1aa48c5920f809d278ad4e53d))
* **tools:** remove platform-specific rollup dep from dashboard devDependencies ([009e17c](https://github.com/SienkLogic/plan-build-run/commit/009e17c39734bb3d1655906ec48186bd37360cbe))
* **tools:** remove unsupported --local flag from Copilot plugin install ([2f7bd2b](https://github.com/SienkLogic/plan-build-run/commit/2f7bd2bcb45d695713638e40539c0ccbf168efe6))
* **tools:** resolve lint errors in cross-plugin compat tests ([1bb6fd5](https://github.com/SienkLogic/plan-build-run/commit/1bb6fd5066189f27f9dee58d49533e28bb9f9556))
* **tools:** resolve lint errors in statusline workflow rules ([b801059](https://github.com/SienkLogic/plan-build-run/commit/b801059ce0d3361434a687a318a95b96a97313d6))
* **tools:** resolve markdownlint errors in planner agent and milestone skill ([178da16](https://github.com/SienkLogic/plan-build-run/commit/178da160313900472dcd3de9efe8ee111039b4d9))
* **tools:** resolve npm audit vulnerabilities via overrides ([fb7c798](https://github.com/SienkLogic/plan-build-run/commit/fb7c7989a8b2cb7eef0445a98331aa799d262f74))
* **tools:** revert npm overrides and relax audit level to critical ([b81015b](https://github.com/SienkLogic/plan-build-run/commit/b81015b126683c44fc0ab3abf8f10bb5c7ea9ba0))
* **tools:** revert release branch CI trigger (using non-strict protection instead) ([23a54c1](https://github.com/SienkLogic/plan-build-run/commit/23a54c11a87080a07fa70342aee1b1a4997e4aee))
* **tools:** standardize error messages with severity prefix and actionable next-steps ([7ab926c](https://github.com/SienkLogic/plan-build-run/commit/7ab926cdecffa0793b70529a9ed06205e7f0a9b9))
* **tools:** sync dashboard skill argument-hint to cursor plugin ([a180529](https://github.com/SienkLogic/plan-build-run/commit/a180529ae577c523332f368fa7792038408c91c0))
* **tools:** sync dashboard skill paths and missing templates across all plugins ([44e61ac](https://github.com/SienkLogic/plan-build-run/commit/44e61ac996db1a4cdf2d475e24f425ad442b3654))
* **tools:** trigger CI on release-please branch pushes for auto-merge ([f103a27](https://github.com/SienkLogic/plan-build-run/commit/f103a2739bbb5f452a76f2ea6e9771aa4459c04a))
* **tools:** update AskUserQuestion audit to reflect health skill auto-fix gates ([952a67f](https://github.com/SienkLogic/plan-build-run/commit/952a67ff5287a6e30f23b3f7eddeaf187f862c19))
* **tools:** update critical agents to use model: sonnet instead of inherit ([d3c77b2](https://github.com/SienkLogic/plan-build-run/commit/d3c77b2d85cd1d4a8c49c92b06d6ab6db5d2ab5a))
* **tools:** update validation script to handle run-hook.js bootstrap pattern ([080c6eb](https://github.com/SienkLogic/plan-build-run/commit/080c6eb3f3ad59e7a2c516f8e94d719daaacfed4))
* **tools:** use RELEASE_PAT for release-please to trigger CI on PRs ([5bbd50e](https://github.com/SienkLogic/plan-build-run/commit/5bbd50e7771df0409f35f5f229f855513a30bf8c))
* **tools:** warn on context budget tracker reset and roadmap sync parse failures ([32ce00f](https://github.com/SienkLogic/plan-build-run/commit/32ce00fafa4906801bbffcbd440658e933833522))


### Documentation

* **08-03:** add agent-contracts.md reference documenting handoff schemas ([33e148e](https://github.com/SienkLogic/plan-build-run/commit/33e148e4761e261d0b1b65a2ab9e783269bae080))
* **09-01:** add setup scripts and improve installation instructions ([44ad95d](https://github.com/SienkLogic/plan-build-run/commit/44ad95d710d7491b0fb6ff8292c30fe81de20075))
* **10-01:** wire agent-contracts.md into agents and document abandoned debug resolution ([0d9159e](https://github.com/SienkLogic/plan-build-run/commit/0d9159e44e6e414420b6cbee9eca2dfe32e2acfa))
* **27-01:** add no-reread anti-pattern to executor agents across all plugins ([99f9805](https://github.com/SienkLogic/plan-build-run/commit/99f98052c39ca88d9f6323acb6adfa27581f5239))
* **34-01:** mark all LLM-01 through LLM-34 traceability entries as Verified ([182b858](https://github.com/SienkLogic/plan-build-run/commit/182b858478863495be0b7ca7a9150818a961873d))
* **quick-002:** add .active-skill stale detection to health Check 10 ([0ebf077](https://github.com/SienkLogic/plan-build-run/commit/0ebf0770f7bb84af4e503055e65f377a46d5cd93))
* **quick-002:** fix NEXT UP banner indentation in milestone SKILL.md ([b24f2af](https://github.com/SienkLogic/plan-build-run/commit/b24f2af7f8d141e3f946cf31dd3acd9373f0455d))
* **quick-002:** replace arrow-list with bullet style in help SKILL.md ([e268d85](https://github.com/SienkLogic/plan-build-run/commit/e268d85aa8f9904fba90bd0dbaf3002b187810eb))
* **quick-005:** add Local LLM nav link and mention in feature highlights ([4a905fc](https://github.com/SienkLogic/plan-build-run/commit/4a905fc3d329ecb899117c5adc0f8d01bbce49a9))
* **quick-005:** add Local LLM Offload section and update stats across README and Getting Started ([6c22b14](https://github.com/SienkLogic/plan-build-run/commit/6c22b1484f550c86a2da02450874e5851f11722d))
* **tools:** add /pbr:dashboard command to README dashboard section ([e36bdfd](https://github.com/SienkLogic/plan-build-run/commit/e36bdfd1d5b5f71ccdf0593a10a4f29202feebcb))
* **tools:** add missing 2.3.0 and 2.3.1 changelog entries ([93643be](https://github.com/SienkLogic/plan-build-run/commit/93643beee79322906aef2724cbfaa14f970688a2))
* **tools:** document minimum Claude Code v2.1.47 requirement for Windows hooks ([b3d5633](https://github.com/SienkLogic/plan-build-run/commit/b3d5633a80665a78b6f56c0bdf4da668af45774d))
* **tools:** fix banner consistency, add status/continue/do comparison, fix continue description ([1350ef3](https://github.com/SienkLogic/plan-build-run/commit/1350ef34af046b1f176d865ec57c630332e14e4e))
* **tools:** make platform badges clickable links to install pages ([cf9cf13](https://github.com/SienkLogic/plan-build-run/commit/cf9cf136aec349e411ccde36b36cf758c0b3bb3d))
* **tools:** remove internal v2 research doc, update user-facing docs ([6ad84a3](https://github.com/SienkLogic/plan-build-run/commit/6ad84a30ac032ee4a100e8a41f8604a2dc9d09c6))
* **tools:** resize header logo to 550px width ([e954e40](https://github.com/SienkLogic/plan-build-run/commit/e954e4055bf30f434a7d9dae5b7d71a54743ac29))
* **tools:** update changelog for 2.0.0 publish, fix test counts, add npm badge ([6058a93](https://github.com/SienkLogic/plan-build-run/commit/6058a930896d99886cf46994a5322d7137942068))
* **tools:** update demo GIF ([77d5528](https://github.com/SienkLogic/plan-build-run/commit/77d5528e93e5a45acb0681d1823f3f37c3f0dc70))
* **tools:** update demo GIF and rebrand demo scripts ([2c22cf1](https://github.com/SienkLogic/plan-build-run/commit/2c22cf1a97578cb81a8e8d07dd73ef0225c29afa))
* **tools:** update header logo ([f2bfa84](https://github.com/SienkLogic/plan-build-run/commit/f2bfa84ed0ad4bef12f0225ad60f374f59599093))
* **tools:** update header logo to pbr_banner_logo.png ([134852c](https://github.com/SienkLogic/plan-build-run/commit/134852c9f233727a65923d1e49f6dbccd5bb92ea))
* **tools:** update README with Copilot CLI support and current stats ([ac81ee6](https://github.com/SienkLogic/plan-build-run/commit/ac81ee6a1825971347e23f878c584ab9b04b44da))
* **tools:** update README with Cursor plugin section and CHANGELOG for v2.1.0 ([d68ff68](https://github.com/SienkLogic/plan-build-run/commit/d68ff689c974df9e1908b70206bcebe7d96ac09a))
* update CLAUDE.md coverage thresholds to 70% and test count to ~1666 ([0379115](https://github.com/SienkLogic/plan-build-run/commit/037911513fc9a335721fb3d8c14060c64c0f8e4a))

## [2.35.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.35.0...plan-build-run-v2.35.1) (2026-02-25)


### Bug Fixes

* **quick-012:** remove cursor-pbr from Claude Code marketplace listing ([159372d](https://github.com/SienkLogic/plan-build-run/commit/159372ddb4f30bbdfbbac0822be676eb39901185))

## [2.35.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.34.0...plan-build-run-v2.35.0) (2026-02-25)


### Features

* **44-01:** add inline SVG icons to sidebar nav and brand area ([5232e3d](https://github.com/SienkLogic/plan-build-run/commit/5232e3d6ee7770f1dc0cfb4971a5e0ae3b23bd54))
* **44-01:** create StatCardGrid component and stat-card CSS system ([2797422](https://github.com/SienkLogic/plan-build-run/commit/279742287c3e0f4d41e4814c1c3bed5332cd945f))
* **44-01:** wire StatCardGrid into command-center route replacing StatusHeader+ProgressRing ([4c13326](https://github.com/SienkLogic/plan-build-run/commit/4c13326b90f36935f9e02815f3def61abcd9e5f3))
* **44-02:** add empty-state CSS component and apply to AttentionPanel and QuickActions ([a0e27b5](https://github.com/SienkLogic/plan-build-run/commit/a0e27b53ad7a6a9316c2067444fa462520d3c87b))
* **44-02:** enhance Explorer phases rows and add status/priority filter selects to todos toolbar ([036b356](https://github.com/SienkLogic/plan-build-run/commit/036b356f511ba2e4180f32c5ea418e6ec0a36ca3))
* **44-02:** restructure Command Center into 2-column cc-two-col grid layout ([2838fc4](https://github.com/SienkLogic/plan-build-run/commit/2838fc4fe9895ef67b9ac3f2c501e70135fe6a78))
* **44-03:** consolidate btn system into layout.css, add card hover shadow and cursor:pointer ([b525d2c](https://github.com/SienkLogic/plan-build-run/commit/b525d2cd20fd11454fdfb131003d07ae29d54911))
* **44-03:** unify section label typography via --section-label-* tokens ([8da1997](https://github.com/SienkLogic/plan-build-run/commit/8da1997d1e34ab7b1ebfb590adbf8c6e360cfef9))


### Bug Fixes

* **quick-012:** remove unrecognized 'platform' key from marketplace.json ([ffeaa5e](https://github.com/SienkLogic/plan-build-run/commit/ffeaa5e12e5f45a6e05778e459a2c74f18c680c0))

## [2.34.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.33.1...plan-build-run-v2.34.0) (2026-02-25)


### Features

* **quick-011:** add mobile responsive sidebar with hamburger toggle ([2958c60](https://github.com/SienkLogic/plan-build-run/commit/2958c605a2d9c876d297872d8b823e560679e3da))
* **quick-011:** fix status badge data-status attrs and mermaid dark mode ([8359c8c](https://github.com/SienkLogic/plan-build-run/commit/8359c8c001e676d8f776ad274b52b4b251cefe5a))


### Bug Fixes

* **quick-009:** fix dashboard UX across milestones, timeline, logs, todos, and layout ([3529d9e](https://github.com/SienkLogic/plan-build-run/commit/3529d9ebad8bac7f58b0780107a36eadbd5f66e7))
* **quick-010:** use lockedFileUpdate for atomic writes, fix shell injection, add writeActiveSkill ([1cefb13](https://github.com/SienkLogic/plan-build-run/commit/1cefb132ff1aa1ab07be252695dec43f1397f689))
* **quick-011:** move hamburger button outside sidebar for correct fixed positioning ([65054c3](https://github.com/SienkLogic/plan-build-run/commit/65054c337c8adc812669976ae5c14d3c150c452f))

## [2.33.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.33.0...plan-build-run-v2.33.1) (2026-02-25)


### Bug Fixes

* **quick-008:** propagate block exit code from checkNonPbrAgent in validate-task dispatcher ([4e8fbf6](https://github.com/SienkLogic/plan-build-run/commit/4e8fbf6796789c2a73d879d32c748df89261a17b))

## [2.33.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.32.1...plan-build-run-v2.33.0) (2026-02-25)


### Features

* **quick-008:** add block mode to checkNonPbrAgent for stronger enforcement ([57b2117](https://github.com/SienkLogic/plan-build-run/commit/57b2117bda206fd88f7bbf4b89895b6feec422eb))

## [2.32.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.32.0...plan-build-run-v2.32.1) (2026-02-24)


### Bug Fixes

* **43-02:** use tsx runtime with absolute static path for cross-cwd dashboard launch ([b19d7d5](https://github.com/SienkLogic/plan-build-run/commit/b19d7d5267632eed82760257df7f50592a71f139))

## [2.32.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.31.0...plan-build-run-v2.32.0) (2026-02-24)


### Features

* **42-01:** create settings routes, CSS, wire into app, and add config.service.d.ts ([3c4f953](https://github.com/SienkLogic/plan-build-run/commit/3c4f9531de93acc4e47b4ab6a94f962972c3f6ab))
* **42-02:** add log viewer routes (page, entries, SSE tail) and CSS ([cbcb47c](https://github.com/SienkLogic/plan-build-run/commit/cbcb47ce31b2e06481e329bfd01597bcc644a4a8))
* **42-02:** add LogFileList, LogEntryList, and LogViewer components ([3101c12](https://github.com/SienkLogic/plan-build-run/commit/3101c129dbf5e6535b720188be2a49a583008303))


### Bug Fixes

* **42-02:** move beforeunload cleanup to addEventListener for JSX compatibility ([e582a51](https://github.com/SienkLogic/plan-build-run/commit/e582a51ef628e7596bb42e352dbf8df861d67e07))

## [2.31.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.30.0...plan-build-run-v2.31.0) (2026-02-24)


### Features

* **41-01:** create timeline routes, wire into app, link timeline CSS in Layout ([ffc71c6](https://github.com/SienkLogic/plan-build-run/commit/ffc71c6ff32f72cf09894585e96cfd47d9ebad93))
* **41-01:** create timeline.service.js with event aggregation and filtering ([f585c2b](https://github.com/SienkLogic/plan-build-run/commit/f585c2b28a35ca028a0dfd6fb98fc3f717b0e42d))
* **41-01:** create TimelinePage component, EventStreamFragment, and timeline CSS ([105b3d3](https://github.com/SienkLogic/plan-build-run/commit/105b3d3e1fc3ea1f0f71c80301056e7a5ec0b125))
* **41-02:** add analytics and dependency-graph routes; refactor TimelinePage with section tabs ([4998f40](https://github.com/SienkLogic/plan-build-run/commit/4998f4093097953ca1e1e880413be60e07da08b4))
* **41-02:** add analytics/graph CSS sections and Mermaid CDN to Layout ([95d8853](https://github.com/SienkLogic/plan-build-run/commit/95d88536e406894021e454bb874d9dcc17abd179))
* **41-02:** add AnalyticsPanel and DependencyGraph components ([5bb080b](https://github.com/SienkLogic/plan-build-run/commit/5bb080bb363a3e2b56f5e2f2054c15e80dc6be23))
* **42-01:** create SettingsPage shell and ConfigEditor component (form + raw JSON modes) ([98caf06](https://github.com/SienkLogic/plan-build-run/commit/98caf0651314b4185b9c0e851d1607889956cb7f))
* **quick-008:** inject PBR workflow directive into SessionStart and PreCompact hooks ([c07574e](https://github.com/SienkLogic/plan-build-run/commit/c07574e32365c18e8c9239b8e4398330ba441182))

## [2.30.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.29.0...plan-build-run-v2.30.0) (2026-02-24)


### Features

* **40-01:** add Explorer view shell with phases tab and Alpine.js tabs ([f6d4fb3](https://github.com/SienkLogic/plan-build-run/commit/f6d4fb391cbd6eebe13ee6c381556404f4ad1faf))
* **40-02:** add MilestonesTab component and milestone.service type declarations ([420572b](https://github.com/SienkLogic/plan-build-run/commit/420572bb0009b52e0e761baf66097980758b981e))
* **40-02:** add TodosTab component with TodoListFragment and TodoCreateForm ([0cca669](https://github.com/SienkLogic/plan-build-run/commit/0cca669f39079a69fe5376d7460135a0fd496f07))
* **40-02:** wire todos and milestones routes into explorer.routes.tsx ([83e2963](https://github.com/SienkLogic/plan-build-run/commit/83e2963fc1d7bbc061df23c3f5c80c326bd2f16e))
* **40-03:** add NotesTab, AuditsTab, and QuickTab components ([e3edd64](https://github.com/SienkLogic/plan-build-run/commit/e3edd647a9db251527f50ed2264540acbc1974ff))
* **40-03:** add ResearchTab and RequirementsTab components with requirements CSS ([3102ff7](https://github.com/SienkLogic/plan-build-run/commit/3102ff735a0be217f013fa01199c1823cf2cfae5))
* **40-03:** wire research, requirements, notes, audits, quick routes; add service .d.ts files ([a45fcd9](https://github.com/SienkLogic/plan-build-run/commit/a45fcd906d06fc0da866ed6492c116bc9e80ab76))


### Bug Fixes

* **40-02:** use JSX-compatible hx-on attribute syntax in TodoCreateForm ([70e6822](https://github.com/SienkLogic/plan-build-run/commit/70e6822c5ec72ef25ee290ba7453065637f3c828))

## [2.29.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.28.0...plan-build-run-v2.29.0) (2026-02-24)


### Features

* **39-01:** add Command Center view with live-updating dashboard components ([7520c7f](https://github.com/SienkLogic/plan-build-run/commit/7520c7fd592beae5739cfd96aa73fd354047896d))

## [2.28.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.27.2...plan-build-run-v2.28.0) (2026-02-24)


### Features

* **38-01:** rebuild dashboard foundation with Hono + JSX + Open Props ([56596f6](https://github.com/SienkLogic/plan-build-run/commit/56596f6fe25e59d3051838bad2c8894a25754a3b))

## [2.27.2](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.27.1...plan-build-run-v2.27.2) (2026-02-24)


### Bug Fixes

* **37-05:** fix breadcrumb icon, milestone spacing, summary lookup, and config mode dropdown ([fd6d929](https://github.com/SienkLogic/plan-build-run/commit/fd6d92947c708e0aaba4b3d0a18897228e1957ec))

## [2.27.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.27.0...plan-build-run-v2.27.1) (2026-02-24)


### Bug Fixes

* **tools:** prevent lifetime LLM metrics from plateauing at 200 entries ([2cbdaa4](https://github.com/SienkLogic/plan-build-run/commit/2cbdaa4b4402110cc4bb0f6505d034f2162aa782))

## [2.27.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.26.2...plan-build-run-v2.27.0) (2026-02-24)


### Features

* **tools:** add local LLM skill-level fallbacks and platform compatibility docs ([d6d1242](https://github.com/SienkLogic/plan-build-run/commit/d6d1242d79eb924525761e0bc6ac65e1a2d51375))

## [2.26.2](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.26.1...plan-build-run-v2.26.2) (2026-02-24)


### Bug Fixes

* **36-08:** improve dashboard UX across 12 pages with 16 visual fixes ([3e0d715](https://github.com/SienkLogic/plan-build-run/commit/3e0d715bb93c7fa18d93960e7ca322c14a1c9deb))

## [2.26.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.26.0...plan-build-run-v2.26.1) (2026-02-24)


### Bug Fixes

* **tools:** remove platform-specific rollup dep from dashboard devDependencies ([91bb4a8](https://github.com/SienkLogic/plan-build-run/commit/91bb4a8a384bb48b6eb93806257213e9eb40abeb))

## [2.26.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.25.0...plan-build-run-v2.26.0) (2026-02-24)


### Features

* **36-01:** add .status-badge--sm and .status-badge--lg variants; tokenize base badge sizing ([2ed3a85](https://github.com/SienkLogic/plan-build-run/commit/2ed3a85de91fa359705dc0eb1ab231531aa4bbfd))
* **36-02:** create phase-timeline.ejs and activity-feed.ejs partials ([cfcad33](https://github.com/SienkLogic/plan-build-run/commit/cfcad33824ea291be101ad0cb3b288e53b6064ec))
* **36-02:** GREEN - add getRecentActivity and deriveQuickActions to dashboard.service.js ([9d8f55f](https://github.com/SienkLogic/plan-build-run/commit/9d8f55f68c7825245248ac70bd07e09e91d7109b))
* **36-02:** rework dashboard-content.ejs with status cards, timeline, activity feed, and quick actions ([7d8d735](https://github.com/SienkLogic/plan-build-run/commit/7d8d735f4d8e05c67a9f70190f402e3fc450ab0d))
* **36-03:** add prev/next phase navigation to phase detail view ([91b8bd5](https://github.com/SienkLogic/plan-build-run/commit/91b8bd5323ffaf9128dc66adeb74a0a8ccfa0da5))
* **36-04:** enrich getPhaseDetail with planTitle, taskCount, and mustHaves ([2ce86bb](https://github.com/SienkLogic/plan-build-run/commit/2ce86bb63cbbda0c6a6ede905936302a51e59e8b))
* **36-04:** overhaul plan cards to use .card component with wave, task count, and status ([ea963b8](https://github.com/SienkLogic/plan-build-run/commit/ea963b89b40a7f3c6b61d3ef0f6e19fd6deeee39))
* **36-04:** replace commit history table with visual .commit-timeline in phase-content.ejs ([a12d57e](https://github.com/SienkLogic/plan-build-run/commit/a12d57ef85852867bfcd33f171a3514a3151bd12))
* **36-05:** add config page CSS to layout.css ([687ee05](https://github.com/SienkLogic/plan-build-run/commit/687ee05be2acd543144267f0192adb71539a370a))
* **36-05:** add config shell page, hybrid form partial, and config CSS ([6827673](https://github.com/SienkLogic/plan-build-run/commit/68276734806efdbd3dd869f44e2283ae5b00ea18))
* **36-05:** add config.service with readConfig, writeConfig, validateConfig (TDD) ([26cf43a](https://github.com/SienkLogic/plan-build-run/commit/26cf43a08962d312deea31a2af51d0714be35a48))
* **36-05:** add GET /config and POST /api/config routes ([363348a](https://github.com/SienkLogic/plan-build-run/commit/363348adb75e83644d9accf0c401ef97d68be5da))
* **36-06:** add GET /research and GET /research/:slug routes with HTMX support ([a3ef246](https://github.com/SienkLogic/plan-build-run/commit/a3ef24633f865356a1ec591c3cd5c339eba14b0d))
* **36-06:** add research list and detail EJS templates with card layout and HTMX navigation ([4295545](https://github.com/SienkLogic/plan-build-run/commit/4295545d2feaa610034b728bdfd868f274e61d6f))
* **36-06:** GREEN - implement research.service with listResearchDocs, listCodebaseDocs, getResearchDocBySlug ([c1d2c1f](https://github.com/SienkLogic/plan-build-run/commit/c1d2c1fdd1b663b71388631a1e76554f06c01494))
* **36-07:** add GET /requirements route and EJS templates ([48d6d82](https://github.com/SienkLogic/plan-build-run/commit/48d6d8228250c17184abb5b7810d512b6a1b2f82))
* **36-07:** GREEN - implement getRequirementsData service ([016e0bc](https://github.com/SienkLogic/plan-build-run/commit/016e0bc1b22cef9f153bff0e8d2a4b692b57648d))
* **36-08:** add GET /logs route and GET /logs/stream SSE endpoint ([e5cdca5](https://github.com/SienkLogic/plan-build-run/commit/e5cdca5f9603de9973a41e1ef37b37630a527460))
* **36-08:** create logs EJS templates with SSE live-tail and filter controls ([c164794](https://github.com/SienkLogic/plan-build-run/commit/c1647944c9f8ef37be4b30df30ce18c702dee827))
* **36-08:** GREEN - implement log.service with listLogFiles, readLogPage, tailLogFile ([5827bd4](https://github.com/SienkLogic/plan-build-run/commit/5827bd4c9e0edce022784e14986b764b2970d229))
* **quick-004:** add local LLM token counter to statusline ([f5f5d4c](https://github.com/SienkLogic/plan-build-run/commit/f5f5d4c907a7a96e9d835c6e5b342fab7be86aad))
* **quick-004:** show session + lifetime LLM stats using stdin duration ([ef2512f](https://github.com/SienkLogic/plan-build-run/commit/ef2512fe1214eb9c0483253c67c8eb144643dcef))


### Bug Fixes

* **36-01:** replace hardcoded CSS values with design tokens and expand config.service.js ([68e9261](https://github.com/SienkLogic/plan-build-run/commit/68e9261456f5e3d9f23b58dbfc7b55ca85036b11))
* **36-02:** add typeof guard for quickActions in dashboard template ([2d19f72](https://github.com/SienkLogic/plan-build-run/commit/2d19f72015945291ecb73cb8dbcfe01f6654fa5c))
* **quick-004:** render LLM stats on second line with explicit Local LLM label ([16509b3](https://github.com/SienkLogic/plan-build-run/commit/16509b3f85805592580f80355e6258a0bee3e4b7))
* **quick-006:** bump vitest to ^4.0.18 to match @vitest/coverage-v8 peer dep ([4f5b172](https://github.com/SienkLogic/plan-build-run/commit/4f5b172d4f83fed7b04ff972e7848ce5762edb71))
* **quick-007:** correct todo test to match title fallback behavior (H1 heading recovery) ([50397bb](https://github.com/SienkLogic/plan-build-run/commit/50397bb16f17cfd253ab919bb83d52afa5aee9ad))


### Documentation

* **quick-005:** add Local LLM nav link and mention in feature highlights ([56784d8](https://github.com/SienkLogic/plan-build-run/commit/56784d800131df024aedc8d5ee6c8ddc81795e03))
* **quick-005:** add Local LLM Offload section and update stats across README and Getting Started ([264c891](https://github.com/SienkLogic/plan-build-run/commit/264c891e9aebc696f9194efd45428788606fecb3))

## [2.25.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.24.0...plan-build-run-v2.25.0) (2026-02-24)


### Features

* **36-01:** expand tokens.css with card, shadow, transition, table, and badge tokens ([75df300](https://github.com/SienkLogic/plan-build-run/commit/75df3000ecf3d44ed8c57f0528e719a9cc4b7c06))
* **tools:** add 3 local LLM operations — classify-commit, triage-test-output, classify-file-intent ([f456048](https://github.com/SienkLogic/plan-build-run/commit/f4560480888b916826f7c7e5ca6a091001779ab6))

## [2.24.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.23.0...plan-build-run-v2.24.0) (2026-02-24)


### Features

* **35-05:** add Audit Reports view with /audits and /audits/:filename routes ([33dfae7](https://github.com/SienkLogic/plan-build-run/commit/33dfae7fff02cbba93e250211e54b26d565f4f76))
* **35-05:** GREEN - implement audit.service.js with listAuditReports and getAuditReport ([c79179a](https://github.com/SienkLogic/plan-build-run/commit/c79179a75a386096e74589f13fea4a56174b1870))
* **quick-003:** add data-flow to plan-format reference, verification template, and integration report template ([e73a31e](https://github.com/SienkLogic/plan-build-run/commit/e73a31e0c1eb9535014de4b60924bd98ced2f8cb))
* **quick-003:** add data-flow verification to planner, verifier, and integration-checker agents ([e37e192](https://github.com/SienkLogic/plan-build-run/commit/e37e19297e038c38aecd7d04e93c007928242f0f))


### Bug Fixes

* **quick-003:** pass data.session_id to LLM operations instead of undefined ([df4d168](https://github.com/SienkLogic/plan-build-run/commit/df4d1682b50935b53ddcc665b8dcdc394b8b277e))

## [2.23.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.22.2...plan-build-run-v2.23.0) (2026-02-24)


### Features

* **28-01:** add local LLM foundation — client, health, metrics, config schema, hook integrations, tests ([44b5a77](https://github.com/SienkLogic/plan-build-run/commit/44b5a773fbb22d77ac0dbf3325201980dd1e9635))
* **29-01:** integrate local LLM into hooks — artifact classification, task validation, error classification, CLI ([785a708](https://github.com/SienkLogic/plan-build-run/commit/785a708039b0c363589e7151c40df989bb2a7959))
* **30-01:** add metrics display — session summaries, status skill, CLI, dashboard analytics ([d4ae4a4](https://github.com/SienkLogic/plan-build-run/commit/d4ae4a400932a324f61872169c1dae73cc2923ce))
* **30-03:** add local-llm-metrics.service.js with getLlmMetrics and Vitest tests ([fc1dd8f](https://github.com/SienkLogic/plan-build-run/commit/fc1dd8f6fbada707543dea848e7355ff52896667))
* **30-03:** wire getLlmMetrics into /analytics route and add Local LLM Offload section to EJS template ([5fcb61e](https://github.com/SienkLogic/plan-build-run/commit/5fcb61e25848395a4d59f4c555bbb8cf913efb72))
* **31-01:** add adaptive router — complexity heuristic, confidence gate, 3 routing strategies ([7905462](https://github.com/SienkLogic/plan-build-run/commit/7905462a5dc11063813c1c31400a17f4d2314a23))
* **32-01:** add agent support — source scoring, error classification, context summarization, prompt injection ([3693660](https://github.com/SienkLogic/plan-build-run/commit/36936609200596fe04cbf27f6eff41566733a74e))
* **33-01:** add shadow mode, threshold tuner, comprehensive tests, docs, cross-plugin sync ([dbacfed](https://github.com/SienkLogic/plan-build-run/commit/dbacfed98bd6819babad2f07df588cf545d5b99c))
* **34-01:** add config.features.source_scoring feature flag guard to score-source.js ([a0945a2](https://github.com/SienkLogic/plan-build-run/commit/a0945a2ffd1067ab3644063a8deee4e06a42ea9e))
* **34-01:** wire runShadow() into router.js post-call path for all 3 routing strategies ([f233948](https://github.com/SienkLogic/plan-build-run/commit/f23394810ab0f647f8eb1ba1d8f78a5eb7d048d8))
* **35-01:** GREEN - add escapeHtml helper and use it in HTMX error handler path ([a1830c9](https://github.com/SienkLogic/plan-build-run/commit/a1830c9230ba7ab1ea693a7ff2d36e786d5878d3))
* **35-01:** GREEN - add sanitize-html post-processing to planning.repository ([6d8122b](https://github.com/SienkLogic/plan-build-run/commit/6d8122b83cf1ed62101a3e9fc2f436caf6b0858e))
* **35-03:** add Quick Tasks view with /quick and /quick/:id routes ([22abe29](https://github.com/SienkLogic/plan-build-run/commit/22abe29e3951ea8e4fbd045116f6216326ee3907))


### Documentation

* **34-01:** mark all LLM-01 through LLM-34 traceability entries as Verified ([4311497](https://github.com/SienkLogic/plan-build-run/commit/4311497e1e91f55a575da4468924d21903457cdf))
* **quick-002:** add .active-skill stale detection to health Check 10 ([3f95b16](https://github.com/SienkLogic/plan-build-run/commit/3f95b16461478bf4271ef4f7ce94582188869bae))
* **quick-002:** fix NEXT UP banner indentation in milestone SKILL.md ([2983000](https://github.com/SienkLogic/plan-build-run/commit/2983000bd4df5e95c63cdc8f79601c7894883dbb))
* **quick-002:** replace arrow-list with bullet style in help SKILL.md ([ad78663](https://github.com/SienkLogic/plan-build-run/commit/ad7866375c6f7fd7dda3e195413df95f3ee191bc))

## [2.22.2](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.22.1...plan-build-run-v2.22.2) (2026-02-24)


### Documentation

* **tools:** fix banner consistency, add status/continue/do comparison, fix continue description ([028c0fd](https://github.com/SienkLogic/plan-build-run/commit/028c0fd6b09f77928f8d321f7442b87f7f07c538))

## [2.22.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.22.0...plan-build-run-v2.22.1) (2026-02-24)


### Bug Fixes

* **tools:** standardize error messages with severity prefix and actionable next-steps ([3b3b6dd](https://github.com/SienkLogic/plan-build-run/commit/3b3b6dd2cd1d868896edccfec19acefcb70b087f))

## [2.22.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.21.1...plan-build-run-v2.22.0) (2026-02-23)


### Features

* **24-01:** add check-agent-state-write.js module ([b73ab69](https://github.com/SienkLogic/plan-build-run/commit/b73ab69d8893970595d538a6289d8183b7b08b2b))
* **24-01:** wire agent state write blocker into pre-write-dispatch ([9f46053](https://github.com/SienkLogic/plan-build-run/commit/9f460530d21e4c3f37389f0bd2731ad0fd99e593))
* **24-02:** add .auto-next fallback writes to auto_advance hard stops in build skill ([9d59fc1](https://github.com/SienkLogic/plan-build-run/commit/9d59fc13b494cacdbe71e4e236d89bba0724a412))
* **25-01:** add ROADMAP.md read to continue skill for milestone boundary detection ([49482c2](https://github.com/SienkLogic/plan-build-run/commit/49482c2a7c0fbe49a39b215bf9070381295daa1c))
* **25-01:** GREEN - add validateRoadmap and ROADMAP.md validation to check-plan-format ([73256de](https://github.com/SienkLogic/plan-build-run/commit/73256dea9ea9c86a55dbd63fe057678e9757a798))
* **25-01:** GREEN - PLAN.md writes trigger ROADMAP Planning status without regression ([e8e028a](https://github.com/SienkLogic/plan-build-run/commit/e8e028ae3528a856a8c406a3b508802550e0f75f))
* **25-02:** GREEN - add checkRoadmapWrite routing to post-write-dispatch ([c7db2e0](https://github.com/SienkLogic/plan-build-run/commit/c7db2e0a4433a962a4f499941b29927a16583425))
* **25-02:** GREEN - implement isHighRisk with status regression and phase gap detection ([cea48b4](https://github.com/SienkLogic/plan-build-run/commit/cea48b4ccce2554a7c698af280e2725a233e69cb))
* **25-02:** GREEN - implement validatePostMilestone for milestone completion checks ([c666de8](https://github.com/SienkLogic/plan-build-run/commit/c666de84530eb7a6310a8def7744cec4ff5f8358))
* **26-02:** GREEN - add 150-line advisory warning to checkStateWrite ([9374009](https://github.com/SienkLogic/plan-build-run/commit/937400997580e9666f9efa18b4e0a80c5fe3b668))
* **26-02:** GREEN - add cross-plugin sync advisory hook ([a55ad12](https://github.com/SienkLogic/plan-build-run/commit/a55ad1273a7193cc521cd6e953ea185f51e7af50))
* **27-01:** add PreToolUse Read hook to block SKILL.md self-reads ([afe6acd](https://github.com/SienkLogic/plan-build-run/commit/afe6acd8a55a0807e28266b35b2f4fe961c9ecf5))
* **27-01:** add session length guard to auto-continue with warn at 3, hard-stop at 6 ([fd394d8](https://github.com/SienkLogic/plan-build-run/commit/fd394d893f2e7d93ad4a4bb29acd0a889da3fd67))


### Bug Fixes

* **24-01:** remove building from ADVANCED_STATUSES gate ([6e1fdf7](https://github.com/SienkLogic/plan-build-run/commit/6e1fdf7fb3897efdb1dca2ef77dbab78bab13ed2))
* **24-02:** raise consecutive-continue guard threshold from 3 to 6 ([918394c](https://github.com/SienkLogic/plan-build-run/commit/918394c34356f84772a4454061b312601f8ca26d))
* **24-02:** remove .auto-next cleanup from session-cleanup to prevent race with Stop hook ([d86e39e](https://github.com/SienkLogic/plan-build-run/commit/d86e39e48b51a3765e42c2807ee7ef277f8d3a5d))
* **25-02:** remove unused path import and result variable (lint) ([f84764a](https://github.com/SienkLogic/plan-build-run/commit/f84764ae3b4a5fce09a7d126624bb1719c57c10b))
* **26-01:** add CRITICAL dual-update markers to import Step 8b and milestone new Step 8 ([36bd68c](https://github.com/SienkLogic/plan-build-run/commit/36bd68c42d2fc556581de8f2f23a7b9d6447392b))
* **26-01:** add CRITICAL frontmatter update marker to pause skill STATE.md step ([ec35f3b](https://github.com/SienkLogic/plan-build-run/commit/ec35f3b529c1fe2b2928bb8ef97d768b101f2f0b))
* **26-02:** sync cross-plugin-sync hook to cursor-pbr and copilot-pbr hooks.json ([2083a1d](https://github.com/SienkLogic/plan-build-run/commit/2083a1d11c1ced3c7f2b4dc83df2c2a4ed684529))


### Documentation

* **27-01:** add no-reread anti-pattern to executor agents across all plugins ([8b572fa](https://github.com/SienkLogic/plan-build-run/commit/8b572fa6f43dfc3fe1a0ae8caf167ce2351f46f9))

## [2.21.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.21.0...plan-build-run-v2.21.1) (2026-02-23)


### Bug Fixes

* **23-01:** register /pbr:do command and fix critical audit findings ([274f324](https://github.com/SienkLogic/plan-build-run/commit/274f3247ea32557954c45eb321f5551bc3d8b3de))
* **23-02:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in cursor-pbr ([7fa53be](https://github.com/SienkLogic/plan-build-run/commit/7fa53beafaba95ab4c36499e7fb333ec83c58ecc))
* **23-03:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in copilot-pbr ([071f739](https://github.com/SienkLogic/plan-build-run/commit/071f739eab3854e03a68f6b93ad7de40854c8b72))
* **23-04:** replace subagents terminology with agents in cursor-pbr ([444765f](https://github.com/SienkLogic/plan-build-run/commit/444765f3277d077fba200c6d5f5fde594abdaf9a))
* **23-05:** fix subagents terminology in copilot-pbr and sync ROADMAP template ([e019e83](https://github.com/SienkLogic/plan-build-run/commit/e019e832b4c2808cec951eda44f0f57cb8755b8c))
* **23-07:** strip hookSpecificOutput wrapper from check-phase-boundary and pre-write-dispatch ([61e4e1e](https://github.com/SienkLogic/plan-build-run/commit/61e4e1ec7a7db3bc8ac4184e58c94ab5c324eb38))
* **23-09:** reorder copilot-pbr hooks.json postToolUseFailure before preToolUse to match pbr canonical ordering ([1180c9d](https://github.com/SienkLogic/plan-build-run/commit/1180c9d4ffb2c1bbbe4bc201a5dab126aee43ded))
* **23-09:** use decision:block in validate-skill-args.js, remove orphaned JSDoc in validate-task.js ([ec8c1d2](https://github.com/SienkLogic/plan-build-run/commit/ec8c1d24f9436c1dee703ec3509eb065fb2c4c92))
* **23-10:** correct dispatch table — move check-doc-sprawl and check-skill-workflow to pre-write-dispatch ([c6acc27](https://github.com/SienkLogic/plan-build-run/commit/c6acc2791ba652d5f81da231d301afcc90ab5c57))
* **23-10:** remove dead body from checkStatuslineRules in check-skill-workflow.js ([5a518ec](https://github.com/SienkLogic/plan-build-run/commit/5a518ec4772de1cf2991201e2657f5737efe2ebd))
* **23-10:** remove redundant allowed-tools Note from health SKILL.md Auto-Fix section ([7dcd549](https://github.com/SienkLogic/plan-build-run/commit/7dcd549bbd0e11b6eb4177e5ed1d4fd5eddc7d9b))
* **23-12:** fix remaining subagents terminology in scan SKILL.md derivatives ([67b15e8](https://github.com/SienkLogic/plan-build-run/commit/67b15e881d752ad1eb66bfb31496f634cb3c1768))
* **23-12:** fix test property paths and heredoc extraction to achieve 70% branch coverage ([4b857fe](https://github.com/SienkLogic/plan-build-run/commit/4b857fe73b8d82e6efe05114a7b09737c65dee12))
* **23-12:** remove excess tool grants from synthesizer and plan-checker agents ([04432b3](https://github.com/SienkLogic/plan-build-run/commit/04432b35dde761e95d14ca98353091bc936512a6))
* **quick-001:** fix agent prompt issues from audit (items 4-7) ([2772154](https://github.com/SienkLogic/plan-build-run/commit/27721547694686e2f425e95a7257b9cc48316c86))
* **quick-001:** fix agent prompt issues from audit (items 8-10) ([1c41a8f](https://github.com/SienkLogic/plan-build-run/commit/1c41a8f29a5069f4bb7cec612875b59dc6a22b22))
* **quick-001:** fix STATE.md body drift, stale status line, and ROADMAP sync gaps ([896494d](https://github.com/SienkLogic/plan-build-run/commit/896494d1215a7aadb7aa5b28c050db282cdcd784))
* **tools:** fix CI lint errors and macOS symlink test failure ([e5294a0](https://github.com/SienkLogic/plan-build-run/commit/e5294a0e0eefde674203ef0ed587d5def5c0f865))

## [2.21.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.20.0...plan-build-run-v2.21.0) (2026-02-23)


### Features

* **tools:** add help docs, concurrent tests, and discuss requirements surfacing ([02e9cc9](https://github.com/SienkLogic/plan-build-run/commit/02e9cc997d5b7d1aed3fc43cd8f8160c6e08d78b))
* **tools:** add milestone preview subcommand across all plugins ([fa6dca7](https://github.com/SienkLogic/plan-build-run/commit/fa6dca75d78adc952a5ffffd92baf17d8dd23e8e))
* **tools:** resolve exploration backlog — fix script bugs, add copilot hooks, improve recovery ([8a956dd](https://github.com/SienkLogic/plan-build-run/commit/8a956dd33a7182c402307d5569e0d8d37dbdaf1c))


### Bug Fixes

* **tools:** handle concurrent write corruption in flaky test across platforms ([e4e9b4d](https://github.com/SienkLogic/plan-build-run/commit/e4e9b4d524e5c08665b72a3c99555452f8e09089))
* **tools:** handle empty string race in concurrent .active-skill test on Windows ([9cb294a](https://github.com/SienkLogic/plan-build-run/commit/9cb294a1c7db67c1fe80d9672d4580c8951011c4))

## [2.20.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.19.0...plan-build-run-v2.20.0) (2026-02-23)


### Features

* **tools:** add worktree isolation, ConfigChange hook, and claude agents docs ([d704f34](https://github.com/SienkLogic/plan-build-run/commit/d704f340c636fa41f988d27a661a1e1918b04c87))

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
