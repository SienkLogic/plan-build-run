'use strict';

/**
 * Feature Verification Check Module
 *
 * Implements FV-01 through FV-07 feature verification dimensions for the PBR
 * audit system. Each check verifies that an enabled config feature is actually
 * running and producing results.
 *
 * Checks:
 *   FV-01: Architecture guard activity (hook logs)
 *   FV-02: Dependency break detection activity (hook logs)
 *   FV-03: Security scanning activity (hook logs + phase builds)
 *   FV-04: Trust tracking activity (hook logs + trust-scores.json)
 *   FV-05: Learnings system activity (LEARNINGS.md in phases)
 *   FV-06: Intel system activity (arch.md, progress-tracker, intel hooks)
 *   FV-07: Auto-continue chain correctness (stop hook, .auto-next signal)
 *
 * Config dependencies:
 *   - config.features.architecture_guard (FV-01)
 *   - config.features.dependency_break_detection (FV-02)
 *   - config.features.security_scanning (FV-03)
 *   - config.features.trust_tracking (FV-04)
 *   - config.learnings.enabled (FV-05)
 *   - config.intel.enabled (FV-06)
 *   - config.features.auto_continue (FV-07)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "FV-01")
 * @param {'pass'|'warn'|'fail'} status
 * @param {string} message
 * @param {string[]} [evidence]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function result(dimCode, status, message, evidence) {
  return {
    dimension: dimCode,
    status,
    message,
    evidence: evidence || [],
  };
}

// ---------------------------------------------------------------------------
// Hook log scanner utility
// ---------------------------------------------------------------------------

/**
 * Scan hook log files for entries matching a filter function.
 * Looks at `.planning/logs/hooks-YYYY-MM-DD.jsonl` for the last maxDays days.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {function} filterFn - Predicate: (entry) => boolean
 * @param {number} [maxDays=7] - Number of days to look back
 * @returns {object[]} Array of matching log entries
 */
