// lib/constants.js — Shared constants for Plan-Build-Run tools.

/**
 * Canonical list of known PBR agent types.
 * Used by validate-task and check-subagent-output to avoid drift.
 */
const KNOWN_AGENTS = [
  'executor',
  'planner',
  'verifier',
  'researcher',
  'synthesizer',
  'plan-checker',
  'integration-checker',
  'debugger',
  'codebase-mapper',
  'audit',
  'general',
  'dev-sync',
  'roadmapper',
  'nyquist-auditor',
  'intel-updater',
  'ui-checker',
  'ui-researcher'
];

/**
 * Valid phase status transitions. Each key is a current status, and its value
 * is an array of statuses that are legal to transition to. This is advisory —
 * invalid transitions produce a stderr warning but are not blocked.
 *
 * State machine:
 *   pending -> planned, skipped
 *   planned -> building
 *   building -> built, partial, needs_fixes
 *   built -> verified, needs_fixes
 *   partial -> building, needs_fixes
 *   verified -> building (re-execution)
 *   needs_fixes -> planned, building
 *   skipped -> pending (unskip)
 */
const VALID_STATUS_TRANSITIONS = {
  not_started:       ['discussed', 'ready_to_plan', 'planned', 'skipped'],
  discussed:         ['ready_to_plan', 'planning'],
  ready_to_plan:     ['planning', 'planned'],
  planning:          ['planned'],
  planned:           ['ready_to_execute', 'building'],
  ready_to_execute:  ['building'],
  building:          ['built', 'partial', 'needs_fixes'],
  built:             ['verified', 'needs_fixes'],
  partial:           ['building', 'needs_fixes'],
  verified:          ['complete', 'building'],
  needs_fixes:       ['planned', 'building', 'ready_to_plan'],
  complete:          [],
  skipped:           ['not_started', 'pending'],
  // Legacy aliases (backward compat)
  pending:           ['planned', 'discussed', 'skipped', 'not_started']
};

/**
 * Human-readable labels for plan/phase statuses.
 */
const STATUS_LABELS = {
  not_started:      'Not Started',
  discussed:        'Discussed',
  ready_to_plan:    'Ready to Plan',
  planning:         'Planning',
  planned:          'Planned',
  ready_to_execute: 'Ready to Execute',
  building:         'Building',
  built:            'Built',
  partial:          'Partial',
  verified:         'Verified',
  needs_fixes:      'Needs Fixes',
  complete:         'Complete',
  skipped:          'Skipped',
  // Legacy aliases
  pending:          'Not Started',
  reviewed:         'Verified'
};

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES = {
  'pbr-planner':              { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'pbr-roadmapper':           { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'pbr-executor':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'pbr-researcher':            { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'pbr-synthesizer':           { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-debugger':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'pbr-codebase-mapper':      { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'pbr-verifier':             { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-plan-checker':         { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-integration-checker':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'pbr-nyquist-auditor':      { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};

// ─── Session constants ────────────────────────────────────────────────────────

const SESSION_ALLOWED_KEYS = ['activeSkill', 'compactCounter', 'sessionStart', 'activeOperation', 'activePlan'];

const STALE_SESSION_MS = 4 * 60 * 60 * 1000; // 4 hours

module.exports = {
  KNOWN_AGENTS,
  VALID_STATUS_TRANSITIONS,
  STATUS_LABELS,
  MODEL_PROFILES,
  SESSION_ALLOWED_KEYS,
  STALE_SESSION_MS,
};
