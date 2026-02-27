# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.36.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.35.1...plan-build-run-v2.36.0) (2026-02-27)


### Features

* **01-01:** add build and plan executor gates to validate-task.js ([dc8d74e](https://github.com/SienkLogic/plan-build-run/commit/dc8d74ea6b26a70fde4c3f28e3be142bbb3cf1cc))
* **01-01:** extend agent output validation to all 10 PBR agent types ([5d2a23e](https://github.com/SienkLogic/plan-build-run/commit/5d2a23e4d6db70eafebf91f79efee24d7ec4f722))
* **01-01:** scaffold Cursor plugin directory structure and manifest ([c2c40cd](https://github.com/SienkLogic/plan-build-run/commit/c2c40cd932b903149576798b8f8a2b03e45f3e0c))
* **01-02:** add skill-specific workflow rules and CRITICAL enforcement ([0994c6f](https://github.com/SienkLogic/plan-build-run/commit/0994c6f3a3dadac81771ed5bf4033acb3ef650cf))
* **02-01:** add milestone, explore, import, scan write guards to checkSkillRules ([c8cf042](https://github.com/SienkLogic/plan-build-run/commit/c8cf042af2a0e27f368f883b786cca1ccadb309a))
* **02-01:** port 10 agent definitions and workflow rules to Cursor format ([faa9660](https://github.com/SienkLogic/plan-build-run/commit/faa96606c544abe50b6fb1f850921e2d1b34a735))
* **02-02:** add review planner gate to validate-task.js ([6f80c6c](https://github.com/SienkLogic/plan-build-run/commit/6f80c6c6e6b477ba46cb76dfbf1164ef14802d76))
* **02-02:** strengthen ROADMAP sync warnings to CRITICAL level ([cbade82](https://github.com/SienkLogic/plan-build-run/commit/cbade82272df574c43013b583170e8b534c68e46))
* **03-01:** add review verifier, milestone complete, and build dependency gates ([710ef8e](https://github.com/SienkLogic/plan-build-run/commit/710ef8e80cf174b7d1caa184f4330fb7a90ec3df))
* **03-01:** port 6 core skills to Cursor format ([45bb6d4](https://github.com/SienkLogic/plan-build-run/commit/45bb6d46b7c7d177fca4e8d347a3aba41ad11daa))
* **04-01:** add post-artifact validation for begin/plan/build and VERIFICATION.md ([dc6b7df](https://github.com/SienkLogic/plan-build-run/commit/dc6b7dfe4bacfe1fab5f39987ec3d8441ee72c18))
* **04-01:** port 15 supporting skills to Cursor format ([190ab97](https://github.com/SienkLogic/plan-build-run/commit/190ab97614810970f01e7f92399827be862ce833))
* **05-01:** adapt hooks.json for Cursor plugin with shared script paths ([5ed80b9](https://github.com/SienkLogic/plan-build-run/commit/5ed80b930fff18db78317c26d576bf99c5bf394c))
* **05-01:** add STATE.md validation, checkpoint manifest check, and active-skill integrity warning ([8fb7379](https://github.com/SienkLogic/plan-build-run/commit/8fb737969b0ef325957341e78a70f0c334c01b35))
* **06-01:** add .active-skill write and cleanup to begin, plan, review, import skills ([e81e976](https://github.com/SienkLogic/plan-build-run/commit/e81e9765fecdf1e4a1862929eccc783514a1bda9))
* **06-01:** port templates, references, and shared fragments to Cursor plugin ([b6f067e](https://github.com/SienkLogic/plan-build-run/commit/b6f067eef1ac5eb8d50f0ddfb35f4884ee633898))
* **06-02:** add CRITICAL markers to file-creation steps in begin, build, milestone, setup, pause ([b4ebb9e](https://github.com/SienkLogic/plan-build-run/commit/b4ebb9ede518083051ff1762d44725f55d0b0038))
* **07-01:** add Cursor plugin validation test suite with 92 tests ([242ce19](https://github.com/SienkLogic/plan-build-run/commit/242ce19b649d28b88b288532b4bb1e3f54b8de2d))
* **07-01:** add Write tool to verifier/integration-checker and update prose across all plugins ([a59fe7a](https://github.com/SienkLogic/plan-build-run/commit/a59fe7a0d7c87408eb2140a131870f1b0d1ec3b7))
* **07-01:** register missing skills in check-skill-workflow.js switch statement ([c94ae91](https://github.com/SienkLogic/plan-build-run/commit/c94ae91ba498de1f7c5145fed1ba8d4a938b449e))
* **07-02:** add debugger advisory gate and milestone gaps_found status check ([3faf1a4](https://github.com/SienkLogic/plan-build-run/commit/3faf1a4b69eabf77b02dd7ac5bb61b2e34915c37))
* **07-02:** add mtime-based recency checks for researcher and synthesizer output ([9279b62](https://github.com/SienkLogic/plan-build-run/commit/9279b62bb0e8e0ffee7d5fdf8c2254a7efea5dd9))
* **08-01:** add cross-plugin compatibility test suite ([ce70de3](https://github.com/SienkLogic/plan-build-run/commit/ce70de38e66f598db10892a4187d7cd1387601f4))
* **08-01:** add inline fallback formats to 7 template-dependent agents ([7db2983](https://github.com/SienkLogic/plan-build-run/commit/7db2983c246c595c5d5a4e1b06c09c65973425af))
* **08-02:** add CRITICAL markers and fix agent handoff issues ([89250fa](https://github.com/SienkLogic/plan-build-run/commit/89250fa333e2456f27c844df1bba9707f757374b))
* **09-01:** add gate error fix guidance and discuss deep-dive CRITICAL enforcement ([168ca08](https://github.com/SienkLogic/plan-build-run/commit/168ca080b7e3011ae921d7989744d6c3c2c331ff))
* **09-01:** add health auto-fix for common corruption patterns ([f8ee71a](https://github.com/SienkLogic/plan-build-run/commit/f8ee71aeb0b47fa30b1196b088c106e386044043))
* **09-01:** add marketplace documentation, logo, and finalize manifest ([9f74aad](https://github.com/SienkLogic/plan-build-run/commit/9f74aadef00e2d0146c51600f196d28cba58e22d))
* **09-01:** add rollback safety, setup idempotency, and todo archive safety ([493acb7](https://github.com/SienkLogic/plan-build-run/commit/493acb76ff0c33fa66e5deda13613001c1201b4d))
* **09-02:** rewrite ui-formatting.md with unified double-line box format ([91d652d](https://github.com/SienkLogic/plan-build-run/commit/91d652d978d1144cc64786b44d00f6fef53ab22e))
* **09-02:** update error-reporting fragment with block reason guidance ([5ea431c](https://github.com/SienkLogic/plan-build-run/commit/5ea431cae85269c91c4bd296b75b75b00fe5a08c))
* **09-03:** replace heavy bar and thin divider banners with double-line box format in all 24 skills ([76202f6](https://github.com/SienkLogic/plan-build-run/commit/76202f6a31e6757fd589d8a5a0069719a11b2082))
* **09-03:** sync banner replacements and 09-01/09-02 changes to cursor-pbr and copilot-pbr ([78551fe](https://github.com/SienkLogic/plan-build-run/commit/78551fe10be2f90dba578257a35804a8e2a43a51))
* **09-04:** replace Next Up headings with double-line box format in all PBR skills ([cda6178](https://github.com/SienkLogic/plan-build-run/commit/cda61785d079a74bdf2bd3c3e03f5eb434ffd41c))
* **09-04:** sync Next Up box format to cursor-pbr and copilot-pbr derivatives ([e51e025](https://github.com/SienkLogic/plan-build-run/commit/e51e02504d3c505b575d5b0015c8b6b62edf2668))
* **11-01:** create tokens.css with dual-mode design tokens ([868ba33](https://github.com/SienkLogic/plan-build-run/commit/868ba33b1a678617f85406bc47244fa8d46cdef3))
* **11-01:** refactor layout.css to use semantic design tokens ([479b979](https://github.com/SienkLogic/plan-build-run/commit/479b979253f7e1d290b77e2d31af3194a1ff966d))
* **11-02:** add theme toggle button with localStorage persistence ([6168e1e](https://github.com/SienkLogic/plan-build-run/commit/6168e1e3ef893307c937bc37940b38c05503e47b))
* **11-02:** pin Pico.css CDN to v2.0.6 ([95d4dbe](https://github.com/SienkLogic/plan-build-run/commit/95d4dbea3363a24b6b50a9dc67fb12c5abba7929))
* **12-01:** add current-phase middleware for sidebar context ([ccda471](https://github.com/SienkLogic/plan-build-run/commit/ccda4710987812f45265e33f47cf2f442bdd4915))
* **12-01:** implement mobile overlay sidebar with backdrop ([d391017](https://github.com/SienkLogic/plan-build-run/commit/d3910172f757ddf5b09ab241195b43f90b22920d))
* **12-01:** redesign sidebar with collapsible sections and current phase card ([3297b19](https://github.com/SienkLogic/plan-build-run/commit/3297b19302d0765c09a438c87a0d2c485a128a89))
* **12-02:** add breadcrumb data to routes and include partial in content templates ([eceed1f](https://github.com/SienkLogic/plan-build-run/commit/eceed1f665c8282fa2ff54804c721a0f3a6fb264))
* **12-02:** create breadcrumbs partial and CSS styles ([f68e8ee](https://github.com/SienkLogic/plan-build-run/commit/f68e8ee0d1ba64504d0901763349e9c0ce2650b5))
* **13-01:** add milestone history expandable table with stats and deliverables ([ecde64d](https://github.com/SienkLogic/plan-build-run/commit/ecde64dc941dc24479e5c6003250297637ae83ee))
* **13-01:** add todo filtering by priority, status, and search with bulk complete ([62c1a92](https://github.com/SienkLogic/plan-build-run/commit/62c1a926ae902bec193bdc1e8f89276b164f2b36))
* **13-02:** add dependency graph route, views, and sidebar link ([e951c9c](https://github.com/SienkLogic/plan-build-run/commit/e951c9c2738e787dd7fefb38ccb6fb46b003ebdb))
* **13-02:** add Mermaid dependency graph generation to roadmap service ([55222ea](https://github.com/SienkLogic/plan-build-run/commit/55222ea971b167458bfbbbb55868258e6946347a))
* **13-03:** add analytics route, views, and sidebar link ([0eb7391](https://github.com/SienkLogic/plan-build-run/commit/0eb7391d43bae33aca7a9cd1b9ba96a333530527))
* **13-03:** create analytics service with git-based metrics and TTL cache ([cfc5fe9](https://github.com/SienkLogic/plan-build-run/commit/cfc5fe93cc4d3a5957014fd2d8733dc6c69b33e5))
* **14-01:** add Last-Event-ID state recovery to SSE endpoint ([7aa45c8](https://github.com/SienkLogic/plan-build-run/commit/7aa45c8ebe8b8e512e5cd016e8a2c3d210f2f756))
* **14-01:** create custom SSE client with exponential backoff ([d6a3fa8](https://github.com/SienkLogic/plan-build-run/commit/d6a3fa80aa984f85c852c7c78d5cccf614ccd7da))
* **14-01:** reduce chokidar stability threshold to 500ms ([b14e70b](https://github.com/SienkLogic/plan-build-run/commit/b14e70b71d15ac3df482f33008d5f975f3f95da1))
* **14-02:** add hx-indicator spinners to todo complete actions ([5f7f861](https://github.com/SienkLogic/plan-build-run/commit/5f7f86189ad9a117dc3565c27876999ee64fabf2))
* **14-02:** add TTL cache utility and integrate into analytics and milestone services ([362ef0e](https://github.com/SienkLogic/plan-build-run/commit/362ef0ebe7b6ab5eadd635fe6b733d7d1eadec8b))
* **15-01:** add error-card styling, loading indicator, and favicon ([7928f16](https://github.com/SienkLogic/plan-build-run/commit/7928f1693423a59f69bfdf769c74392c148bd64e))
* **15-01:** add skip-to-content link, focus-visible styles, and ARIA labels ([9acc693](https://github.com/SienkLogic/plan-build-run/commit/9acc693e27eb9996a200d037f60c263c27f13117))
* **15-01:** create reusable empty-state partial and integrate into views ([35d57aa](https://github.com/SienkLogic/plan-build-run/commit/35d57aa4b67ef9890934598e2ed7be2fd8b9cf41))
* **15-02:** GREEN - analytics, cache, SSE tests pass against existing code ([7593904](https://github.com/SienkLogic/plan-build-run/commit/7593904009caefe53f5da18e69067832f30d40de))
* **15-02:** GREEN - dependencies and breadcrumbs tests pass ([25515ba](https://github.com/SienkLogic/plan-build-run/commit/25515ba94d6cc35a5dea68fde01aab8553188496))
* **16-01:** redesign dashboard home, fix analytics duration, add bar charts, mermaid dark mode ([8ef2d64](https://github.com/SienkLogic/plan-build-run/commit/8ef2d64aa8da5d2e776299e360ec4aa982f8f2f2))
* **17-01:** add notes page, verification viewer, milestone progress bars, dynamic footer version ([8852f53](https://github.com/SienkLogic/plan-build-run/commit/8852f532702178feb5f4c53a9ca08c0978bb7290))
* **24-01:** add check-agent-state-write.js module ([eebfdc9](https://github.com/SienkLogic/plan-build-run/commit/eebfdc946fea2b80dc047744dd86c45ed477fdcc))
* **24-01:** wire agent state write blocker into pre-write-dispatch ([4a45301](https://github.com/SienkLogic/plan-build-run/commit/4a45301f80f41433c0b1e26e5a2630bd3fe1dba3))
* **24-02:** add .auto-next fallback writes to auto_advance hard stops in build skill ([4f6e180](https://github.com/SienkLogic/plan-build-run/commit/4f6e180c2e970dbf7f652d56ef00bab5a7cd487b))
* **25-01:** add ROADMAP.md read to continue skill for milestone boundary detection ([f0693aa](https://github.com/SienkLogic/plan-build-run/commit/f0693aadc75319029a764fa1a10caae18848ecff))
* **25-01:** GREEN - add validateRoadmap and ROADMAP.md validation to check-plan-format ([28c1ddd](https://github.com/SienkLogic/plan-build-run/commit/28c1ddd9bf410d2d3946c1281c87f7c9a8d844d7))
* **25-01:** GREEN - PLAN.md writes trigger ROADMAP Planning status without regression ([dd7848f](https://github.com/SienkLogic/plan-build-run/commit/dd7848f7653bb14fd3bc5862844a3d9b71c5c425))
* **25-02:** GREEN - add checkRoadmapWrite routing to post-write-dispatch ([0a0f587](https://github.com/SienkLogic/plan-build-run/commit/0a0f587d47a4a62b14d08a0cf36f7f5e6b8ec620))
* **25-02:** GREEN - implement isHighRisk with status regression and phase gap detection ([fa4ef44](https://github.com/SienkLogic/plan-build-run/commit/fa4ef4404fbdcba4ffab4b826f0f11894b8558d8))
* **25-02:** GREEN - implement validatePostMilestone for milestone completion checks ([2b38462](https://github.com/SienkLogic/plan-build-run/commit/2b384620b1908118ce5b31ea9cf4cdc76b245efb))
* **26-02:** GREEN - add 150-line advisory warning to checkStateWrite ([266c4e9](https://github.com/SienkLogic/plan-build-run/commit/266c4e92ee588a2459b87acfba1b5427a0c545ba))
* **26-02:** GREEN - add cross-plugin sync advisory hook ([0ad68ce](https://github.com/SienkLogic/plan-build-run/commit/0ad68ce69548501f51d030da6d5fe8dca1b228da))
* **27-01:** add PreToolUse Read hook to block SKILL.md self-reads ([abacf78](https://github.com/SienkLogic/plan-build-run/commit/abacf78bb2f81b06bb597174538908b921327f64))
* **27-01:** add session length guard to auto-continue with warn at 3, hard-stop at 6 ([f2bdf8c](https://github.com/SienkLogic/plan-build-run/commit/f2bdf8cf7cd1450a76ea470a1deedeb86c3b8dac))
* **28-01:** add local LLM foundation — client, health, metrics, config schema, hook integrations, tests ([e24fecc](https://github.com/SienkLogic/plan-build-run/commit/e24feccb9e46b4ab05c1e09b754dc8e47943f541))
* **29-01:** integrate local LLM into hooks — artifact classification, task validation, error classification, CLI ([3eab65c](https://github.com/SienkLogic/plan-build-run/commit/3eab65c516ccef3288b4dc6755e7042d4e91c019))
* **30-01:** add metrics display — session summaries, status skill, CLI, dashboard analytics ([ec88734](https://github.com/SienkLogic/plan-build-run/commit/ec88734a5fafc9a236d3f12883b496ae72663ab7))
* **30-03:** add local-llm-metrics.service.js with getLlmMetrics and Vitest tests ([940b223](https://github.com/SienkLogic/plan-build-run/commit/940b223085a3dd6bba0eda15197772db18c619ae))
* **30-03:** wire getLlmMetrics into /analytics route and add Local LLM Offload section to EJS template ([b7751fb](https://github.com/SienkLogic/plan-build-run/commit/b7751fb3cde7a3dfdf69a2645c00954e93b76507))
* **31-01:** add adaptive router — complexity heuristic, confidence gate, 3 routing strategies ([ead69fd](https://github.com/SienkLogic/plan-build-run/commit/ead69fdbdefa136fee96280aa259516619399069))
* **32-01:** add agent support — source scoring, error classification, context summarization, prompt injection ([4ac672d](https://github.com/SienkLogic/plan-build-run/commit/4ac672d6ffc23221fc3b46cb5ef6c8f6feb82fd6))
* **33-01:** add shadow mode, threshold tuner, comprehensive tests, docs, cross-plugin sync ([1b335ca](https://github.com/SienkLogic/plan-build-run/commit/1b335ca9366e041ed3464b58ab2bc62c58d041fc))
* **34-01:** add config.features.source_scoring feature flag guard to score-source.js ([d3971ab](https://github.com/SienkLogic/plan-build-run/commit/d3971ab80c355c350d84c9c89b75fde93ca2d0f9))
* **34-01:** wire runShadow() into router.js post-call path for all 3 routing strategies ([210a613](https://github.com/SienkLogic/plan-build-run/commit/210a61341de2a584c0d5755734e21f057fe5a44f))
* **35-01:** GREEN - add escapeHtml helper and use it in HTMX error handler path ([ed314b3](https://github.com/SienkLogic/plan-build-run/commit/ed314b3a8128ea5945675aa22c9ef7c4299ecb98))
* **35-01:** GREEN - add sanitize-html post-processing to planning.repository ([6757369](https://github.com/SienkLogic/plan-build-run/commit/67573693df4e4d40f083c03606f68560f3913f72))
* **35-03:** add Quick Tasks view with /quick and /quick/:id routes ([d2aecb8](https://github.com/SienkLogic/plan-build-run/commit/d2aecb8ce4c8c85dfe7d06b4685f79c67fa03a52))
* **35-05:** add Audit Reports view with /audits and /audits/:filename routes ([3346e77](https://github.com/SienkLogic/plan-build-run/commit/3346e77759b67f9e29e325e6240317d998c79830))
* **35-05:** GREEN - implement audit.service.js with listAuditReports and getAuditReport ([9fe805c](https://github.com/SienkLogic/plan-build-run/commit/9fe805c35e8079a040747e142b1343553b8899fe))
* **36-01:** add .status-badge--sm and .status-badge--lg variants; tokenize base badge sizing ([62186e0](https://github.com/SienkLogic/plan-build-run/commit/62186e0c509bca3d86895b885806473735c3b97d))
* **36-01:** expand tokens.css with card, shadow, transition, table, and badge tokens ([395f508](https://github.com/SienkLogic/plan-build-run/commit/395f508a3bd1d3cf9704ce544716a7cd0e46d39e))
* **36-02:** create phase-timeline.ejs and activity-feed.ejs partials ([ce99a5f](https://github.com/SienkLogic/plan-build-run/commit/ce99a5fafde1bc88bfc1d582de3b0eccc9da181f))
* **36-02:** GREEN - add getRecentActivity and deriveQuickActions to dashboard.service.js ([e8cdba0](https://github.com/SienkLogic/plan-build-run/commit/e8cdba0ab370bd0c9c693c2a55da99928d9736aa))
* **36-02:** rework dashboard-content.ejs with status cards, timeline, activity feed, and quick actions ([e70146a](https://github.com/SienkLogic/plan-build-run/commit/e70146a684228283f597d777033d10d48e82bf79))
* **36-03:** add prev/next phase navigation to phase detail view ([bcd8f5e](https://github.com/SienkLogic/plan-build-run/commit/bcd8f5e92f8e15a972b0e0c36eee809af9164a76))
* **36-04:** enrich getPhaseDetail with planTitle, taskCount, and mustHaves ([0a58b40](https://github.com/SienkLogic/plan-build-run/commit/0a58b404b769d2f325d29195ca678f30332e509c))
* **36-04:** overhaul plan cards to use .card component with wave, task count, and status ([f0355e3](https://github.com/SienkLogic/plan-build-run/commit/f0355e3ba771edb91d33ec24722ce317b71637aa))
* **36-04:** replace commit history table with visual .commit-timeline in phase-content.ejs ([00ec92b](https://github.com/SienkLogic/plan-build-run/commit/00ec92b1641f72abaf62d3dc37dfc0f803392c19))
* **36-05:** add config page CSS to layout.css ([ae37124](https://github.com/SienkLogic/plan-build-run/commit/ae3712421228d9587598aec4800e29f75f348a58))
* **36-05:** add config shell page, hybrid form partial, and config CSS ([c5fc0fd](https://github.com/SienkLogic/plan-build-run/commit/c5fc0fd7cb88f71b75501aa3c265340ff01ca146))
* **36-05:** add config.service with readConfig, writeConfig, validateConfig (TDD) ([05404b5](https://github.com/SienkLogic/plan-build-run/commit/05404b518439ffd5d8687dd35bbbb52e3af7e3ec))
* **36-05:** add GET /config and POST /api/config routes ([f2e4663](https://github.com/SienkLogic/plan-build-run/commit/f2e4663223d67d30f2e32030bc1c7d9712c3cf43))
* **36-06:** add GET /research and GET /research/:slug routes with HTMX support ([a16ac82](https://github.com/SienkLogic/plan-build-run/commit/a16ac82a697259bf04f63277115e22d1fe5cd43f))
* **36-06:** add research list and detail EJS templates with card layout and HTMX navigation ([9fa258e](https://github.com/SienkLogic/plan-build-run/commit/9fa258e2a0a69c36bf3a269f641e4efc304b1c5b))
* **36-06:** GREEN - implement research.service with listResearchDocs, listCodebaseDocs, getResearchDocBySlug ([dfc88e2](https://github.com/SienkLogic/plan-build-run/commit/dfc88e2d765c8e2fb09b6374a9dcff9b13189701))
* **36-07:** add GET /requirements route and EJS templates ([43acc26](https://github.com/SienkLogic/plan-build-run/commit/43acc26887fe5f56863f66aebd84990a119255ea))
* **36-07:** GREEN - implement getRequirementsData service ([3e8aa67](https://github.com/SienkLogic/plan-build-run/commit/3e8aa6794c78cbffcd5992d7e45c58c51f1d33cf))
* **36-08:** add GET /logs route and GET /logs/stream SSE endpoint ([65228f4](https://github.com/SienkLogic/plan-build-run/commit/65228f4d93d80f9933584c649eb8bc91650561f3))
* **36-08:** create logs EJS templates with SSE live-tail and filter controls ([05356af](https://github.com/SienkLogic/plan-build-run/commit/05356affd0ef9c6b007fe65e210876e7af4a49b5))
* **36-08:** GREEN - implement log.service with listLogFiles, readLogPage, tailLogFile ([36d9a87](https://github.com/SienkLogic/plan-build-run/commit/36d9a870f8956039fd00ff2027f4c7abd010467a))
* **38-01:** rebuild dashboard foundation with Hono + JSX + Open Props ([76de5a9](https://github.com/SienkLogic/plan-build-run/commit/76de5a9be94746af3d0709078ffa76c34ff29f16))
* **39-01:** add Command Center view with live-updating dashboard components ([de107a2](https://github.com/SienkLogic/plan-build-run/commit/de107a2dc5188634eb3fa9303771d25000f7d7dd))
* **40-01:** add Explorer view shell with phases tab and Alpine.js tabs ([a9143c6](https://github.com/SienkLogic/plan-build-run/commit/a9143c61eb4cfc6c353056fb97009c798f83e654))
* **40-02:** add MilestonesTab component and milestone.service type declarations ([790006a](https://github.com/SienkLogic/plan-build-run/commit/790006ad10fd065473ec1cb761199a0ac0904d35))
* **40-02:** add TodosTab component with TodoListFragment and TodoCreateForm ([2bbfb68](https://github.com/SienkLogic/plan-build-run/commit/2bbfb68b7e2df35d437dcc550dbb4935d4e20806))
* **40-02:** wire todos and milestones routes into explorer.routes.tsx ([2a77256](https://github.com/SienkLogic/plan-build-run/commit/2a77256eb36d86c9d17b7d94da6a8b6c217ae656))
* **40-03:** add NotesTab, AuditsTab, and QuickTab components ([56b335b](https://github.com/SienkLogic/plan-build-run/commit/56b335bc4c7c16e8c64de25ba1ed3c6d28f8a870))
* **40-03:** add ResearchTab and RequirementsTab components with requirements CSS ([ad31f2b](https://github.com/SienkLogic/plan-build-run/commit/ad31f2bb04692988147bd092e62427adc292d1f2))
* **40-03:** wire research, requirements, notes, audits, quick routes; add service .d.ts files ([1b1a3d4](https://github.com/SienkLogic/plan-build-run/commit/1b1a3d4dc10a197e08a0c078ff8f8932cbfafa8a))
* **41-01:** create timeline routes, wire into app, link timeline CSS in Layout ([ba74922](https://github.com/SienkLogic/plan-build-run/commit/ba74922c83e897739177b07d1f418c06e5fb1041))
* **41-01:** create timeline.service.js with event aggregation and filtering ([01bba02](https://github.com/SienkLogic/plan-build-run/commit/01bba02782e45d8f3ba3d6eec61f296cafd92bc8))
* **41-01:** create TimelinePage component, EventStreamFragment, and timeline CSS ([741cab7](https://github.com/SienkLogic/plan-build-run/commit/741cab7152e6bc7f63cf03add6dc2ce28c85e937))
* **41-02:** add analytics and dependency-graph routes; refactor TimelinePage with section tabs ([e709dc4](https://github.com/SienkLogic/plan-build-run/commit/e709dc43289339253eedef854203a452772f1555))
* **41-02:** add analytics/graph CSS sections and Mermaid CDN to Layout ([10ff4bb](https://github.com/SienkLogic/plan-build-run/commit/10ff4bbfaf71e5e32a583e1629b4b28c3dca9161))
* **41-02:** add AnalyticsPanel and DependencyGraph components ([f18226c](https://github.com/SienkLogic/plan-build-run/commit/f18226cca61ef356cfdfd13cb53f3a43afd12f5b))
* **42-01:** create settings routes, CSS, wire into app, and add config.service.d.ts ([f74ec3b](https://github.com/SienkLogic/plan-build-run/commit/f74ec3b176331fa69cde552f84bddcf22844c204))
* **42-01:** create SettingsPage shell and ConfigEditor component (form + raw JSON modes) ([e56021c](https://github.com/SienkLogic/plan-build-run/commit/e56021ce8529d8ff74770739ae4b61226799fc2b))
* **42-02:** add log viewer routes (page, entries, SSE tail) and CSS ([691f644](https://github.com/SienkLogic/plan-build-run/commit/691f6441465f131423de054f19b3644d27e6fc17))
* **42-02:** add LogFileList, LogEntryList, and LogViewer components ([690e48e](https://github.com/SienkLogic/plan-build-run/commit/690e48e7529c73cffd847cc4df460cc7ee4d11a9))
* **44-01:** add inline SVG icons to sidebar nav and brand area ([4fc6325](https://github.com/SienkLogic/plan-build-run/commit/4fc63253e34e5ff4a67e2de6f8ca3af1f149b444))
* **44-01:** create StatCardGrid component and stat-card CSS system ([4755e3e](https://github.com/SienkLogic/plan-build-run/commit/4755e3e68539c27a6e3e79e0823e6fb7481cfc99))
* **44-01:** wire StatCardGrid into command-center route replacing StatusHeader+ProgressRing ([7759ba2](https://github.com/SienkLogic/plan-build-run/commit/7759ba2ae0a5f64310803f68640fcd6b5089258f))
* **44-02:** add empty-state CSS component and apply to AttentionPanel and QuickActions ([581b79e](https://github.com/SienkLogic/plan-build-run/commit/581b79e2f7808d1bd5d873c1ff95e4806f74e1b9))
* **44-02:** enhance Explorer phases rows and add status/priority filter selects to todos toolbar ([fab868f](https://github.com/SienkLogic/plan-build-run/commit/fab868fbf8337cdf827f6097c959c74f1553d8cc))
* **44-02:** restructure Command Center into 2-column cc-two-col grid layout ([f4c42a7](https://github.com/SienkLogic/plan-build-run/commit/f4c42a7960614d871c7c272ecf96bbf538793603))
* **44-03:** consolidate btn system into layout.css, add card hover shadow and cursor:pointer ([1b65e4e](https://github.com/SienkLogic/plan-build-run/commit/1b65e4e1c33580ebee1ba50b2c8a2c4f6796c236))
* **44-03:** unify section label typography via --section-label-* tokens ([6cf34f9](https://github.com/SienkLogic/plan-build-run/commit/6cf34f989434defce5a45aeb02ca1130124ced02))
* **dashboard:** add responsive mobile layout with sidebar hamburger menu ([9e4b5d4](https://github.com/SienkLogic/plan-build-run/commit/9e4b5d43a04719239e609aed7d81d73595317157))
* **quick-003:** add data-flow to plan-format reference, verification template, and integration report template ([16b6a1d](https://github.com/SienkLogic/plan-build-run/commit/16b6a1d4cf1bc370f7763f740b99419a3e86db29))
* **quick-003:** add data-flow verification to planner, verifier, and integration-checker agents ([751b1d3](https://github.com/SienkLogic/plan-build-run/commit/751b1d3eba526f5452de286145785f81dc777033))
* **quick-004:** add local LLM token counter to statusline ([3e9174c](https://github.com/SienkLogic/plan-build-run/commit/3e9174c8efac7864c5dd9e234d3031ce32b7e882))
* **quick-004:** show session + lifetime LLM stats using stdin duration ([95b31ed](https://github.com/SienkLogic/plan-build-run/commit/95b31ed5c24bbd8e2b60276e8bf1b54c4bd8c6f6))
* **quick-008:** add block mode to checkNonPbrAgent for stronger enforcement ([944e5b0](https://github.com/SienkLogic/plan-build-run/commit/944e5b0a71b38e7538c5ce5356ea14447925ae62))
* **quick-008:** inject PBR workflow directive into SessionStart and PreCompact hooks ([d0a3751](https://github.com/SienkLogic/plan-build-run/commit/d0a37512098a69a34f574753eefe748a97892dc3))
* **quick-011:** add mobile responsive sidebar with hamburger toggle ([a71d197](https://github.com/SienkLogic/plan-build-run/commit/a71d19757b5b78ee990baaaf27283d3f767e80ee))
* **quick-011:** fix status badge data-status attrs and mermaid dark mode ([b8b015b](https://github.com/SienkLogic/plan-build-run/commit/b8b015b0f67397df455f437fecf70eae22b832f1))
* **quick-013:** Wave C — completion markers, file read protocol, XML enhancement, context tiers ([fc994e0](https://github.com/SienkLogic/plan-build-run/commit/fc994e0267ccfe433bcc535070a500fd332481aa))
* **quick-014:** Wave D — inline deviation rules, scope boundaries, self-check hardening, spot-checks ([bd985ce](https://github.com/SienkLogic/plan-build-run/commit/bd985ce42338f4692141c18376e42741d2b30f37))
* **quick-014:** Wave E + review fixes — context bridge, files_to_read, B3 completion, XML nesting ([fa19384](https://github.com/SienkLogic/plan-build-run/commit/fa19384c975b1a636fe9828eaf4bf3715ceeca94))
* **tools:** add /pbr:audit skill for session compliance and UX review ([7b742f1](https://github.com/SienkLogic/plan-build-run/commit/7b742f1663dbe38ee9bd26f80e552cd8ef69ec0f))
* **tools:** add /pbr:dashboard skill with auto-launch on session start ([779974b](https://github.com/SienkLogic/plan-build-run/commit/779974b9411190fb451d5eff4925c215b2a6ea9e))
* **tools:** add /pbr:do freeform router and smart skill suggestions in hook ([b6ec369](https://github.com/SienkLogic/plan-build-run/commit/b6ec36996eeca859ef45d02198107f9b3420ffeb))
* **tools:** add /pbr:statusline command to install PBR status line ([2411cc2](https://github.com/SienkLogic/plan-build-run/commit/2411cc23b72fc1030e9b5451028c7576a57dec53))
* **tools:** add 3 local LLM operations — classify-commit, triage-test-output, classify-file-intent ([ee23861](https://github.com/SienkLogic/plan-build-run/commit/ee23861ddd963b24775a389e4305d09cc7eae89b))
* **tools:** add D10 test plan coverage dimension to plan-checker agent ([ccc7daa](https://github.com/SienkLogic/plan-build-run/commit/ccc7daa49156f72c350b20597f6e4b755b408876))
* **tools:** add EnterPlanMode interception hook to redirect to PBR commands ([06416ad](https://github.com/SienkLogic/plan-build-run/commit/06416ad0be9585805c794c7991e8d66b19570217))
* **tools:** add freeform text guard hook for /pbr:plan and todo work subcommand ([6d33d95](https://github.com/SienkLogic/plan-build-run/commit/6d33d95f38c5c48daf506da92e414ba2f2a68cfe))
* **tools:** add GitHub Copilot CLI plugin port ([d588f52](https://github.com/SienkLogic/plan-build-run/commit/d588f520e8288e8cd2d8cbaedce7c68b4c820914))
* **tools:** add help docs, concurrent tests, and discuss requirements surfacing ([f238262](https://github.com/SienkLogic/plan-build-run/commit/f23826260928f3e58e8c5c1443ab57ad11f12176))
* **tools:** add local LLM skill-level fallbacks and platform compatibility docs ([3cb3c43](https://github.com/SienkLogic/plan-build-run/commit/3cb3c43e6d3aed8b177d9b5dac7f086ce40eb9b4))
* **tools:** add milestone preview subcommand across all plugins ([7b9098c](https://github.com/SienkLogic/plan-build-run/commit/7b9098c699a8c19b5178cfc699a2d2d7a53f1697))
* **tools:** add milestones page to dashboard with archived milestone support ([7b33c65](https://github.com/SienkLogic/plan-build-run/commit/7b33c65d7852e0feb4c707386c32f483bc46556f))
* **tools:** add post-compaction recovery, pbr-tools CLI reference, and dashboard UI banner ([b4d54ef](https://github.com/SienkLogic/plan-build-run/commit/b4d54efffb2259cd35654b965611da159f1f15f1))
* **tools:** add PR title validation and improved PR template ([791236e](https://github.com/SienkLogic/plan-build-run/commit/791236e510849705da44aea8a25eb591f15bfdc3))
* **tools:** add PreToolUse additionalContext soft warnings for risky operations ([49cb474](https://github.com/SienkLogic/plan-build-run/commit/49cb474473351ab789d3e6022fbcd23bd8b2a150))
* **tools:** add review verifier post-check and stale active-skill detection ([78c819a](https://github.com/SienkLogic/plan-build-run/commit/78c819a5c99e350b4041c68a5e28504b62f2268e))
* **tools:** add rollback downstream invalidation, complete help docs, dashboard route tests ([8860c21](https://github.com/SienkLogic/plan-build-run/commit/8860c2175f82b24251761c822ec4273ddd061eaf))
* **tools:** add run-hook.js wrapper for Windows MSYS path normalization ([b9e0173](https://github.com/SienkLogic/plan-build-run/commit/b9e0173dff32ce09a74a7bb123521a75b8313dc3))
* **tools:** add scan mapper area validation and stale Building status detection ([2b83d90](https://github.com/SienkLogic/plan-build-run/commit/2b83d9072e0ad848badca11fdbd7c2cdecef44a9))
* **tools:** add stale active-skill session-start warning and copilot hook limitation docs ([26b0f5d](https://github.com/SienkLogic/plan-build-run/commit/26b0f5d2df9ffce990c625f8e10f65f74680b7a7))
* **tools:** add state-sync plans_total fix, anti-pattern rule for Skill-in-Task, and social images ([743195d](https://github.com/SienkLogic/plan-build-run/commit/743195d13d1aa7220e975fb5033140d9bbf99bb0))
* **tools:** add STATE.md backup step before health skill auto-fix regeneration ([c22d83f](https://github.com/SienkLogic/plan-build-run/commit/c22d83f95c3b44f8ddc840c8008f52e8e017d4f9))
* **tools:** add summary gate hook to enforce SUMMARY before state advance ([9724def](https://github.com/SienkLogic/plan-build-run/commit/9724def917ffe79d7e4ccea22e76e4fb7b17e033))
* **tools:** add worktree isolation, ConfigChange hook, and claude agents docs ([ba37979](https://github.com/SienkLogic/plan-build-run/commit/ba379794b45d6c1cb8fd664ea40ef59de0aff8d4))
* **tools:** archive milestones into versioned directories with phase migration ([c4e9956](https://github.com/SienkLogic/plan-build-run/commit/c4e9956a84df30696c7db96f16dd5bab380d1a4d))
* **tools:** auto-close satisfied pending todos after quick task and build completion ([48043f2](https://github.com/SienkLogic/plan-build-run/commit/48043f2a83b7b74e46f56e7fa1905ee7cb6cdd6b))
* **tools:** completion markers, file-read protocol, spot-checks for secondary skills ([8dbf321](https://github.com/SienkLogic/plan-build-run/commit/8dbf321a05dab61125654d5daea2419bd15f731e))
* **tools:** enable project-scoped memory for planner agent ([c183929](https://github.com/SienkLogic/plan-build-run/commit/c1839299c19df03fb4b823064f58e710d7571a7c))
* **tools:** integrate milestones into workflow lifecycle ([e293da9](https://github.com/SienkLogic/plan-build-run/commit/e293da928a789f185a3bfb27b0293a26fb784e26))
* **tools:** rebrand towline to plan-build-run ([42f2192](https://github.com/SienkLogic/plan-build-run/commit/42f21928a53fe42738761fa9650f29f4aeb58047))
* **tools:** require user confirmation before debugger agent applies fixes ([1add48b](https://github.com/SienkLogic/plan-build-run/commit/1add48bfd4826782f0ad088f1b5fd4ce747e8f5d))
* **tools:** resolve exploration backlog — fix script bugs, add copilot hooks, improve recovery ([3686cf6](https://github.com/SienkLogic/plan-build-run/commit/3686cf635ee64c940f081bdebb9298f586720513))
* **tools:** use last_assistant_message in Stop/SubagentStop hooks ([ac4257d](https://github.com/SienkLogic/plan-build-run/commit/ac4257db070c9a6320d008e0f3e76d18559879fa))
* **tools:** Wave B — compound init commands, bug fixes, and reference upgrades ([8c2805b](https://github.com/SienkLogic/plan-build-run/commit/8c2805bdefe0b902ad7f78903e7184d8abade5d0))


### Bug Fixes

* **01-01:** add cursor-pbr entry to marketplace manifest (PLUG-03) ([3ba660c](https://github.com/SienkLogic/plan-build-run/commit/3ba660c21e7fbbf4c2d9c495aed6b3c5ea7138f5))
* **01-01:** hasPlanFile now matches numbered plan files like PLAN-01.md ([1e6659a](https://github.com/SienkLogic/plan-build-run/commit/1e6659a8444aa9ff27697807b9c4ccfbf14283ff))
* **01-02:** add plan skill write-guard to check-skill-workflow.js ([37c2208](https://github.com/SienkLogic/plan-build-run/commit/37c22082bb49a3c754da2ff5853ca3ea94f0cde5))
* **06-01:** add skill-local templates and prompt-partials missed in initial port ([777b8e6](https://github.com/SienkLogic/plan-build-run/commit/777b8e69e8b3d9812dcd259e63cf4adec84762c9))
* **06-03:** fix planner naming convention, executor timestamps, and statusline backup ([d914de5](https://github.com/SienkLogic/plan-build-run/commit/d914de51e6f7515bae79f8c997eceb12d478c067))
* **09-01:** use relative path for logo in plugin manifest ([482a87f](https://github.com/SienkLogic/plan-build-run/commit/482a87f544c6431d48bec7307478cc84f40b0f6e))
* **14-01:** add missing #sse-status element to header ([3edca46](https://github.com/SienkLogic/plan-build-run/commit/3edca46f4f19bed402adb99d88f97deedcdbb8cc))
* **14-02:** clear milestone cache between tests to prevent stale data ([827f6f4](https://github.com/SienkLogic/plan-build-run/commit/827f6f45f1b7a73fa1b712dddd795db00141e137))
* **18-01:** HTMX navigation consistency, SSE tooltip, error page fix, remove deprecated layout ([d8b0d92](https://github.com/SienkLogic/plan-build-run/commit/d8b0d92cb492cb1ebc48d843dd968e3c445c4fc4))
* **23-01:** register /pbr:do command and fix critical audit findings ([dec8f37](https://github.com/SienkLogic/plan-build-run/commit/dec8f37aeae1b4f1e86fd3cc91eca371c367d0da))
* **23-02:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in cursor-pbr ([afedbc5](https://github.com/SienkLogic/plan-build-run/commit/afedbc553e451ea11d4011d50494ec21052b52ff))
* **23-03:** replace CLAUDE_PLUGIN_ROOT with PLUGIN_ROOT in copilot-pbr ([43c4b27](https://github.com/SienkLogic/plan-build-run/commit/43c4b2797361f9d4f347a69320229a28c1e831da))
* **23-04:** replace subagents terminology with agents in cursor-pbr ([bfa47eb](https://github.com/SienkLogic/plan-build-run/commit/bfa47ebe2117104305704c62117eef3323203369))
* **23-05:** fix subagents terminology in copilot-pbr and sync ROADMAP template ([ccde662](https://github.com/SienkLogic/plan-build-run/commit/ccde6622da328f5a8bcdec74316b30facad34892))
* **23-07:** strip hookSpecificOutput wrapper from check-phase-boundary and pre-write-dispatch ([220d675](https://github.com/SienkLogic/plan-build-run/commit/220d675f19de68c0053ec331c99f4ca06d0f32ad))
* **23-09:** reorder copilot-pbr hooks.json postToolUseFailure before preToolUse to match pbr canonical ordering ([9587869](https://github.com/SienkLogic/plan-build-run/commit/95878699bdaaf080c0fc039fb25c21ef10ae6785))
* **23-09:** use decision:block in validate-skill-args.js, remove orphaned JSDoc in validate-task.js ([501e5a8](https://github.com/SienkLogic/plan-build-run/commit/501e5a8b3256ad28ea44b27aede7435b9b1eaad4))
* **23-10:** correct dispatch table — move check-doc-sprawl and check-skill-workflow to pre-write-dispatch ([ca84810](https://github.com/SienkLogic/plan-build-run/commit/ca848100aa45444b82dca11f46bf8a24cfa5435d))
* **23-10:** remove dead body from checkStatuslineRules in check-skill-workflow.js ([c4e95c4](https://github.com/SienkLogic/plan-build-run/commit/c4e95c4eb3fdfb8d8036b31c3a4dc4eb1abe453b))
* **23-10:** remove redundant allowed-tools Note from health SKILL.md Auto-Fix section ([c0b99b8](https://github.com/SienkLogic/plan-build-run/commit/c0b99b89d4fdbf7441e71d4edd861cafd46a1def))
* **23-12:** fix remaining subagents terminology in scan SKILL.md derivatives ([c1015df](https://github.com/SienkLogic/plan-build-run/commit/c1015dfd8bd88e928e5c30eefc5cbb80fd4f948e))
* **23-12:** fix test property paths and heredoc extraction to achieve 70% branch coverage ([98f6dc6](https://github.com/SienkLogic/plan-build-run/commit/98f6dc6b5105a217d1b931f41ba1d44581ea359d))
* **23-12:** remove excess tool grants from synthesizer and plan-checker agents ([ddf65d9](https://github.com/SienkLogic/plan-build-run/commit/ddf65d90826d5dfaceed756d97aa1606bd79bdff))
* **24-01:** remove building from ADVANCED_STATUSES gate ([6691344](https://github.com/SienkLogic/plan-build-run/commit/66913440fd2c63d20b5b3e1bbae9969ebb35e6d3))
* **24-02:** raise consecutive-continue guard threshold from 3 to 6 ([abb57ae](https://github.com/SienkLogic/plan-build-run/commit/abb57ae368a406d27f492471fe0a52f6e4877508))
* **24-02:** remove .auto-next cleanup from session-cleanup to prevent race with Stop hook ([b6fa872](https://github.com/SienkLogic/plan-build-run/commit/b6fa8723621d9a9d1c97e561b1d29548996eea34))
* **25-02:** remove unused path import and result variable (lint) ([7f89730](https://github.com/SienkLogic/plan-build-run/commit/7f89730407024bd26a674b2bb85fd8b65dbf9998))
* **26-01:** add CRITICAL dual-update markers to import Step 8b and milestone new Step 8 ([2cdc539](https://github.com/SienkLogic/plan-build-run/commit/2cdc539e7634a5c35ee0230c6da8b4d1d37d2793))
* **26-01:** add CRITICAL frontmatter update marker to pause skill STATE.md step ([0e27fd8](https://github.com/SienkLogic/plan-build-run/commit/0e27fd82725e736fa7e633e29eea5091285f918f))
* **26-02:** sync cross-plugin-sync hook to cursor-pbr and copilot-pbr hooks.json ([585dc48](https://github.com/SienkLogic/plan-build-run/commit/585dc48a021de83fcca788fa086a55bc756a04bc))
* **36-01:** replace hardcoded CSS values with design tokens and expand config.service.js ([b2bd806](https://github.com/SienkLogic/plan-build-run/commit/b2bd806e449e77f5675d38044b8ae47936d8a718))
* **36-02:** add typeof guard for quickActions in dashboard template ([85ee1da](https://github.com/SienkLogic/plan-build-run/commit/85ee1da32e32aa9abb4d3e95c4454ad38dfa7b4b))
* **36-08:** improve dashboard UX across 12 pages with 16 visual fixes ([674daa1](https://github.com/SienkLogic/plan-build-run/commit/674daa1a81cc1bca9f94fcb3bc0a7fae450aef05))
* **37-05:** fix breadcrumb icon, milestone spacing, summary lookup, and config mode dropdown ([49c67fe](https://github.com/SienkLogic/plan-build-run/commit/49c67fef9a7077ecb3a6c39660dcd79924c23237))
* **40-02:** use JSX-compatible hx-on attribute syntax in TodoCreateForm ([4507bba](https://github.com/SienkLogic/plan-build-run/commit/4507bba85128b604c1e4953b9c6846dc0150f8f7))
* **42-02:** move beforeunload cleanup to addEventListener for JSX compatibility ([7a5dc03](https://github.com/SienkLogic/plan-build-run/commit/7a5dc0336411c5c4334e625cdf241feec520afc4))
* **43-02:** use tsx runtime with absolute static path for cross-cwd dashboard launch ([4a53a0f](https://github.com/SienkLogic/plan-build-run/commit/4a53a0fc2516235229386be065d910a552e03433))
* **dashboard:** handle todo files with H1 title and high/medium/low priority ([72936c5](https://github.com/SienkLogic/plan-build-run/commit/72936c57676a0204f910c7053e590a1e32f0a3ca))
* **dashboard:** plan count regex and mermaid rendering ([8294ed2](https://github.com/SienkLogic/plan-build-run/commit/8294ed243c5291dfc504314112e504d797190b44))
* **dashboard:** show completed milestones on roadmap when all phases archived ([3b1943d](https://github.com/SienkLogic/plan-build-run/commit/3b1943df5614e6e0c8d12fbb230017fb26213fff))
* **quick-001:** fix agent prompt issues from audit (items 4-7) ([76bfe2e](https://github.com/SienkLogic/plan-build-run/commit/76bfe2e54ef6f65e8149fa437ae191853e158d0c))
* **quick-001:** fix agent prompt issues from audit (items 8-10) ([5431ce2](https://github.com/SienkLogic/plan-build-run/commit/5431ce267b4dc89fdbc52bb75a49f36905b3db8c))
* **quick-001:** fix STATE.md body drift, stale status line, and ROADMAP sync gaps ([30a8f4d](https://github.com/SienkLogic/plan-build-run/commit/30a8f4dc4610126c5aa64991061db962418217fc))
* **quick-003:** pass data.session_id to LLM operations instead of undefined ([345e066](https://github.com/SienkLogic/plan-build-run/commit/345e066ffa022cbff414c6d2d6f97c5121e160a4))
* **quick-004:** render LLM stats on second line with explicit Local LLM label ([949a2b7](https://github.com/SienkLogic/plan-build-run/commit/949a2b7c863ae7669477a2a856453d645bd4a724))
* **quick-006:** bump vitest to ^4.0.18 to match @vitest/coverage-v8 peer dep ([35225fd](https://github.com/SienkLogic/plan-build-run/commit/35225fd290f58a24475bdfe37edf60f7b3e2b733))
* **quick-007:** correct todo test to match title fallback behavior (H1 heading recovery) ([2934594](https://github.com/SienkLogic/plan-build-run/commit/2934594635d2e6ddea71ad9a536b9abe3d60616c))
* **quick-008:** propagate block exit code from checkNonPbrAgent in validate-task dispatcher ([3f9b5e8](https://github.com/SienkLogic/plan-build-run/commit/3f9b5e842eebe93dcff7e24bb9ca1ea1f211bd9e))
* **quick-009:** fix dashboard UX across milestones, timeline, logs, todos, and layout ([682d0e7](https://github.com/SienkLogic/plan-build-run/commit/682d0e7669064df292e1c4b8cc49fe5d2c23854c))
* **quick-010:** use lockedFileUpdate for atomic writes, fix shell injection, add writeActiveSkill ([6ce0854](https://github.com/SienkLogic/plan-build-run/commit/6ce08547d42e65f937ff89a133ed4451f35f5e48))
* **quick-011:** move hamburger button outside sidebar for correct fixed positioning ([d90d45a](https://github.com/SienkLogic/plan-build-run/commit/d90d45a050f4fe42a18e7e0a7a34f04f1a4f52a5))
* **quick-012:** remove cursor-pbr from Claude Code marketplace listing ([7fc4848](https://github.com/SienkLogic/plan-build-run/commit/7fc484873d957e2b11d9ec895d143b1e22fa799b))
* **quick-012:** remove unrecognized 'platform' key from marketplace.json ([d577064](https://github.com/SienkLogic/plan-build-run/commit/d577064aa05cce6e4418ab0a121dd391720e07b5))
* **quick-014:** add /clear recommendations to derivative plugin completion sections ([32cf632](https://github.com/SienkLogic/plan-build-run/commit/32cf632bc73ec20c7f053da0e0cabc2dbff461dc))
* **quick-014:** review pass 2 — XML nesting, KNOWN_AGENTS prefix, completion markers, spot-check sync ([9762f7e](https://github.com/SienkLogic/plan-build-run/commit/9762f7ec58238b6e97417225737974c763318abf))
* **tools:** add --repo flag to gh pr merge in release workflow ([4082ec6](https://github.com/SienkLogic/plan-build-run/commit/4082ec6cd2afff1f6f00c32b2d9448b6d731f0ee))
* **tools:** add commonjs package.json to scripts for ESM project compat ([cb5fe18](https://github.com/SienkLogic/plan-build-run/commit/cb5fe18eb984152781c1ca6fa60d9c170fd96afe))
* **tools:** add milestone routing to explore skill completion ([44132bb](https://github.com/SienkLogic/plan-build-run/commit/44132bbd57af8ad0543eda348cc315aa1c076ee0))
* **tools:** add pull_request trigger to CI so branch protection checks pass ([3644a2b](https://github.com/SienkLogic/plan-build-run/commit/3644a2b6129e18997c4619dfd2ee5a771273a4b5))
* **tools:** add Skill tool to 4 PBR skills that use auto-advance chaining ([8f48550](https://github.com/SienkLogic/plan-build-run/commit/8f485502672d1f2455e0391cf66d3ff162f0b141))
* **tools:** auto-route quick skill to plan skill when user selects Full plan ([9e314fb](https://github.com/SienkLogic/plan-build-run/commit/9e314fba49c4caf3acb8ce6aa9bf1745bbf60e38))
* **tools:** close 31 UI consistency gaps found in audit round 2 ([5474721](https://github.com/SienkLogic/plan-build-run/commit/5474721ee821168d7dbe579be7cc8ea9e70b6a7a))
* **tools:** comprehensive codebase review — 33 improvements across 7 waves ([c71fc73](https://github.com/SienkLogic/plan-build-run/commit/c71fc73e4db7d9d41d74d5213a13032a24a9f9b3))
* **tools:** dashboard derives phase statuses from STATE.md frontmatter ([df64307](https://github.com/SienkLogic/plan-build-run/commit/df64307ad3aa3b57c26c470bfc49153d33eb3523))
* **tools:** dashboard parses H3-style ROADMAP.md phases and flexible bold syntax ([aed7970](https://github.com/SienkLogic/plan-build-run/commit/aed797005bac8b44b5bcbdf2fbff663b29c3687d))
* **tools:** dashboard service and route improvements ([8f15934](https://github.com/SienkLogic/plan-build-run/commit/8f159342c17439ee2f29ce795b5711e6224a6ced))
* **tools:** enforce quick task directory creation with CRITICAL markers and hook validation ([d84dc29](https://github.com/SienkLogic/plan-build-run/commit/d84dc293a08988dbee54fd0e779cafcaddf94ec6))
* **tools:** exclude plugin files from context budget tracking + skill refinements ([3ed080d](https://github.com/SienkLogic/plan-build-run/commit/3ed080db73c6f67062c734d962c39a989f9ca67e))
* **tools:** extend executor commit check to quick skill and add .catch() to log-tool-failure ([6dfa22d](https://github.com/SienkLogic/plan-build-run/commit/6dfa22d1527e28c04ca73baa0ad3bdfcc1f1586b))
* **tools:** fix CI lint errors and macOS symlink test failure ([36e9eef](https://github.com/SienkLogic/plan-build-run/commit/36e9eefd5521a41a0aca2b08e875dcc5d91ca0bc))
* **tools:** fix lint errors and bump version to 2.1.0 ([dc522ae](https://github.com/SienkLogic/plan-build-run/commit/dc522aef897fda8fa932216fbef2535162bd594c))
* **tools:** fix release workflow auth and CI lint paths ([e51aeb5](https://github.com/SienkLogic/plan-build-run/commit/e51aeb5bc99ddce694c713a3f849f1d0d4da827b))
* **tools:** handle concurrent write corruption in flaky test across platforms ([e4d443d](https://github.com/SienkLogic/plan-build-run/commit/e4d443d8b1abda0ec4c9a0525f31b7aae82b68c5))
* **tools:** handle empty string race in concurrent .active-skill test on Windows ([b7ec580](https://github.com/SienkLogic/plan-build-run/commit/b7ec580500882b9f9c6e3361e76043f3d36bfe63))
* **tools:** improve dashboard markdown rendering and font loading ([e1201c2](https://github.com/SienkLogic/plan-build-run/commit/e1201c216e6995e6659d29c67b002b1e6e80a5c7))
* **tools:** lower coverage thresholds to match actual coverage after validate-task.js addition ([5464c0d](https://github.com/SienkLogic/plan-build-run/commit/5464c0d0a6e0bb753736be071a61f75cba08acf6))
* **tools:** parse simple two-column roadmap table in dashboard ([2bd3396](https://github.com/SienkLogic/plan-build-run/commit/2bd3396071134480543c32573daa4c825b97cbe9))
* **tools:** prefix unused name var with underscore in version sync test ([e5b4270](https://github.com/SienkLogic/plan-build-run/commit/e5b4270c64a0392782009e1932143e0b84262431))
* **tools:** prevent lifetime LLM metrics from plateauing at 200 entries ([cea6113](https://github.com/SienkLogic/plan-build-run/commit/cea6113313842f155ab5d81391b87ca8cf02aa27))
* **tools:** remove platform-specific rollup dep from dashboard devDependencies ([9fa1ef1](https://github.com/SienkLogic/plan-build-run/commit/9fa1ef1ae53a1699faaee69bd2dfa041c8a66c5c))
* **tools:** remove unsupported --local flag from Copilot plugin install ([a529204](https://github.com/SienkLogic/plan-build-run/commit/a529204e1c0fd29080af9bbb2cb9b7e1aa5feb4f))
* **tools:** resolve lint errors in cross-plugin compat tests ([afeb49f](https://github.com/SienkLogic/plan-build-run/commit/afeb49fa88fe7a82772142c652be9c73be4be9ed))
* **tools:** resolve lint errors in statusline workflow rules ([88404ff](https://github.com/SienkLogic/plan-build-run/commit/88404ffe3d1a4d725a68a9472e5aa9dc05f06bcf))
* **tools:** resolve markdownlint errors in planner agent and milestone skill ([f715251](https://github.com/SienkLogic/plan-build-run/commit/f715251e59d01eb81ad2c3a91e460b8cb180bc0e))
* **tools:** resolve npm audit vulnerabilities via overrides ([40f0683](https://github.com/SienkLogic/plan-build-run/commit/40f0683fce2c205915b1196b38b4d50eacf94360))
* **tools:** revert npm overrides and relax audit level to critical ([2ab209d](https://github.com/SienkLogic/plan-build-run/commit/2ab209d1cb736d15d382bc8d34df7d93b0c44007))
* **tools:** revert release branch CI trigger (using non-strict protection instead) ([0f7059a](https://github.com/SienkLogic/plan-build-run/commit/0f7059a46c4d897fe02f6a496face072c1a38c91))
* **tools:** standardize error messages with severity prefix and actionable next-steps ([dee295e](https://github.com/SienkLogic/plan-build-run/commit/dee295e2dcba29611cad6d3338e327fee95a37f0))
* **tools:** sync dashboard skill argument-hint to cursor plugin ([082c002](https://github.com/SienkLogic/plan-build-run/commit/082c0022d453bc82597148c69dba6bf82cbc7906))
* **tools:** sync dashboard skill paths and missing templates across all plugins ([72c64d2](https://github.com/SienkLogic/plan-build-run/commit/72c64d234ff131c5ed036ce1222b0927b2b7d935))
* **tools:** trigger CI on release-please branch pushes for auto-merge ([8dffb9d](https://github.com/SienkLogic/plan-build-run/commit/8dffb9dee50850d5540431bfcc80116c3d06e6dc))
* **tools:** update AskUserQuestion audit to reflect health skill auto-fix gates ([df9d395](https://github.com/SienkLogic/plan-build-run/commit/df9d395c5dc174abe42079a3f1834f8b96437278))
* **tools:** update critical agents to use model: sonnet instead of inherit ([c7dbc5e](https://github.com/SienkLogic/plan-build-run/commit/c7dbc5e0be188de8eac493b85e20c4c74f8c4f42))
* **tools:** update validation script to handle run-hook.js bootstrap pattern ([07d32f3](https://github.com/SienkLogic/plan-build-run/commit/07d32f3b43225427e320e9ef4348a6b1d85e0611))
* **tools:** use RELEASE_PAT for release-please to trigger CI on PRs ([bf6a7ca](https://github.com/SienkLogic/plan-build-run/commit/bf6a7cab706357a7d7a83b3f06d9bc9029758efc))
* **tools:** warn on context budget tracker reset and roadmap sync parse failures ([974e15b](https://github.com/SienkLogic/plan-build-run/commit/974e15bef1085a38702d7e6662f8b5865dd3b2a4))


### Documentation

* **08-03:** add agent-contracts.md reference documenting handoff schemas ([40e46f5](https://github.com/SienkLogic/plan-build-run/commit/40e46f53c30e0bcac38c56e1c44bde477e4dba68))
* **09-01:** add setup scripts and improve installation instructions ([acaa201](https://github.com/SienkLogic/plan-build-run/commit/acaa201298fe368c8c8729ba3fdcfe9db7301d02))
* **10-01:** wire agent-contracts.md into agents and document abandoned debug resolution ([3455aa5](https://github.com/SienkLogic/plan-build-run/commit/3455aa5280b9500f0744d8bcb11034d53173c04a))
* **27-01:** add no-reread anti-pattern to executor agents across all plugins ([6cdc920](https://github.com/SienkLogic/plan-build-run/commit/6cdc92085f1e95e454d0726269090921cbfe475f))
* **34-01:** mark all LLM-01 through LLM-34 traceability entries as Verified ([cb94599](https://github.com/SienkLogic/plan-build-run/commit/cb94599ea25cbad9ae9bcc280dd37079ff930626))
* **quick-002:** add .active-skill stale detection to health Check 10 ([1027fc2](https://github.com/SienkLogic/plan-build-run/commit/1027fc2bebb8f634511baab92e7ce4bee00575f7))
* **quick-002:** fix NEXT UP banner indentation in milestone SKILL.md ([d21dcb2](https://github.com/SienkLogic/plan-build-run/commit/d21dcb22f9162f63242ba3f486f659394332a6b6))
* **quick-002:** replace arrow-list with bullet style in help SKILL.md ([2f1ffb5](https://github.com/SienkLogic/plan-build-run/commit/2f1ffb528344d43fc7281af5fb3c72ced01c6068))
* **quick-005:** add Local LLM nav link and mention in feature highlights ([c73a775](https://github.com/SienkLogic/plan-build-run/commit/c73a775d9cb30b0145f5d339abd3f9422ca59463))
* **quick-005:** add Local LLM Offload section and update stats across README and Getting Started ([85c0ef7](https://github.com/SienkLogic/plan-build-run/commit/85c0ef74d5763e07ba16e702688ce3c2a50769eb))
* **tools:** add /pbr:dashboard command to README dashboard section ([9fe3ab9](https://github.com/SienkLogic/plan-build-run/commit/9fe3ab9991f6ca9a3363505f75c3b659a9e4aa4a))
* **tools:** add missing 2.3.0 and 2.3.1 changelog entries ([7519b5c](https://github.com/SienkLogic/plan-build-run/commit/7519b5c2b092f9a384d9189ec3acd4f7cd5f94e8))
* **tools:** document minimum Claude Code v2.1.47 requirement for Windows hooks ([313755a](https://github.com/SienkLogic/plan-build-run/commit/313755af9193c2be9bf0f2e0b23e993e18bb00e6))
* **tools:** fix banner consistency, add status/continue/do comparison, fix continue description ([ecf883c](https://github.com/SienkLogic/plan-build-run/commit/ecf883cde78d663583aa967593cc5e768cefb46c))
* **tools:** make platform badges clickable links to install pages ([9a45891](https://github.com/SienkLogic/plan-build-run/commit/9a4589145cd816572414a1b7fb517cc39be8f66d))
* **tools:** remove internal v2 research doc, update user-facing docs ([212c21a](https://github.com/SienkLogic/plan-build-run/commit/212c21a9fad0786fad3ea189239e5f608773d038))
* **tools:** resize header logo to 550px width ([81d029d](https://github.com/SienkLogic/plan-build-run/commit/81d029da42df851682fe9754f9fda0f8c9196e15))
* **tools:** update changelog for 2.0.0 publish, fix test counts, add npm badge ([b268809](https://github.com/SienkLogic/plan-build-run/commit/b26880931e37086d32ee4ee6513faac0a98ee337))
* **tools:** update demo GIF ([06c0776](https://github.com/SienkLogic/plan-build-run/commit/06c07762469a6b54e26792b1a33e66525918b532))
* **tools:** update demo GIF and rebrand demo scripts ([c641e1c](https://github.com/SienkLogic/plan-build-run/commit/c641e1cd310ae355413bd83693adfeb066ac4be1))
* **tools:** update header logo ([d74a087](https://github.com/SienkLogic/plan-build-run/commit/d74a087fb7b3e2d99a1fbb17a6366bcc2d03d09c))
* **tools:** update header logo to pbr_banner_logo.png ([732406e](https://github.com/SienkLogic/plan-build-run/commit/732406e5816d525c27fba1b96cc56af559324d15))
* **tools:** update README with Copilot CLI support and current stats ([d2a1d4c](https://github.com/SienkLogic/plan-build-run/commit/d2a1d4cdf7ab5a09e005725d6bf1378792a4f0bd))
* **tools:** update README with Cursor plugin section and CHANGELOG for v2.1.0 ([009feaa](https://github.com/SienkLogic/plan-build-run/commit/009feaa9bbfb07aaf137496bf829876a47e5f333))
* update CLAUDE.md coverage thresholds to 70% and test count to ~1666 ([8cab4dd](https://github.com/SienkLogic/plan-build-run/commit/8cab4dd8f45d307fa1b41721949db4afc4d39770))

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
