'use strict';

/**
 * Audit Dimension Registry
 *
 * Central registry of all audit dimensions used by /pbr:audit.
 * Each dimension has a hybrid code+slug ID (e.g., SI-01:skill-template-refs),
 * category, severity, description, phase origin, and source field.
 *
 * Dimension schema:
 *   id            - Hybrid code+slug (e.g., "SI-01:skill-template-refs")
 *   code          - Short code for CLI/reports (e.g., "SI-01")
 *   slug          - Slug for CLI (e.g., "skill-template-refs")
 *   category      - Config category key (e.g., "self_integrity")
 *   categoryCode  - Category prefix (e.g., "SI")
 *   severity      - Default severity: "error" | "warning" | "info"
 *   description   - Human-readable one-liner
 *   phaseOrigin   - ROADMAP phase number that implements this dimension
 *   source        - "builtin" (future: "custom" for user-defined dimensions)
 *   thresholdKey  - Config audit.thresholds key if applicable, else null
 */

// ---------------------------------------------------------------------------
// Category codes -> config.json audit.categories keys
// ---------------------------------------------------------------------------
const CATEGORIES = {
  AC: 'audit_config',
  SI: 'self_integrity',
  IH: 'infrastructure',
  EF: 'error_analysis',
  WC: 'workflow_compliance',
  BC: 'behavioral_compliance',
  SQ: 'session_quality',
  FV: 'feature_verification',
  QM: 'quality_metrics',
};

// ---------------------------------------------------------------------------
// Presets -> arrays of category keys
// ---------------------------------------------------------------------------
const PRESETS = {
  minimal: ['self_integrity', 'infrastructure'],
  standard: [
    'self_integrity',
    'infrastructure',
    'error_analysis',
    'workflow_compliance',
  ],
  comprehensive: [
    'audit_config',
    'self_integrity',
    'infrastructure',
    'error_analysis',
    'workflow_compliance',
    'behavioral_compliance',
    'session_quality',
    'feature_verification',
    'quality_metrics',
  ],
  custom: [],
};

// ---------------------------------------------------------------------------
// Helper to build a dimension entry
// ---------------------------------------------------------------------------
function dim(code, slug, category, categoryCode, severity, description, phaseOrigin, thresholdKey) {
  return {
    id: `${code}:${slug}`,
    code,
    slug,
    category,
    categoryCode,
    severity,
    description,
    phaseOrigin,
    source: 'builtin',
    thresholdKey: thresholdKey || null,
  };
}