function scanHookLogs(planningDir, filterFn, maxDays) {
  maxDays = maxDays || 7;
  const logsDir = path.join(planningDir, 'logs');
  const matches = [];

  // Build date strings for the last maxDays days
  const now = new Date();
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `hooks-${yyyy}-${mm}-${dd}.jsonl`;
    const filePath = path.join(logsDir, filename);

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_e) {
      // File does not exist for this date — skip
      continue;
    }

    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (_e) {
        continue;
      }
      if (filterFn(entry)) {
        matches.push(entry);
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// FV-01: Architecture Guard Activity
// ---------------------------------------------------------------------------

/**
 * Check whether architecture guard is enabled and producing hook log entries.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkArchitectureGuardActivity(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.architecture_guard !== true) {
    return result('FV-01', 'pass', 'Feature disabled by config');
  }

  const entries = scanHookLogs(planningDir, function (entry) {
    return entry.script && String(entry.script).includes('architecture-guard');
  });

  if (entries.length > 0) {
    return result('FV-01', 'pass', `Architecture guard active (${entries.length} log entries)`, [
      `Found ${entries.length} architecture-guard entries in recent hook logs`,
    ]);
  }

  return result('FV-01', 'warn', 'Enabled but no activity in recent hook logs');
}

// ---------------------------------------------------------------------------
// FV-02: Dependency Break Detection
// ---------------------------------------------------------------------------

/**
 * Check whether dependency break detection is enabled and producing log entries.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkDependencyBreakDetection(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.dependency_break_detection !== true) {
    return result('FV-02', 'pass', 'Feature disabled by config');
  }

  const entries = scanHookLogs(planningDir, function (entry) {
    return entry.script && String(entry.script).includes('dependency-break');
  });

  if (entries.length > 0) {
    return result('FV-02', 'pass', `Dependency break detection active (${entries.length} log entries)`, [
      `Found ${entries.length} dependency-break entries in recent hook logs`,
    ]);
  }

  return result('FV-02', 'warn', 'Enabled but no activity in recent hook logs');
}

// ---------------------------------------------------------------------------
// FV-03: Security Scanning Activity
// ---------------------------------------------------------------------------

/**
 * Check whether security scanning is enabled and producing evidence.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSecurityScanningActivity(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.security_scanning !== true) {
    return result('FV-03', 'pass', 'Feature disabled by config');
  }

  // Check hook logs for security-related entries
  const entries = scanHookLogs(planningDir, function (entry) {
    const script = entry.script ? String(entry.script).toLowerCase() : '';
    const data = entry.data ? JSON.stringify(entry.data).toLowerCase() : '';
    return script.includes('security') || script.includes('owasp') ||
           data.includes('security') || data.includes('owasp');
  });

  // Check if any phases have status 'built' or 'verified' by scanning for SUMMARY.md
  const phasesDir = path.join(planningDir, 'phases');
  let hasBuilds = false;
  try {
    const phaseDirs = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const dir of phaseDirs) {
      if (!dir.isDirectory()) continue;
      const summaryPath = path.join(phasesDir, dir.name, 'SUMMARY.md');
      try {
        fs.accessSync(summaryPath);
        hasBuilds = true;
        break;
      } catch (_e) {
        // No SUMMARY.md in this phase
      }
    }
  } catch (_e) {
    // No phases dir
  }

  if (!hasBuilds) {
    return result('FV-03', 'pass', 'No builds occurred — security scanning has no trigger');
  }

  if (entries.length > 0) {
    return result('FV-03', 'pass', `Security scanning active (${entries.length} log entries)`, [
      `Found ${entries.length} security-related entries in recent hook logs`,
    ]);
  }

  return result('FV-03', 'warn', 'Enabled and builds occurred, but no security scan evidence in logs');
}

// ---------------------------------------------------------------------------
// FV-04: Trust Tracking Activity
// ---------------------------------------------------------------------------

/**
 * Check whether trust tracking is enabled and producing evidence.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkTrustTrackingActivity(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.trust_tracking !== true) {
    return result('FV-04', 'pass', 'Feature disabled by config');
  }

  const entries = scanHookLogs(planningDir, function (entry) {
    return entry.script && String(entry.script).includes('trust-tracker');
  });

  // Also check for trust-scores.json existence
  const trustScoresPath = path.join(planningDir, 'trust-scores.json');
  let hasTrustScores = false;
  try {
    fs.accessSync(trustScoresPath);
    hasTrustScores = true;
  } catch (_e) {
    // File does not exist
  }

  const evidence = [];
  if (entries.length > 0) {
    evidence.push(`Found ${entries.length} trust-tracker entries in recent hook logs`);
  }
  if (hasTrustScores) {
    evidence.push('trust-scores.json exists');
  }

  if (evidence.length > 0) {
    return result('FV-04', 'pass', 'Trust tracking active', evidence);
  }

  return result('FV-04', 'warn', 'Enabled but no trust tracking evidence found');
}

// ---------------------------------------------------------------------------
// FV-05: Learnings System Activity
// ---------------------------------------------------------------------------

/**
 * Check whether learnings system is enabled and producing LEARNINGS.md files.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkLearningsSystemActivity(planningDir, config) {
  if (!config.learnings || config.learnings.enabled !== true) {
    return result('FV-05', 'pass', 'Feature disabled by config');
  }

  const phasesDir = path.join(planningDir, 'phases');
  let phaseDirs;
  try {
    phaseDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
  } catch (_e) {
    return result('FV-05', 'pass', 'No phases directory — no trigger');
  }

  if (phaseDirs.length === 0) {
    return result('FV-05', 'pass', 'No phases — no trigger');
  }

  const learningsFiles = [];
  for (const dir of phaseDirs) {
    const learningsPath = path.join(phasesDir, dir.name, 'LEARNINGS.md');
    try {
      fs.accessSync(learningsPath);
      learningsFiles.push(path.join(dir.name, 'LEARNINGS.md'));
    } catch (_e) {
      // No LEARNINGS.md in this phase
    }
  }

  if (learningsFiles.length > 0) {
    return result('FV-05', 'pass', `Learnings system active (${learningsFiles.length} file(s))`, learningsFiles);
  }

  return result('FV-05', 'warn', 'Enabled with completed phases, but no LEARNINGS.md files found');
}

// ---------------------------------------------------------------------------
// FV-06: Intel System Activity
// ---------------------------------------------------------------------------

/**
 * Check whether intel system is enabled and producing evidence.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkIntelSystemActivity(planningDir, config) {
  if (!config.intel || config.intel.enabled !== true) {
    return result('FV-06', 'pass', 'Feature disabled by config');
  }

  const evidence = [];

  // Check for arch.md existence
  const archPath = path.join(planningDir, 'intel', 'arch.md');
  try {
    fs.accessSync(archPath);
    evidence.push('intel/arch.md exists');
  } catch (_e) {
    // Not found
  }

  // If inject_on_start, check for progress-tracker log entries
  if (config.intel.inject_on_start) {
    const ptEntries = scanHookLogs(planningDir, function (entry) {
      return entry.script && String(entry.script).includes('progress-tracker');
    });
    if (ptEntries.length > 0) {
      evidence.push(`Found ${ptEntries.length} progress-tracker entries in hook logs`);
    }
  }

  // If auto_update, check for intel-related log entries
  if (config.intel.auto_update) {
    const intelEntries = scanHookLogs(planningDir, function (entry) {
      const script = entry.script ? String(entry.script).toLowerCase() : '';
      return script.includes('intel');
    });
    if (intelEntries.length > 0) {
      evidence.push(`Found ${intelEntries.length} intel-related entries in hook logs`);
    }
  }

  if (evidence.length > 0) {
    return result('FV-06', 'pass', 'Intel system active', evidence);
  }

  return result('FV-06', 'warn', 'Enabled but no intel system evidence found');
}

// ---------------------------------------------------------------------------
// FV-07: Auto-Continue Chain Correctness
// ---------------------------------------------------------------------------

/**
 * Check whether auto-continue is enabled and chain is healthy.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkAutoContinueChain(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.auto_continue !== true) {
    return result('FV-07', 'pass', 'Feature disabled by config');
  }

  const entries = scanHookLogs(planningDir, function (entry) {
    return entry.script && String(entry.script).includes('auto-continue');
  });

  // Check for stale .auto-next signal file
  const autoNextPath = path.join(planningDir, '.auto-next');
  let hasStaleSignal = false;
  try {
    fs.accessSync(autoNextPath);
    hasStaleSignal = true;
  } catch (_e) {
    // File does not exist — good
  }

  if (hasStaleSignal) {
    const evidence = ['Stale .auto-next signal file exists'];
    if (entries.length > 0) {
      evidence.push(`Found ${entries.length} auto-continue entries in hook logs`);
    }
    return result('FV-07', 'warn', 'Stale .auto-next signal file', evidence);
  }

  if (entries.length > 0) {
    return result('FV-07', 'pass', `Auto-continue chain healthy (${entries.length} log entries)`, [
      `Found ${entries.length} auto-continue entries in recent hook logs`,
    ]);
  }

  return result('FV-07', 'warn', 'Enabled but no auto-continue activity in recent hook logs');
}

// ---------------------------------------------------------------------------
// FV-08: Negative Knowledge Tracking
// ---------------------------------------------------------------------------

/**
 * Check whether negative knowledge tracking is enabled and producing records.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkNegativeKnowledgeTracking(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.negative_knowledge !== true) {
    return result('FV-08', 'pass', 'Feature disabled by config');
  }

  const nkDir = path.join(planningDir, 'negative-knowledge');
  let files;
  try {
    files = fs.readdirSync(nkDir).filter(function (f) {
      return f.endsWith('.md') || f.endsWith('.json');
    });
  } catch (_e) {
    return result('FV-08', 'warn', 'Enabled but no negative-knowledge/ directory — acceptable early in project');
  }

  if (files.length === 0) {
    return result('FV-08', 'warn', 'Enabled but no negative knowledge recorded — acceptable early in project');
  }

  return result('FV-08', 'pass', `Negative knowledge active (${files.length} file(s))`, files);
}

// ---------------------------------------------------------------------------
// FV-09: Decision Journal Tracking
// ---------------------------------------------------------------------------

/**
 * Check whether decision journal tracking is enabled and producing records.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkDecisionJournalTracking(planningDir, config) {
  const features = (config && config.features) || {};
  if (features.decision_journal !== true) {
    return result('FV-09', 'pass', 'Feature disabled by config');
  }

  const decisionsDir = path.join(planningDir, 'decisions');
  let files;
  try {
    files = fs.readdirSync(decisionsDir).filter(function (f) {
      return f.endsWith('.md') || f.endsWith('.json');
    });
  } catch (_e) {
    return result('FV-09', 'warn', 'Enabled but no decisions/ directory found');
  }

  if (files.length === 0) {
    return result('FV-09', 'warn', 'Enabled but no decisions recorded');
  }

  return result('FV-09', 'pass', `Decision journal active (${files.length} file(s))`, files);
}

// ---------------------------------------------------------------------------
// FV-10: Phase Boundary Enforcement
// ---------------------------------------------------------------------------

/**
 * Check whether phase boundary enforcement is enabled and producing log entries.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkPhaseBoundaryEnforcement(planningDir, config) {
  const safety = (config && config.safety) || {};
  if (safety.enforce_phase_boundaries !== true) {
    return result('FV-10', 'pass', 'Feature disabled by config');
  }

  const entries = scanHookLogs(planningDir, function (entry) {
    return entry.script && String(entry.script).includes('check-phase-boundary');
  });

  if (entries.length === 0) {
    return result('FV-10', 'warn', 'Enabled but no phase boundary enforcement entries in recent hook logs');
  }

  let blockCount = 0;
  let allowCount = 0;
  for (const entry of entries) {
    const decision = (entry.decision || entry.action || '').toLowerCase();
    if (decision === 'block') {
      blockCount++;
    } else {
      allowCount++;
    }
  }

  return result('FV-10', 'pass', `Phase boundary enforcement active (${entries.length} entries: ${blockCount} block, ${allowCount} allow)`, [
    `Found ${entries.length} check-phase-boundary entries in recent hook logs`,
  ]);
}

// ---------------------------------------------------------------------------
// FV-11: Destructive Op Confirmation
// ---------------------------------------------------------------------------

/**
 * Check whether destructive op confirmation is enabled and producing log entries.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkDestructiveOpConfirmation(planningDir, config) {
  const safety = (config && config.safety) || {};
  if (safety.always_confirm_destructive !== true) {
    return result('FV-11', 'pass', 'Feature disabled by config');
  }

  const entries = scanHookLogs(planningDir, function (entry) {
    return entry.script && String(entry.script).includes('check-dangerous-commands');
  });

  if (entries.length === 0) {
    return result('FV-11', 'warn', 'No destructive ops attempted — no trigger');
  }

  let blockCount = 0;
  let allowCount = 0;
  for (const entry of entries) {
    const decision = (entry.decision || entry.action || '').toLowerCase();
    if (decision === 'block') {
      blockCount++;
    } else {
      allowCount++;
    }
  }

  return result('FV-11', 'pass', `Destructive op confirmation active (${entries.length} entries: ${blockCount} block, ${allowCount} allow)`, [
    `Found ${entries.length} check-dangerous-commands entries in recent hook logs`,
  ]);
}

// ---------------------------------------------------------------------------
// FV-12: Context Budget Accuracy
// ---------------------------------------------------------------------------

/**
 * Check whether context budget tracking is accurate and functioning.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} _config - Parsed config.json (unused)
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkContextBudgetAccuracy(planningDir, _config) {
  const budgetPath = path.join(planningDir, '.context-budget.json');
  let content;
  try {
    content = fs.readFileSync(budgetPath, 'utf8');
  } catch (_e) {
    return result('FV-12', 'warn', 'No .context-budget.json file found');
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (_e) {
    return result('FV-12', 'warn', 'context-budget.json exists but is not valid JSON');
  }

  const evidence = [];

  if (typeof data.chars_read !== 'number') {
    evidence.push('chars_read is missing or not a number');
  }

  if (!data.source) {
    evidence.push('source field is missing');
  } else {
    evidence.push(`source: ${data.source}`);
  }

  if (data.estimated_percent != null) {
    evidence.push(`estimated_percent: ${data.estimated_percent}`);
  }

  // Valid data with real source
  if (data.source === 'claude-code') {
    return result('FV-12', 'pass', 'Context budget tracked with real Claude Code data', evidence);
  }

  // Valid data with heuristic source
  if (data.source === 'bridge' || data.source === 'heuristic') {
    if (typeof data.chars_read === 'number') {
      return result('FV-12', 'pass', `Context budget tracked (source: ${data.source})`, evidence);
    }
  }

  // Data exists but has issues
  if (evidence.some(function (e) { return e.includes('missing'); })) {
    return result('FV-12', 'warn', 'context-budget.json has incomplete data', evidence);
  }

  return result('FV-12', 'pass', 'Context budget data present', evidence);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  result,
  scanHookLogs,
  checkArchitectureGuardActivity,
  checkDependencyBreakDetection,
  checkSecurityScanningActivity,
  checkTrustTrackingActivity,
  checkLearningsSystemActivity,
  checkIntelSystemActivity,
  checkAutoContinueChain,
  checkNegativeKnowledgeTracking,
  checkDecisionJournalTracking,
  checkPhaseBoundaryEnforcement,
  checkDestructiveOpConfirmation,
  checkContextBudgetAccuracy,
};
