'use strict';

/**
 * Quality Metrics Check Module
 *
 * Implements QM-01, QM-02, and QM-04 quality metric dimensions for the
 * PBR audit system. Each check returns a structured result:
 * { dimension, status, message, evidence }.
 *
 * Checks:
 *   QM-01: Session degradation detection (error rate first half vs second half)
 *   QM-02: Throughput metrics (tool calls, commits, agents spawned)
 *   QM-04: Error correlation across audit dimensions
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

module.exports = { checkSessionDegradation, checkThroughputMetrics, checkErrorCorrelation };