// ---------------------------------------------------------------------------
// DIMENSIONS array — all ~88 dimensions from ROADMAP phases 1-9
// ---------------------------------------------------------------------------
const DIMENSIONS = [

  // =========================================================================
  // AC — Audit Config (Phase 1) — 1 dimension
  // =========================================================================
  dim('AC-01', 'config-schema-completeness', 'audit_config', 'AC', 'warning',
    'Config schema completeness — detect config vs schema drift', 1, null),

  // =========================================================================
  // SI — Self-Integrity (Phase 2) — 15 dimensions
  // =========================================================================
  dim('SI-01', 'skill-template-refs', 'self_integrity', 'SI', 'error',
    'Skill template reference validation — all ${CLAUDE_SKILL_DIR}/templates/ refs resolve', 2, null),
  dim('SI-02', 'skill-shared-fragment-refs', 'self_integrity', 'SI', 'error',
    'Skill shared fragment reference validation — all skills/shared/*.md refs exist', 2, null),
  dim('SI-03', 'skill-reference-file-links', 'self_integrity', 'SI', 'error',
    'Skill reference file link validation — all references/*.md links exist', 2, null),
  dim('SI-04', 'skill-agent-type-refs', 'self_integrity', 'SI', 'error',
    'Skill to agent type reference validation — all subagent_type: "pbr:X" map to existing agents', 2, null),
  dim('SI-05', 'skill-agent-completion-markers', 'self_integrity', 'SI', 'error',
    'Skill/agent completion marker contract — skills check same markers agents output', 2, null),
  dim('SI-06', 'agent-frontmatter-validity', 'self_integrity', 'SI', 'error',
    'Agent frontmatter validity — name, description, model, tools present', 2, null),
  dim('SI-07', 'agent-tool-list-accuracy', 'self_integrity', 'SI', 'warning',
    'Agent tool list accuracy — listed tools match actual needs', 2, null),
  dim('SI-08', 'hook-script-existence', 'self_integrity', 'SI', 'error',
    'Hook script existence — all hooks.json entries point to existing scripts', 2, null),
  dim('SI-09', 'pretooluse-stdout-compliance', 'self_integrity', 'SI', 'error',
    'PreToolUse stdout compliance — all PreToolUse hooks emit JSON on stdout', 2, null),
  dim('SI-10', 'command-skill-mapping', 'self_integrity', 'SI', 'error',
    'Command to skill mapping validity — all commands point to existing skills', 2, null),
  dim('SI-11', 'config-schema-code-consistency', 'self_integrity', 'SI', 'warning',
    'Config schema vs code consistency — settings in code exist in schema', 2, null),
  dim('SI-12', 'plugin-manifest-version-sync', 'self_integrity', 'SI', 'error',
    'Plugin manifest version sync — plugin.json matches package.json', 2, null),
  dim('SI-13', 'dispatch-chain-completeness', 'self_integrity', 'SI', 'warning',
    'Dispatch chain completeness — dispatchers call all documented sub-hooks', 2, null),
  dim('SI-14', 'critical-marker-coverage', 'self_integrity', 'SI', 'warning',
    'CRITICAL marker coverage — known failure-prone steps have CRITICAL/STOP markers', 2, null),
  dim('SI-15', 'cross-platform-path-safety', 'self_integrity', 'SI', 'warning',
    'Cross-platform path safety — no hardcoded / or \\, use path.join', 2, null),

  // =========================================================================
  // IH — Infrastructure Health (Phase 3) — 10 dimensions
  // =========================================================================
  dim('IH-01', 'hook-server-health', 'infrastructure', 'IH', 'error',
    'Hook server health — running/crashed/process-fallback detection', 3, null),
  dim('IH-02', 'dashboard-health', 'infrastructure', 'IH', 'warning',
    'Dashboard health — running if auto_launch enabled', 3, null),
  dim('IH-03', 'hook-exec-performance', 'infrastructure', 'IH', 'warning',
    'Hook execution performance profiling — flag >500ms hooks', 3, 'hook_performance_ms'),
  dim('IH-04', 'stale-file-detection', 'infrastructure', 'IH', 'warning',
    'Stale file detection — .active-skill, .auto-next, .context-tracker from crashed sessions', 3, null),
  dim('IH-05', 'plugin-cache-freshness', 'infrastructure', 'IH', 'info',
    'Plugin cache freshness — cached version matches local/published version', 3, null),
  dim('IH-06', 'config-schema-validation', 'infrastructure', 'IH', 'error',
    'Config schema validation — config.json valid against schema, no unknown keys', 3, null),
  dim('IH-07', 'log-rotation-health', 'infrastructure', 'IH', 'info',
    'Log rotation health — cleanOldHookLogs working, old files removed after 30 days', 3, null),
  dim('IH-08', 'disk-usage-tracking', 'infrastructure', 'IH', 'info',
    'Disk usage tracking — .planning/ size, milestone archive growth', 3, null),
  dim('IH-09', 'dispatch-chain-coverage', 'infrastructure', 'IH', 'warning',
    'Dispatch chain coverage — all 13 sub-hooks actually executing', 3, null),
  dim('IH-10', 'log-source-separation', 'infrastructure', 'IH', 'info',
    'Log source separation quality — test vs session data in events-*.jsonl', 3, null),

  // =========================================================================
  // EF — Error & Failure Analysis (Phase 4) — 7 dimensions
  // =========================================================================
  dim('EF-01', 'tool-failure-rate', 'error_analysis', 'EF', 'error',
    'Tool failure rate analysis — PostToolUseFailure events by tool type', 4, null),
  dim('EF-02', 'agent-failure-timeout', 'error_analysis', 'EF', 'error',
    'Agent failure/timeout detection — missing completion markers, null durations', 4, null),
  dim('EF-03', 'hook-false-positive', 'error_analysis', 'EF', 'warning',
    'Hook false positive analysis — blocks on legitimate writes', 4, null),
  dim('EF-04', 'hook-false-negative', 'error_analysis', 'EF', 'warning',
    'Hook false negative detection — bad actions not blocked', 4, null),
  dim('EF-05', 'retry-repetition-pattern', 'error_analysis', 'EF', 'warning',
    'Retry/repetition pattern detection — same tool called 3+ times consecutively', 4, null),
  dim('EF-06', 'cross-session-interference', 'error_analysis', 'EF', 'error',
    'Cross-session interference detection — multiple sessions, .active-skill conflicts', 4, null),
  dim('EF-07', 'session-cleanup-verification', 'error_analysis', 'EF', 'warning',
    'Session cleanup verification — session-cleanup.js fires and cleans up properly', 4, null),

  // =========================================================================
  // WC — Workflow Compliance (Phase 5) — 12 dimensions
  // =========================================================================
  dim('WC-01', 'ci-verify-after-push', 'workflow_compliance', 'WC', 'warning',
    'CI verification after push — git push followed by gh run list check', 5, null),
  dim('WC-02', 'state-file-integrity', 'workflow_compliance', 'WC', 'error',
    'State file integrity — STATE.md matches disk, phase statuses accurate', 5, null),
  dim('WC-03', 'state-frontmatter-integrity', 'workflow_compliance', 'WC', 'error',
    'STATE.md frontmatter integrity — valid YAML, required fields present', 5, null),
  dim('WC-04', 'roadmap-sync-validation', 'workflow_compliance', 'WC', 'error',
    'ROADMAP sync validation — ROADMAP.md matches actual phase directories', 5, null),
  dim('WC-05', 'planning-artifact-completeness', 'workflow_compliance', 'WC', 'warning',
    'Planning artifact completeness — built phases have SUMMARY.md + VERIFICATION.md', 5, null),
  dim('WC-06', 'artifact-format-validation', 'workflow_compliance', 'WC', 'warning',
    'Artifact format validation — SUMMARY.md required fields, PLAN.md has task blocks', 5, null),
  dim('WC-07', 'compaction-quality', 'workflow_compliance', 'WC', 'info',
    'Compaction quality tracking — STATE.md preserved through compaction events', 5, null),
  dim('WC-08', 'naming-convention-compliance', 'workflow_compliance', 'WC', 'warning',
    'Naming convention compliance — PLAN-{NN}.md format, not random names', 5, null),
  dim('WC-09', 'commit-pattern-validation', 'workflow_compliance', 'WC', 'warning',
    'Commit command pattern validation — no heredoc, proper -m format', 5, null),
  dim('WC-10', 'model-selection-compliance', 'workflow_compliance', 'WC', 'info',
    'Model selection compliance — agents using configured models', 5, null),
  dim('WC-11', 'git-branching-compliance', 'workflow_compliance', 'WC', 'info',
    'Git branching compliance — phase branches created per git.branching setting', 5, null),
  dim('WC-12', 'test-health-baseline', 'workflow_compliance', 'WC', 'warning',
    'Test health baseline tracking — new failures vs known failures', 5, null),

  // =========================================================================
  // BC — Behavioral Compliance (Phase 6) — 15 dimensions
  // =========================================================================
  dim('BC-01', 'skill-sequence-compliance', 'behavioral_compliance', 'BC', 'error',
    'Skill sequence compliance — plan before build, build before verify', 6, null),
  dim('BC-02', 'state-machine-transitions', 'behavioral_compliance', 'BC', 'error',
    'State machine transition validation — planned>building>built>verified, no skips', 6, null),
  dim('BC-03', 'pre-condition-verification', 'behavioral_compliance', 'BC', 'error',
    'Pre-condition verification — PLAN.md exists before build, SUMMARY.md before verify', 6, null),
  dim('BC-04', 'post-condition-verification', 'behavioral_compliance', 'BC', 'warning',
    'Post-condition verification — SUMMARY.md after build, VERIFICATION.md after verify', 6, null),
  dim('BC-05', 'orchestrator-budget-discipline', 'behavioral_compliance', 'BC', 'warning',
    'Orchestrator budget discipline — stayed under budget, no executor file reads', 6, null),
  dim('BC-06', 'artifact-creation-order', 'behavioral_compliance', 'BC', 'warning',
    'Artifact creation order — PLAN>commits>SUMMARY>VERIFICATION in order', 6, null),
  dim('BC-07', 'critical-marker-compliance', 'behavioral_compliance', 'BC', 'warning',
    'CRITICAL marker compliance — skills followed their CRITICAL/STOP markers', 6, null),
  dim('BC-08', 'gate-compliance', 'behavioral_compliance', 'BC', 'warning',
    'Gate compliance — configured gates respected in autonomous mode', 6, null),
  dim('BC-09', 'enforce-workflow-advisory', 'behavioral_compliance', 'BC', 'info',
    'Enforce-PBR-workflow advisory tracking — enforcement hook flags and responses', 6, null),
  dim('BC-10', 'unmanaged-commit-detection', 'behavioral_compliance', 'BC', 'warning',
    'Unmanaged commit detection — commits made outside PBR skill context', 6, null),
  dim('BC-11', 'context-delegation-threshold', 'behavioral_compliance', 'BC', 'warning',
    'Context delegation threshold — subagents spawned when context exceeded cap', 6, null),
  dim('BC-12', 'skill-self-read-prevention', 'behavioral_compliance', 'BC', 'info',
    'Skill self-read prevention — no skill wasted tokens reading its own SKILL.md', 6, null),
  dim('BC-13', 'hook-output-effectiveness', 'behavioral_compliance', 'BC', 'info',
    'Hook output effectiveness — LLM actually followed hook advisories/warnings', 6, null),
  dim('BC-14', 'agent-scope-compliance', 'behavioral_compliance', 'BC', 'error',
    'Agent scope compliance — only modified files listed in plan files_modified', 6, null),
  dim('BC-15', 'agent-plan-adherence', 'behavioral_compliance', 'BC', 'warning',
    'Agent plan adherence — tasks_completed matches plan, executor self-check results', 6, null),

  // =========================================================================
  // SQ — Session Quality & UX (Phase 7) — 10 dimensions
  // =========================================================================
  dim('SQ-01', 'session-start-quality', 'session_quality', 'SQ', 'info',
    'Session start quality — progress-tracker briefing injected and useful', 7, null),
  dim('SQ-02', 'briefing-freshness', 'session_quality', 'SQ', 'info',
    'Briefing freshness/size — stale or bloated session start injection', 7, null),
  dim('SQ-03', 'session-duration-cost', 'session_quality', 'SQ', 'info',
    'Session duration/cost analysis — flag bloated sessions', 7, null),
  dim('SQ-04', 'skill-routing-accuracy', 'session_quality', 'SQ', 'warning',
    'Skill routing accuracy — /pbr:do routing to correct skill', 7, null),
  dim('SQ-05', 'memory-update-tracking', 'session_quality', 'SQ', 'info',
    'Memory update tracking — auto-memory saves when learning new info', 7, null),
  dim('SQ-06', 'convention-detection-monitoring', 'session_quality', 'SQ', 'info',
    'Convention detection monitoring — convention_memory capturing patterns', 7, null),
  dim('SQ-07', 'user-frustration-signals', 'session_quality', 'SQ', 'warning',
    'User frustration signals — repeated commands, corrections, negative language', 7, null),
  dim('SQ-08', 'satisfaction-signals', 'session_quality', 'SQ', 'info',
    'Satisfaction signals — positive vs negative language ratio', 7, null),
  dim('SQ-09', 'skill-escalation-patterns', 'session_quality', 'SQ', 'info',
    'Skill escalation patterns — quick>debug, quick>plan, task harder than expected', 7, null),
  dim('SQ-10', 'notification-quality', 'session_quality', 'SQ', 'info',
    'Notification quality — log-notification.js notifications useful or noise', 7, null),

  // =========================================================================
  // FV — Feature Verification (Phase 8) — 13 dimensions
  // =========================================================================
  dim('FV-01', 'architecture-guard-activity', 'feature_verification', 'FV', 'warning',
    'Architecture guard activity — dependency violation warnings generated', 8, null),
  dim('FV-02', 'dependency-break-detection', 'feature_verification', 'FV', 'warning',
    'Dependency break detection activity — stale plans flagged on upstream changes', 8, null),
  dim('FV-03', 'security-scanning-activity', 'feature_verification', 'FV', 'info',
    'Security scanning activity — OWASP scans run during builds', 8, null),
  dim('FV-04', 'trust-tracking-activity', 'feature_verification', 'FV', 'info',
    'Trust tracking activity — trust scores updated, influencing verification depth', 8, null),
  dim('FV-05', 'learnings-system-activity', 'feature_verification', 'FV', 'info',
    'Learnings system activity — LEARNINGS.md written and consumed by planners', 8, null),
  dim('FV-06', 'intel-system-activity', 'feature_verification', 'FV', 'info',
    'Intel system activity — arch.md updated, injected at session start', 8, null),
  dim('FV-07', 'auto-continue-chain', 'feature_verification', 'FV', 'warning',
    'Auto-continue chain verification — stop hook chaining correctly, no false triggers', 8, null),
  dim('FV-08', 'negative-knowledge-tracking', 'feature_verification', 'FV', 'info',
    'Negative knowledge tracking — failures recorded in .planning/negative-knowledge/', 8, null),
  dim('FV-09', 'decision-journal-tracking', 'feature_verification', 'FV', 'info',
    'Decision journal tracking — decisions journaled in .planning/decisions/', 8, null),
  dim('FV-10', 'phase-boundary-enforcement', 'feature_verification', 'FV', 'warning',
    'Phase boundary enforcement — cross-phase violations detected/missed', 8, null),
  dim('FV-11', 'destructive-op-confirmation', 'feature_verification', 'FV', 'error',
    'Destructive operation confirmation — destructive git ops confirmed per safety config', 8, null),
  dim('FV-12', 'context-budget-accuracy', 'feature_verification', 'FV', 'info',
    'Context-budget.json accuracy — bridged value matches reality', 8, null),
  dim('FV-13', 'config-feature-coverage', 'feature_verification', 'FV', 'warning',
    'Config feature coverage — % of enabled features with evidence of running', 8, null),

  // =========================================================================
  // QM — Quality Metrics & Trends (Phase 9) — 5 dimensions
  // =========================================================================
  dim('QM-01', 'session-degradation', 'quality_metrics', 'QM', 'warning',
    'Session degradation tracking — error rate first half vs second half', 9, null),
  dim('QM-02', 'throughput-metrics', 'quality_metrics', 'QM', 'info',
    'Throughput metrics — tool calls, commits, agents spawned per session', 9, null),
  dim('QM-03', 'baseline-comparison', 'quality_metrics', 'QM', 'warning',
    'Baseline comparison — current audit vs previous audits for regression detection', 9, null),
  dim('QM-04', 'error-correlation', 'quality_metrics', 'QM', 'info',
    'Error correlation analysis — errors in one dimension predict errors in another', 9, null),
  dim('QM-05', 'audit-self-validation', 'quality_metrics', 'QM', 'warning',
    'Audit self-validation — audit agent checked all enabled dimensions', 9, null),
];

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/**
 * Find a dimension by its full ID (e.g., "SI-01:skill-template-refs")
 * or by its short code (e.g., "SI-01").
 * @param {string} idOrCode
 * @returns {object|undefined}
 */
function getDimensionById(idOrCode) {
  return DIMENSIONS.find(
    (d) => d.id === idOrCode || d.code === idOrCode
  );
}

/**
 * Find a dimension by its slug (e.g., "skill-template-refs").
 * @param {string} slug
 * @returns {object|undefined}
 */
function getDimensionBySlug(slug) {
  return DIMENSIONS.find((d) => d.slug === slug);
}

/**
 * Get all dimensions in a given category.
 * @param {string} category - Config category key (e.g., "self_integrity")
 * @returns {object[]}
 */
function getDimensionsByCategory(category) {
  return DIMENSIONS.filter((d) => d.category === category);
}

/**
 * Get the list of category keys for a given preset name.
 * @param {string} presetName - "minimal" | "standard" | "comprehensive" | "custom"
 * @returns {string[]}
 */
function getActivePresetCategories(presetName) {
  return PRESETS[presetName] || [];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  DIMENSIONS,
  CATEGORIES,
  PRESETS,
  getDimensionById,
  getDimensionBySlug,
  getDimensionsByCategory,
  getActivePresetCategories,
};
