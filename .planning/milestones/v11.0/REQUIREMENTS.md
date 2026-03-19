# Requirements: PBR 2.0 — Acceleration Framework (v5.0)

## Cross-Cutting Requirements

- **REQ-XC-001**: Every feature item (1-47) MUST have a config toggle in config-schema.json that can disable it. All toggles default to `true` for quality profile, `false` for budget profile. No feature should be forced on.
- **REQ-XC-002**: All features must work on Node 18/20/22 across Windows, macOS, Linux (CI matrix).
- **REQ-XC-003**: All features must maintain backward compatibility — 200k models must work unchanged when features are disabled.
- **REQ-XC-004**: All new config properties must have JSON Schema validation, defaults, and descriptions.
- **REQ-XC-005**: All features must have corresponding test coverage (maintain 70/68/70/70 thresholds).
- **REQ-XC-006**: All features must have LEARNINGS.md documenting what the agent learned during implementation.
- **REQ-XC-007**: Every feature must be auditable — the `/pbr:audit` skill must be able to detect whether each feature is active, firing correctly, and producing expected results. Each feature's hook/agent adds audit evidence to `.planning/logs/` that the audit agent can check.
- **REQ-XC-008**: Each feature must have a health check callable via `pbr-tools.cjs validate health` that reports enabled/disabled/healthy/degraded status per feature.

## Phase 01: Foundation — Enhanced SessionStart & Context Quality

- [x] **REQ-F01-001**: SessionStart briefing injects ~500 tokens of structured context (state, recent commits, pending decisions, working set) via progress-tracker.js
- [x] **REQ-F01-002**: Config toggle: `features.enhanced_session_start` (default: true for quality profile)
- [x] **REQ-F01-003**: Context quality scoring system tracks signal-to-noise ratio of current context window
- [x] **REQ-F01-004**: Config toggle: `features.context_quality_scoring` (default: true)
- [x] **REQ-F01-005**: Skip-RAG pattern: for projects under 50k lines, option to load entire codebase into context at session start
- [x] **REQ-F01-006**: Config toggle: `features.skip_rag` with `skip_rag_max_lines` threshold (default: 50000)
- [x] **REQ-F01-007**: Orchestrator context budget expanded to 25-35% (configurable via `orchestrator_budget_pct`, default: 25)

## Phase 02: Inline Execution & Smart Delegation

- [x] **REQ-F02-001**: Orchestrator executes tasks inline when <5 files and <50 lines of changes
- [x] **REQ-F02-002**: Config toggle: `features.inline_simple_tasks` with `inline_max_files` (default: 5) and `inline_max_lines` (default: 50)
- [x] **REQ-F02-003**: Agent prompts enriched with full project context when context budget allows
- [x] **REQ-F02-004**: Config toggle: `features.rich_agent_prompts` (default: true)
- [x] **REQ-F02-005**: Orchestrator can hold 3-4 phase plans simultaneously in context
- [x] **REQ-F02-006**: Config toggle: `features.multi_phase_awareness` with `max_phases_in_context` (default: 3)

## Phase 03: Zero-Friction Quick Tasks

- [x] **REQ-F03-001**: Quick tasks execute with ≤2 tool calls before code runs (down from 6)
- [x] **REQ-F03-002**: Config toggle: `features.zero_friction_quick` (default: true)
- [x] **REQ-F03-003**: SUMMARY.md auto-generated from git history and hook logs after execution
- [x] **REQ-F03-004**: Config toggle: `features.post_hoc_artifacts` (default: true)

## Phase 04: Natural Language Routing & Adaptive Ceremony

- [x] **REQ-F04-001**: Freeform text auto-detected and routed to correct skill (quick/phase/debug/explore)
- [x] **REQ-F04-002**: Config toggle: `features.natural_language_routing` (default: true)
- [x] **REQ-F04-003**: Risk-based ceremony: low-risk (inline, no plan), medium-risk (lightweight plan), high-risk (full plan-build-verify)
- [x] **REQ-F04-004**: Config toggle: `features.adaptive_ceremony` with `ceremony_level` override (default: "auto")

