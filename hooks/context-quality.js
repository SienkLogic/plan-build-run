#!/usr/bin/env node

/**
 * Context Quality Scoring — Measures signal-to-noise ratio of context reads.
 *
 * Produces a 0-100 score based on three dimensions:
 *   - Freshness (40%): % of entries less than stale_after_minutes old
 *   - Relevance (40%): % of entries matching the current phase
 *   - Diversity (20%): penalizes when >80% of tokens come from one directory
 *
 * Gated by features.context_quality_scoring in config.json.
 * Report written to .planning/.context-quality.json for dashboard/audit consumption.
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

/**
 * Score context quality based on ledger entries.
 *
 * @param {Array} entries - Ledger entries from .context-ledger.json
 * @param {Object} config - Config object (needs context_ledger.stale_after_minutes)
 * @param {string} [currentPhase] - Current phase identifier for relevance scoring
 * @returns {number} Score 0-100
 */
function scoreContext(entries, config, currentPhase) {
  if (!entries || entries.length === 0) return 100;

  const staleMinutes = (config && config.context_ledger && config.context_ledger.stale_after_minutes) || 60;
  const staleThresholdMs = staleMinutes * 60 * 1000;
  const now = Date.now();

  // Freshness: % of entries that are fresh (< stale_after_minutes old)
  let freshCount = 0;
  for (const entry of entries) {
    if (entry.timestamp) {
      const age = now - new Date(entry.timestamp).getTime();
      if (age < staleThresholdMs) {
        freshCount++;
      }
    }
  }
  const freshness = Math.round((freshCount / entries.length) * 100);

  // Relevance: % of entries matching current phase
  let relevantCount = 0;
  if (currentPhase) {
    for (const entry of entries) {
      if (entry.phase === currentPhase) {
        relevantCount++;
      }
    }
  } else {
    // If no current phase known, treat all as relevant
    relevantCount = entries.length;
  }
  const relevance = Math.round((relevantCount / entries.length) * 100);

  // Diversity: penalize when >80% of tokens come from a single directory group
  const groups = {};
  let totalTokens = 0;
  for (const entry of entries) {
    const tokens = entry.est_tokens || 0;
    totalTokens += tokens;
    const dir = entry.file ? path.dirname(entry.file) : 'unknown';
    groups[dir] = (groups[dir] || 0) + tokens;
  }

  let diversity = 100;
  if (totalTokens > 0) {
    const maxGroupPct = Math.max(...Object.values(groups)) / totalTokens * 100;
    if (maxGroupPct > 80) {
      diversity = Math.max(0, Math.round(100 - (maxGroupPct - 80) * 2.5));
    }
  }

  // Weighted average
  const score = freshness * 0.4 + relevance * 0.4 + diversity * 0.2;
  return Math.round(score);
}

/**
 * Generate a quality report from the context ledger.
 * Returns null if the feature is disabled.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {Object|null} { score, breakdown, timestamp, entry_count } or null
 */
