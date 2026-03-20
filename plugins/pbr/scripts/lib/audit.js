/**
 * Audit utilities for Plan-Build-Run.
 *
 * Provides functions to query hooks.jsonl logs for plan-checker
 * and other audit-relevant events.
 */

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./resolve-root');

/**
 * Query plan-checker results from hooks.jsonl log files.
 *
 * @param {object} options
 * @param {number} [options.last=30] - Number of days to look back
 * @returns {{ entries: Array, total: number, passed: number, failed: number, date_range: { from: string, to: string } }}
 */
function auditPlanChecks(options = {}) {
  const cwd = resolveProjectRoot();
  const logsDir = path.join(cwd, '.planning', 'logs');
  if (!fs.existsSync(logsDir)) return { entries: [], total: 0, passed: 0, failed: 0, date_range: { from: '', to: '' } };

  const files = fs.readdirSync(logsDir)
    .filter(f => /^hooks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort();

  // Filter to last N days
  const lastDays = options.last || 30;
  const cutoff = new Date(Date.now() - lastDays * 86400000).toISOString().slice(0, 10);
  const relevantFiles = files.filter(f => {
    const dateStr = f.replace('hooks-', '').replace('.jsonl', '');
    return dateStr >= cutoff;
  });

  const entries = [];
  for (const file of relevantFiles) {
    const filePath = path.join(logsDir, file);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.hook === 'plan-checker' && entry.action === 'validate') {
          entries.push({
            timestamp: entry.ts,
            phase: entry.phase,
            status: entry.status,
            dimensions: entry.dimensions,
            blockers: entry.blockers
          });
        }
      } catch (_e) { /* skip malformed lines */ }
    }
  }

  return {
    entries,
    total: entries.length,
    passed: entries.filter(e => e.status === 'passed').length,
    failed: entries.filter(e => e.status === 'issues_found').length,
    date_range: { from: cutoff, to: new Date().toISOString().slice(0, 10) }
  };
}

module.exports = { auditPlanChecks };