## Phase 05: Decision Journal & Negative Knowledge

- [x] **REQ-F05-001**: .planning/decisions/ directory with markdown files recording decision rationale, alternatives, context
- [x] **REQ-F05-002**: Config toggle: `features.decision_journal` (default: true)
- [x] **REQ-F05-003**: Negative knowledge tracking — what failed and why, surfaced when similar paths are touched
- [x] **REQ-F05-004**: Config toggle: `features.negative_knowledge` (default: true)
- [ ] **REQ-F05-005**: Requirements status auto-updates as phases complete (living traceability)
- [ ] **REQ-F05-006**: Config toggle: `features.living_requirements` (default: true)

## Phase 06: Convention Memory & Mental Model Snapshots

- [x] **REQ-F06-001**: .planning/conventions/ auto-learned from code patterns (naming, testing, architecture)
- [x] **REQ-F06-002**: Config toggle: `features.convention_memory` (default: true)
- [x] **REQ-F06-003**: Mental model snapshots capture working context (files, thinking, decisions pending) beyond position
- [x] **REQ-F06-004**: Config toggle: `features.mental_model_snapshots` (default: true)

## Phase 07: Trust Tracking & Confidence Calibration

- [x] **REQ-F07-001**: .planning/trust/ tracks pass/fail rates per agent type and task category
- [x] **REQ-F07-002**: Config toggle: `features.trust_tracking` (default: true)
- [x] **REQ-F07-003**: Confidence scores on deliverables based on historical accuracy (not model self-assessment)
- [x] **REQ-F07-004**: Config toggle: `features.confidence_calibration` (default: true)

## Phase 08: Graduated Verification & Self-Verification

- [x] **REQ-F08-001**: Verification depth adjusts based on trust score: light/standard/thorough
- [x] **REQ-F08-002**: Config toggle: `features.graduated_verification` (default: true)
- [ ] **REQ-F08-003**: Agents self-verify output before presenting to user (pre-review)
- [x] **REQ-F08-004**: Config toggle: `features.self_verification` (default: true)
- [x] **REQ-F08-005**: Progressive autonomy ladder: supervised → guided → collaborative → adaptive
- [x] **REQ-F08-006**: Config toggle: `autonomy.level` (default: "supervised", options: supervised/guided/collaborative/adaptive)

## Phase 09: Proactive Intelligence

- [x] **REQ-F09-001**: Smart next-task suggestion using dependency graph analysis (critical path)
- [x] **REQ-F09-002**: Config toggle: `features.smart_next_task` (default: true)
- [x] **REQ-F09-003**: Dependency break detection — warn when upstream changes invalidate downstream plans
- [x] **REQ-F09-004**: Config toggle: `features.dependency_break_detection` (default: true)
- [ ] **REQ-F09-005**: Pre-research for upcoming phases spawned in background at 70%+ phase completion
- [x] **REQ-F09-006**: Config toggle: `features.pre_research` (default: true)
- [ ] **REQ-F09-007**: Pattern-based auto-routing — file modification patterns trigger specialized agents
- [x] **REQ-F09-008**: Config toggle: `features.pattern_routing` (default: true)
- [x] **REQ-F09-009**: Continuous tech debt surfacing in status dashboard
- [x] **REQ-F09-010**: Config toggle: `features.tech_debt_surfacing` (default: true)

## Phase 10: Post-Hoc Artifacts & Compliance Evolution

- [x] **REQ-F10-001**: Extended post-hoc artifact generation for SUMMARY.md and LEARNINGS.md from git + hooks
- [ ] **REQ-F10-002**: Agent feedback loop — verification results feed back into agent system prompts
- [x] **REQ-F10-003**: Config toggle: `features.agent_feedback_loop` (default: true)
- [ ] **REQ-F10-004**: Session metrics dashboard at session end (time, phases, agents, tokens, cost, compliance)
- [x] **REQ-F10-005**: Config toggle: `features.session_metrics` (default: true)