function getQualityReport(planningDir) {
  // Load config and check toggle
  let config;
  try {
    const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
    config = configLoad(planningDir);
  } catch (_e) {
    try {
      const configPath = path.join(planningDir, 'config.json');
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_e2) {
      return null;
    }
  }

  if (!config || (config.features && config.features.context_quality_scoring === false)) {
    return null;
  }

  // Read ledger
  let entries;
  try {
    const { readLedger } = require('./track-context-budget');
    entries = readLedger(planningDir);
  } catch (_e) {
    try {
      const ledgerPath = path.join(planningDir, '.context-ledger.json');
      entries = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    } catch (_e2) {
      entries = [];
    }
  }

  // Detect current phase from STATE.md
  let currentPhase = null;
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const phaseMatch = stateContent.match(/phase_name:\s*"?([^"\n]+)"?/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
    }
  } catch (_e) { /* best-effort */ }

  // Calculate sub-scores for breakdown
  const staleMinutes = (config.context_ledger && config.context_ledger.stale_after_minutes) || 60;
  const staleThresholdMs = staleMinutes * 60 * 1000;
  const now = Date.now();

  let freshCount = 0;
  for (const entry of entries) {
    if (entry.timestamp) {
      const age = now - new Date(entry.timestamp).getTime();
      if (age < staleThresholdMs) freshCount++;
    }
  }
  const freshness = entries.length > 0 ? Math.round((freshCount / entries.length) * 100) : 100;

  let relevantCount = 0;
  if (currentPhase && entries.length > 0) {
    for (const entry of entries) {
      if (entry.phase === currentPhase) relevantCount++;
    }
  } else {
    relevantCount = entries.length;
  }
  const relevance = entries.length > 0 ? Math.round((relevantCount / entries.length) * 100) : 100;

  const groups = {};
  let totalTokens = 0;
  for (const entry of entries) {
    const tokens = entry.est_tokens || 0;
    totalTokens += tokens;
    const dir = entry.file ? path.dirname(entry.file) : 'unknown';
    groups[dir] = (groups[dir] || 0) + tokens;
  }
  let diversity = 100;
  if (totalTokens > 0) {
    const maxGroupPct = Math.max(...Object.values(groups)) / totalTokens * 100;
    if (maxGroupPct > 80) {
      diversity = Math.max(0, Math.round(100 - (maxGroupPct - 80) * 2.5));
    }
  }

  const score = scoreContext(entries, config, currentPhase);

  return {
    score,
    breakdown: { freshness, relevance, diversity },
    timestamp: new Date().toISOString(),
    entry_count: entries.length
  };
}

/**
 * Write quality report to .planning/.context-quality.json (atomic write).
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {Object} report - Quality report object
 */
function writeQualityReport(planningDir, report) {
  try {
    const filePath = path.join(planningDir, '.context-quality.json');
    const tmpPath = filePath + '.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(report, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
    logHook('context-quality', 'score', 'updated', { score: report.score });
  } catch (_e) {
    // Fire-and-forget
    try { fs.unlinkSync(path.join(planningDir, '.context-quality.json.' + process.pid)); } catch (_e2) { /* cleanup */ }
  }
}

/**
 * Check if the project is eligible for Skip-RAG (loading entire codebase).
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ eligible: boolean, reason?: string, line_count?: number, max?: number }}
 */
function isSkipRagEligible(planningDir) {
  try {
    // Load config
    let config;
    try {
      const { configLoad } = require('../plan-build-run/bin/lib/config.cjs');
      config = configLoad(planningDir);
    } catch (_e) {
      try {
        const configPath = path.join(planningDir, 'config.json');
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (_e2) {
        return { eligible: false, reason: 'config not found' };
      }
    }

    if (!config || !config.features || config.features.skip_rag !== true) {
      return { eligible: false, reason: 'disabled' };
    }

    const maxLines = config.skip_rag_max_lines || 50000;

    // Count project lines using git ls-files
    const { execSync } = require('child_process');
    const projectRoot = planningDir.replace(/[/\\]\.planning$/, '');
    const codeExtensions = ['js', 'ts', 'py', 'jsx', 'tsx', 'cjs', 'mjs', 'vue', 'svelte', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php'];

    // Get list of tracked code files
    const files = execSync(`git ls-files --cached`, {
      encoding: 'utf8',
      cwd: projectRoot,
      timeout: 10000
    }).trim().split('\n').filter(f => {
      const ext = f.split('.').pop();
      return codeExtensions.includes(ext);
    });

    // Count lines by reading files directly
    let totalLines = 0;
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      try {
        for (const file of batch) {
          try {
            const filePath = path.join(projectRoot, file);
            const content = fs.readFileSync(filePath, 'utf8');
            totalLines += content.split('\n').length;
          } catch (_e) { /* skip unreadable files */ }
        }
      } catch (_e) { /* skip batch errors */ }
    }

    if (totalLines < maxLines) {
      return { eligible: true, line_count: totalLines };
    }
    return { eligible: false, reason: 'project too large', line_count: totalLines, max: maxLines };
  } catch (_e) {
    return { eligible: false, reason: 'count failed' };
  }
}

module.exports = { scoreContext, getQualityReport, writeQualityReport, isSkipRagEligible };
