# Requirements

## v1 (Committed)

### Plugin Infrastructure
- **PLUG-01:** Cursor plugin manifest (`plugin.json`) with valid schema, name, version, description, author, logo
- **PLUG-02:** Directory structure following Cursor plugin conventions (skills/, agents/, rules/, hooks/, commands/)
- **PLUG-03:** Marketplace configuration supporting both Claude Code and Cursor plugins in same repo

### Agents
- **AGENT-01:** All 10 agents (researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer, general) ported with Cursor-compatible frontmatter

### Rules
- **RULE-01:** Workflow rules converted to `.mdc` format with proper `alwaysApply`/`globs` frontmatter

### Skills
- **SKILL-01:** 6 core workflow skills (begin, plan, build, review, status, continue) ported and functional
- **SKILL-02:** Core workflow end-to-end functional: begin -> plan -> build -> review
- **SKILL-03:** 15 supporting skills (config, debug, discuss, explore, health, help, import, milestone, note, pause, quick, resume, scan, setup, todo) ported and functional

### Hooks
- **HOOK-01:** Hooks.json adapted to Cursor's hook event format with shared scripts
- **HOOK-02:** All hook events functional: session lifecycle, pre/post tool use, subagent lifecycle

### Templates & References
- **TMPL-01:** All templates accessible from Cursor plugin skills (no duplication where possible)
- **REF-01:** All references (plan format, commit conventions, UI formatting, deviation rules) available

### Testing
- **TEST-01:** Plugin installs and loads in Cursor without errors
- **TEST-02:** Core workflow functional end-to-end in Cursor

### Compatibility
- **COMPAT-01:** Both plugins coexist — shared `.planning/` state, no conflicts
- **COMPAT-02:** Cross-plugin workflow works (start in one, continue in the other)

### Distribution
- **DIST-01:** README, logo, changelog complete for marketplace submission
- **DIST-02:** Plugin submitted to Cursor marketplace

## Local LLM Offload (Committed)

### Foundation
- **LLM-01:** Local LLM client library (`scripts/local-llm/client.js`) using Node 18+ native `fetch()`, zero npm dependencies
- **LLM-02:** Health check module detecting Ollama availability, model readiness, and version; pre-warms model on session start
- **LLM-03:** Config schema extension (`local_llm` block in config-schema.json) with provider, endpoint, model, timeout, features, metrics, and advanced settings
- **LLM-04:** Graceful degradation — Ollama unavailable = silent disable, 3 consecutive failures = disable for session, never bubbles errors to user

### Hook Integration
- **LLM-05:** Artifact classification operations — classify PLAN.md (stub/partial/complete), SUMMARY.md (substantive/stub), VERIFICATION.md quality
- **LLM-06:** Task XML coherence validation — check action/verify/done alignment in `check-plan-format.js`
- **LLM-07:** Error type classification — categorize errors (syntax/runtime/network/auth/dependency/unknown) for debugger support
- **LLM-08:** Gate assessment enhancement — advisory quality scoring in `validate-task.js` gate functions (plan substantiveness, plan adequacy vs goal, milestone readiness)
- **LLM-09:** `pbr-tools.js` CLI subcommands: `llm classify`, `llm score`, `llm validate`, `llm detect-gaps`, `llm health`
- **LLM-10:** All local LLM hook calls are advisory (warnings), never blocking — existing verification chain remains authoritative

### Metrics & Comparison
- **LLM-11:** Per-call metrics logging to `.planning/local-llm-metrics.jsonl` (operation, model, latency, tokens, result, fallback, confidence)
- **LLM-12:** Session-end summary displaying local calls made, frontier tokens saved, fallback rate, total overhead
- **LLM-13:** `/pbr:status` enhancement showing local LLM stats (calls, tokens saved, avg latency, lifetime totals)
- **LLM-14:** Dashboard widget — visual comparison of frontier token usage with/without offload, latency charts, local/frontier/fallback split
- **LLM-15:** Baseline measurement mechanism — estimate frontier tokens per hook type to quantify savings

### Adaptive Router
- **LLM-16:** Stage 1 complexity heuristic — pre-call routing based on token count, code blocks, constraint count, reasoning markers, output format requirements (~0ms overhead)
- **LLM-17:** Stage 2 confidence gate — post-call logprob extraction from Ollama, accept/retry/fallback thresholds (>90% accept, 50-90% retry, <50% frontier)
- **LLM-18:** Three routing strategies configurable: `local_first` (try local, fallback on low confidence), `balanced` (heuristic routes), `quality_first` (only offload obvious classifications)
- **LLM-19:** Per-operation routing configuration — each feature (artifact_classification, task_validation, etc.) independently enable/disable

