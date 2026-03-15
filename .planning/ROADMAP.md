# Roadmap: PBR Enhancement

## Milestone: PBR Enhancement v1.0
**Goal:** Fix known bugs, harden hook and skill systems, improve developer experience, and reach test coverage thresholds across all platforms
**Phases:** 1 - 7
**Requirement coverage:** 30/30 requirements mapped

### Phase Checklist
- [ ] Phase 01: Critical Bug Fixes — Fix file creation, naming, output paths, and installer validation
- [ ] Phase 02: Initialization Quality — Deep adaptive questioning and research phase for project setup
- [ ] Phase 03: Hook System Hardening — Cross-platform dispatch, graceful error handling, performance
- [ ] Phase 04: Skill Reliability — Graceful state handling, correct chaining, plan quality, execution
- [ ] Phase 05: Developer Experience — Progress view, health checks, quick tasks, settings UI
- [ ] Phase 06: Dashboard and Derivatives — Dashboard rendering, live updates, derivative sync
- [ ] Phase 07: Testing and Quality Gate — Coverage thresholds, cross-platform CI, agent prompt size

### Phase 01: Critical Bug Fixes
**Goal:** Fix the blocking bugs discovered during testing so that core PBR workflows (new-project, plan-phase, map-codebase) produce correct output
**Discovery:** low
**Provides:** Working /pbr:new-project that creates all state files, correct plan naming in planner agent, correct scan output paths, installer that validates script existence
**Depends on:** None
**Requirements:** REQ-F-001, REQ-F-002, REQ-F-003, REQ-F-006

### Phase 02: Initialization Quality
**Goal:** Make project initialization thorough — deep adaptive questioning (10-20+ rounds) and parallel research with synthesis before roadmap creation
**Discovery:** medium
**Provides:** Adaptive questioning flow in new-project skill, 4-researcher + synthesizer pipeline in begin/plan skills
**Depends on:** Phase 01
**Requirements:** REQ-F-004, REQ-F-005

### Phase 03: Hook System Hardening
**Goal:** Ensure all hook dispatch scripts route correctly on Windows, macOS, and Linux, handle missing state gracefully, and execute within performance budget
**Discovery:** low
**Provides:** Cross-platform dispatch routing, graceful .planning/ absence handling, STATE.md preservation through compaction, config-gated auto-continue, sub-500ms hook execution
**Depends on:** None
**Requirements:** REQ-F-016, REQ-F-017, REQ-F-018, REQ-F-019, REQ-NF-001

### Phase 04: Skill Reliability
**Goal:** Make skills robust against malformed state, ensure correct command chaining, and improve plan quality so plans pass checker on first attempt
**Discovery:** medium
**Provides:** Graceful STATE.md error handling across all skills, correct /pbr:continue chaining, first-pass plan-checker compliance, multi-plan execution in execute-phase, actionable hook error messages
**Depends on:** Phase 01, Phase 03
**Requirements:** REQ-F-007, REQ-F-008, REQ-F-009, REQ-F-010, REQ-F-014

### Phase 05: Developer Experience
**Goal:** Add user-facing quality-of-life features — progress overview, health diagnostics, ad-hoc quick tasks, and interactive settings
**Discovery:** medium
**Provides:** /pbr:progress one-view display, /pbr:health with auto-fix, /pbr:quick atomic task flow, /pbr:settings interactive config editor
**Depends on:** Phase 04
**Requirements:** REQ-F-011, REQ-F-012, REQ-F-013, REQ-F-015

### Phase 06: Dashboard and Derivatives
**Goal:** Ensure dashboard renders any valid .planning/ directory with live updates, and derivative plugins stay in sync with source
**Discovery:** low
**Provides:** Dashboard launch and render for arbitrary projects, sub-2s WebSocket file change updates, accurate phase/roadmap/state display, consistent derivative generation, zero-drift sync verification
**Depends on:** Phase 01
**Requirements:** REQ-F-020, REQ-F-021, REQ-F-022, REQ-F-023, REQ-F-024

### Phase 07: Testing and Quality Gate
**Goal:** Reach coverage thresholds, ensure cross-platform CI passes on Node 18/20/22, validate agent prompt sizes, and confirm clean plugin load
**Discovery:** low
**Provides:** Test files for all hook scripts, green CI on all platform/node combinations, coverage at or above thresholds (58/54/62/58), agent prompts under 8000 tokens, clean plugin load
**Depends on:** Phase 03, Phase 04, Phase 05, Phase 06
**Requirements:** REQ-F-025, REQ-F-026, REQ-F-027, REQ-NF-002, REQ-NF-003

## Progress
| Phase | Name | Status | Requirements |
|-------|------|--------|-------------|
| 01 | Critical Bug Fixes | Complete | 3/3 |
| 02 | Initialization Quality | Complete | 2/2 |
| 03 | Hook System Hardening | Complete | 3/3 |
| 04 | Skill Reliability | Planned (0/3) | REQ-F-007, REQ-F-008, REQ-F-009, REQ-F-010, REQ-F-014 |
| 05 | Developer Experience | Planned (0/2) | REQ-F-011, REQ-F-012, REQ-F-013, REQ-F-015 |
| 06 | Dashboard and Derivatives | Complete | 2/2 |
| 07 | Testing and Quality Gate | Pending | REQ-F-025, REQ-F-026, REQ-F-027, REQ-NF-002, REQ-NF-003 |
