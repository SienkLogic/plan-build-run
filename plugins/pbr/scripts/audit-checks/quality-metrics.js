'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Quality Metrics Check Module
 *
 * Implements QM-01 through QM-05 quality metric dimensions for the
 * PBR audit system. Each check returns a structured result:
 * { dimension, status, message, evidence }.
 *
 * Checks:
 *   QM-01: Session degradation detection (error rate first half vs second half)
 *   QM-02: Throughput metrics (tool calls, commits, agents spawned)
 *   QM-03: Baseline comparison against previous audit reports
 *   QM-04: Error correlation across audit dimensions
 *   QM-05: Audit self-validation (all enabled dimensions checked)
 */

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "QM-01")
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
// QM-01: Session Degradation Detection
// ---------------------------------------------------------------------------

/**
 * Detect session quality degradation by comparing error rates between
 * the first and second halves of a session.
 *
 * @param {Array<object>} sessionData - Parsed JSONL entries with { timestamp, type, ... }
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkSessionDegradation(sessionData) {
  if (!sessionData || sessionData.length < 10) {
    return result('QM-01', 'pass', 'Insufficient data for degradation analysis');
  }

  const midpoint = Math.floor(sessionData.length / 2);
  const firstHalf = sessionData.slice(0, midpoint);
  const secondHalf = sessionData.slice(midpoint);

  /**
   * Count error indicators in a set of entries.
   * @param {Array<object>} entries
   * @returns {number}
   */
  function countErrors(entries) {
    let errors = 0;
    for (const entry of entries) {
      if (entry.type === 'tool_result') {
        // Check for is_error flag
        if (entry.data && entry.data.is_error === true) {
          errors++;
          continue;
        }
        // Check for PostToolUseFailure hook event
        if (entry.data && entry.data.hookEvent === 'PostToolUseFailure') {
          errors++;
          continue;
        }
        // Check for "error" in message content (case-insensitive)
        if (entry.message && entry.message.content &&
            typeof entry.message.content === 'string' &&
            /error/i.test(entry.message.content)) {
          errors++;
          continue;
        }
      }
    }
    return errors;
  }

  const firstErrors = countErrors(firstHalf);
  const secondErrors = countErrors(secondHalf);

  const firstRate = firstHalf.length > 0 ? firstErrors / firstHalf.length : 0;
  const secondRate = secondHalf.length > 0 ? secondErrors / secondHalf.length : 0;

  const evidence = [
    `First half: ${firstErrors}/${firstHalf.length} errors (rate: ${(firstRate * 100).toFixed(1)}%)`,
    `Second half: ${secondErrors}/${secondHalf.length} errors (rate: ${(secondRate * 100).toFixed(1)}%)`,
  ];

  // Degradation: second half rate > first half rate * 1.5 AND second half rate > 5%
  if (secondRate > firstRate * 1.5 && secondRate > 0.05) {
    return result('QM-01', 'warn', 'Session degradation detected', evidence);
  }

  return result('QM-01', 'pass', 'No significant session degradation', evidence);
}

// ---------------------------------------------------------------------------
// QM-02: Throughput Metrics
// ---------------------------------------------------------------------------