## Phase 11: Spec-Driven Development

- [x] **REQ-F11-001**: Machine-executable PLAN.md with structured task definitions and programmatic execution
- [x] **REQ-F11-002**: Config toggle: `features.machine_executable_plans` (default: false — experimental)
- [x] **REQ-F11-003**: Semantic spec diffing for plan changes
- [x] **REQ-F11-004**: Config toggle: `features.spec_diffing` (default: true)
- [x] **REQ-F11-005**: Reverse spec generation from existing code
- [x] **REQ-F11-006**: Config toggle: `features.reverse_spec` (default: true)
- [x] **REQ-F11-007**: Predictive impact analysis using architecture graph
- [x] **REQ-F11-008**: Config toggle: `features.predictive_impact` (default: true)

## Phase 12: Living Architecture Graph

- [x] **REQ-F12-001**: .planning/codebase/graph.json — queryable, incrementally-updated codebase graph
- [ ] **REQ-F12-002**: Config toggle: `features.architecture_graph` (default: true)
- [x] **REQ-F12-003**: Architecture consistency guard — detect pattern violations in real-time
- [ ] **REQ-F12-004**: Config toggle: `features.architecture_guard` (default: true)

## Phase 13: Multi-Agent Evolution

- [ ] **REQ-F13-001**: Agent teams working in parallel on isolated git worktrees
- [ ] **REQ-F13-002**: Config toggle: `features.agent_teams` (default: false — experimental)
- [ ] **REQ-F13-003**: Competing hypotheses — spawn 2-3 agents with different approaches, compare results
- [ ] **REQ-F13-004**: Config toggle: `features.competing_hypotheses` (default: false — experimental)
- [ ] **REQ-F13-005**: Dynamic team composition based on task requirements
- [ ] **REQ-F13-006**: Config toggle: `features.dynamic_teams` (default: false — experimental)

## Phase 14: Quality & Safety

- [x] **REQ-F14-001**: Multi-layer validation — 8 parallel review passes per change (BugBot pattern)
- [x] **REQ-F14-002**: Config toggle: `features.multi_layer_validation` with `validation_passes` list (default: ["correctness", "security"])
- [x] **REQ-F14-003**: Regression prevention — smart test selection based on change impact
- [x] **REQ-F14-004**: Config toggle: `features.regression_prevention` (default: true)
- [x] **REQ-F14-005**: Security-aware development — OWASP scanning integrated into build phase
- [x] **REQ-F14-006**: Config toggle: `features.security_scanning` (default: true)

## Phase 15: Developer Experience

- [x] **REQ-F15-001**: Progress visualization with real-time agent activity and dependency graph
- [x] **REQ-F15-002**: Config toggle: `features.progress_visualization` (default: true)
- [x] **REQ-F15-003**: Contextual help based on current activity (not generic /help)
- [x] **REQ-F15-004**: Config toggle: `features.contextual_help` (default: true)
- [x] **REQ-F15-005**: Team onboarding mode — AI-generated project walkthrough for new developers
- [x] **REQ-F15-006**: Config toggle: `features.team_onboarding` (default: true)

## Phase 16: Cross-Project Intelligence

- [x] **REQ-F16-001**: ~/.claude/patterns/ global pattern library extracted from successful projects
- [x] **REQ-F16-002**: Config toggle: `features.cross_project_patterns` (default: true)
- [x] **REQ-F16-003**: Reusable spec templates for common patterns (auth, CRUD, payments)
- [x] **REQ-F16-004**: Config toggle: `features.spec_templates` (default: true)
- [x] **REQ-F16-005**: Global learnings — verification insights aggregated across projects
- [x] **REQ-F16-006**: Config toggle: `features.global_learnings` (default: true)