### Agent Support
- **LLM-20:** Researcher source-scoring — S0-S6 credibility classification offloaded to local LLM
- **LLM-21:** Debugger error classification — error log parsing and categorization as pre-processing step
- **LLM-22:** Context summarization — compress project state (20+ docs) into 2-3 paragraph summary for skill pre-work
- **LLM-23:** Agent prompt injection points — optional `if config.local_llm.enabled` blocks in executor, verifier, planner for self-check offloading

### Adaptive & Self-Improving
- **LLM-24:** Routing decision log (`.planning/local-llm-routing.jsonl`) tracking per-operation-type success/failure rates
- **LLM-25:** Self-adjusting thresholds — confidence thresholds shift ±0.05 when failure rate exceeds 20% or drops below 5% (minimum 20 samples per operation type)
- **LLM-26:** Shadow mode (spot-check) — 10% of local-routed calls also run frontier, comparison logged for quality validation
- **LLM-27:** Agreement rate monitoring — alert if local/frontier divergence exceeds 20% over 50 samples for any operation type

### Testing & Documentation
- **LLM-28:** Unit tests for client, router, health check, metrics (mock Ollama, no real LLM needed)
- **LLM-29:** Integration tests using TinyLlama in CI (GitHub Actions `ai-action/setup-ollama`), gated by `LOCAL_LLM_AVAILABLE` env var
- **LLM-30:** Cross-platform compatibility — Windows (MSYS path handling), macOS, Linux; `num_ctx: 4096` enforced
- **LLM-31:** User documentation — setup guide (Ollama install, model pull, config toggle), hardware requirements, troubleshooting (Defender, Smart App Control)
- **LLM-32:** POC script (`scripts/local-llm-poc.js`) ships as diagnostic tool for users to validate their hardware

### Cross-Plugin Sync
- **LLM-33:** All new scripts, config schema changes, and skill updates synced to cursor-pbr and copilot-pbr
- **LLM-34:** Hooks.json updated in all 3 plugins for any new hook events related to local LLM

## Deferred (Post Local LLM)

| Feature | Reason Deferred |
|---------|----------------|
| Cursor-specific UI enhancements | Focus on parity first, optimize for Cursor UX later |
| Cursor Composer integration | Not documented in current plugin spec |
| MCP server bundling | PBR doesn't need MCP servers currently |
| Full agent offload (entire agents on local LLM) | Requires v4 router maturity; revisit when local models reach 14B+ quality |
| LM Studio provider adapter | Ollama first; LM Studio shares API format, easy to add later |
| Custom model fine-tuning for PBR operations | Premature — validate with off-the-shelf models first |

## Out of Scope

| Feature | Rationale |
|---------|-----------|
| Rewriting Claude Code plugin | This is a port, not a rewrite |
| Cursor-only features with no Claude Code equivalent | Maintain parity, don't diverge |
| Changing the `.planning/` file format | Both plugins must share state |
| Bundling Ollama with PBR | Users install Ollama separately; PBR only provides the integration |
| Supporting non-OpenAI-compatible LLM APIs | Too fragmented; OpenAI format is the standard |
| GPU driver management or hardware detection | Ollama handles this; PBR stays at HTTP API level |

## Traceability — Local LLM Offload

| REQ-ID | Phase | Status |
|--------|-------|--------|
| LLM-01 | 28 | Verified |
| LLM-02 | 28 | Verified |
| LLM-03 | 28 | Verified |
| LLM-04 | 28 | Verified |
| LLM-05 | 29 | Verified |
| LLM-06 | 29 | Verified |
| LLM-07 | 29 | Verified |
| LLM-08 | 29 | Verified |
| LLM-09 | 29 | Verified |
| LLM-10 | 29 | Verified |
| LLM-11 | 30 | Verified |
| LLM-12 | 30 | Verified |
| LLM-13 | 30 | Verified |
| LLM-14 | 30 | Verified |
| LLM-15 | 30 | Verified |
| LLM-16 | 31 | Verified |
| LLM-17 | 31 | Verified |
| LLM-18 | 31 | Verified |
| LLM-19 | 31 | Verified |
| LLM-20 | 32 | Verified |
| LLM-21 | 32 | Verified |
| LLM-22 | 32 | Verified |
| LLM-23 | 32 | Verified |
| LLM-24 | 33 | Verified |
| LLM-25 | 33 | Verified |
| LLM-26 | 33 | Verified |
| LLM-27 | 33 | Verified |
| LLM-28 | 28-33 | Verified |
| LLM-29 | 33 | Verified |
| LLM-30 | 28 | Verified |
| LLM-31 | 33 | Verified |
| LLM-32 | 28 | Verified |
| LLM-33 | 28-33 | Verified |
| LLM-34 | 29 | Verified |