/**
 * Extract throughput metrics from session data. This is informational —
 * always returns pass with evidence data for trend analysis.
 *
 * @param {Array<object>} sessionData - Parsed JSONL entries with { timestamp, type, ... }
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkThroughputMetrics(sessionData) {
  if (!sessionData || sessionData.length === 0) {
    return result('QM-02', 'pass', 'No session data for throughput analysis', [
      'Total entries: 0',
      'Tool calls: 0',
      'Unique tools: none',
      'Agents spawned: 0',
      'Git commits: 0',
    ]);
  }

  let toolCalls = 0;
  const toolNames = new Set();
  let agentSpawns = 0;
  let gitCommits = 0;

  for (const entry of sessionData) {
    const entryType = entry.type || '';

    // Count tool calls
    if (entryType.includes('tool_use') || entryType.includes('tool_result')) {
      toolCalls++;
      // Extract tool name if available
      if (entry.tool_name) {
        toolNames.add(entry.tool_name);
      } else if (entry.data && entry.data.tool_name) {
        toolNames.add(entry.data.tool_name);
      }
    }

    // Count agent spawns (SubagentStop events)
    if (entry.data && entry.data.hookEvent === 'SubagentStop') {
      agentSpawns++;
    }

    // Count git commits (Bash tool with git commit)
    if (entry.data && entry.data.tool_input &&
        typeof entry.data.tool_input === 'string' &&
        entry.data.tool_input.includes('git commit')) {
      gitCommits++;
    }
  }

  const uniqueToolList = toolNames.size > 0
    ? Array.from(toolNames).sort().join(', ')
    : 'none';

  return result('QM-02', 'pass', 'Throughput metrics collected', [
    `Total entries: ${sessionData.length}`,
    `Tool calls: ${toolCalls}`,
    `Unique tools: ${uniqueToolList}`,
    `Agents spawned: ${agentSpawns}`,
    `Git commits: ${gitCommits}`,
  ]);
}

// ---------------------------------------------------------------------------
// QM-03: Baseline Comparison Against Previous Audits
// ---------------------------------------------------------------------------

/**
 * Compare current audit results against the most recent previous audit report
 * and flag any dimension regressions.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {Array<object>} auditResults - Current audit dimension results
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkBaselineComparison(planningDir, auditResults) {
  if (!auditResults || auditResults.length === 0) {
    return result('QM-03', 'pass', 'No current audit results for baseline comparison');
  }

  const auditsDir = path.join(planningDir, 'audits');

  let auditFiles;
  try {
    if (!fs.existsSync(auditsDir)) {
      return result('QM-03', 'pass', 'No previous audits for baseline comparison (first audit)');
    }
    auditFiles = fs.readdirSync(auditsDir)
      .filter(function (f) { return f.endsWith('-session-audit.md'); })
      .sort();
  } catch (_err) {
    return result('QM-03', 'pass', 'Previous audit unreadable, skipping baseline comparison');
  }

  if (auditFiles.length === 0) {
    return result('QM-03', 'pass', 'No previous audits for baseline comparison (first audit)');
  }

  // Read the most recent previous audit
  const latestFile = auditFiles[auditFiles.length - 1];
  let content;
  try {
    content = fs.readFileSync(path.join(auditsDir, latestFile), 'utf8');
  } catch (_err) {
    return result('QM-03', 'pass', 'Previous audit unreadable, skipping baseline comparison');
  }

  // Parse dimension results from table rows: | CODE | status |
  const previousStatuses = {};
  const tablePattern = /\|\s*([A-Z]{2}-\d{2})\s*\|\s*(pass|warn|fail)\s*\|/gi;
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    previousStatuses[match[1].toUpperCase()] = match[2].toLowerCase();
  }

  if (Object.keys(previousStatuses).length === 0) {
    return result('QM-03', 'pass', 'No parseable dimension results in previous audit');
  }

  // Compare current vs previous
  const statusRank = { pass: 0, warn: 1, fail: 2 };
  const regressions = [];
  const improvements = [];

  for (const r of auditResults) {
    if (!r.dimension) continue;
    const code = r.dimension.toUpperCase();
    const prevStatus = previousStatuses[code];
    if (!prevStatus) continue;

    const curStatus = (r.status || '').toLowerCase();
    const prevRank = statusRank[prevStatus];
    const curRank = statusRank[curStatus];

    if (prevRank !== undefined && curRank !== undefined) {
      if (curRank > prevRank) {
        regressions.push(code + ': ' + prevStatus + ' -> ' + curStatus);
      } else if (curRank < prevRank) {
        improvements.push(code + ': ' + prevStatus + ' -> ' + curStatus);
      }
    }
  }

  if (regressions.length > 0) {
    return result('QM-03', 'warn',
      regressions.length + ' dimension regression(s) vs previous audit',
      regressions
    );
  }

  return result('QM-03', 'pass', 'No regressions vs previous audit', [
    'Improvements: ' + (improvements.length > 0 ? improvements.join(', ') : 'none'),
    'Baseline file: ' + latestFile,
  ]);
}

// ---------------------------------------------------------------------------
// QM-04: Error Correlation Across Dimensions
// ---------------------------------------------------------------------------

/**
 * Detect correlated failures across audit dimension results.
 * Groups failing/warning dimensions by category prefix and checks
 * known correlation pairs.
 *
 * @param {Array<object>} auditResults - Array of dimension check results:
 *   [{ dimension: "SI-01", status: "pass"|"warn"|"fail", message, evidence }]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkErrorCorrelation(auditResults) {
  if (!auditResults || auditResults.length === 0) {
    return result('QM-04', 'pass', 'No audit results provided for correlation analysis');
  }

  // Group failing/warning dimensions by category prefix
  const categoryFailures = {};
  for (const r of auditResults) {
    if (!r.dimension || (r.status !== 'warn' && r.status !== 'fail')) {
      continue;
    }
    const prefix = r.dimension.split('-')[0];
    if (!categoryFailures[prefix]) {
      categoryFailures[prefix] = [];
    }
    categoryFailures[prefix].push(r.dimension);
  }

  const correlations = [];

  // Check for categories with 2+ failures (cluster)
  for (const [prefix, dims] of Object.entries(categoryFailures)) {
    if (dims.length >= 2) {
      correlations.push(`Cluster in ${prefix}: ${dims.join(', ')} (${dims.length} issues)`);
    }
  }

  // Known correlation pairs
  if (categoryFailures.EF && categoryFailures.BC) {
    correlations.push(
      `EF+BC correlation: errors causing behavioral drift (EF: ${categoryFailures.EF.join(', ')}, BC: ${categoryFailures.BC.join(', ')})`
    );
  }
  if (categoryFailures.IH && categoryFailures.WC) {
    correlations.push(
      `IH+WC correlation: infrastructure issues impacting workflow (IH: ${categoryFailures.IH.join(', ')}, WC: ${categoryFailures.WC.join(', ')})`
    );
  }
  if (categoryFailures.SQ && categoryFailures.EF) {
    correlations.push(
      `SQ+EF correlation: errors degrading session quality (SQ: ${categoryFailures.SQ.join(', ')}, EF: ${categoryFailures.EF.join(', ')})`
    );
  }

  if (correlations.length > 0) {
    return result('QM-04', 'warn',
      `${correlations.length} cross-dimension error correlation(s) detected`,
      correlations
    );
  }

  return result('QM-04', 'pass', 'No cross-dimension error correlations detected');
}

// ---------------------------------------------------------------------------
// QM-05: Audit Self-Validation
// ---------------------------------------------------------------------------

/**
 * Validate that the audit agent checked all enabled dimensions.
 *
 * @param {Array<object>} activeDimensions - Array of dimension objects from resolveDimensions(), each has `.code`
 * @param {Array<object>} auditResults - Array of check results, each has `.dimension`
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkAuditSelfValidation(activeDimensions, auditResults) {
  if (!auditResults || auditResults.length === 0) {
    return result('QM-05', 'fail', 'No audit results — audit agent produced no dimension checks');
  }

  if (!activeDimensions || activeDimensions.length === 0) {
    return result('QM-05', 'pass', 'No active dimensions configured — nothing to validate');
  }

  // Build set of codes from auditResults
  const checkedCodes = new Set();
  for (const r of auditResults) {
    if (r.dimension) {
      checkedCodes.add(r.dimension.toUpperCase());
    }
    // Also check .code field (SI checks use code instead of dimension)
    if (r.code) {
      checkedCodes.add(r.code.toUpperCase());
    }
  }

  const missing = [];
  for (const dim of activeDimensions) {
    const code = (dim.code || '').toUpperCase();
    if (code && !checkedCodes.has(code)) {
      missing.push(code);
    }
  }

  const total = activeDimensions.length;
  const checked = total - missing.length;

  if (missing.length === 0) {
    return result('QM-05', 'pass',
      'All ' + total + '/' + total + ' enabled dimensions checked',
      ['All ' + total + '/' + total + ' enabled dimensions checked']
    );
  }

  return result('QM-05', 'warn',
    checked + '/' + total + ' enabled dimensions checked (' + missing.length + ' missing)',
    ['Missing dimensions: ' + missing.join(', ')]
  );
}

// ---------------------------------------------------------------------------
// Aggregator: Run All Quality Metric Checks
// ---------------------------------------------------------------------------

/**
 * Run all 5 QM checks and return aggregated results.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {Array<object>} sessionData - Parsed JSONL entries
 * @param {Array<object>} auditResults - Dimension check results from other categories
 * @param {Array<object>} activeDimensions - Active dimension objects from resolveDimensions()
 * @returns {Array<{ dimension: string, status: string, message: string, evidence: string[] }>}
 */
function runAllQualityMetricChecks(planningDir, sessionData, auditResults, activeDimensions) {
  const checks = [
    { code: 'QM-01', fn: function () { return checkSessionDegradation(sessionData); } },
    { code: 'QM-02', fn: function () { return checkThroughputMetrics(sessionData); } },
    { code: 'QM-03', fn: function () { return checkBaselineComparison(planningDir, auditResults); } },
    { code: 'QM-04', fn: function () { return checkErrorCorrelation(auditResults); } },
    { code: 'QM-05', fn: function () { return checkAuditSelfValidation(activeDimensions, auditResults); } },
  ];

  const results = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const check of checks) {
    try {
      const r = check.fn();
      results.push(r);
      if (r.status === 'pass') passCount++;
      else if (r.status === 'warn') warnCount++;
      else failCount++;
    } catch (err) {
      results.push({
        dimension: check.code,
        status: 'fail',
        message: err.message,
        evidence: [],
      });
      failCount++;
    }
  }

  console.log('QM checks: ' + passCount + ' pass, ' + warnCount + ' warn, ' + failCount + ' fail');

  return results;
}

module.exports = {
  checkSessionDegradation,
  checkThroughputMetrics,
  checkBaselineComparison,
  checkErrorCorrelation,
  checkAuditSelfValidation,
  runAllQualityMetricChecks,
};
