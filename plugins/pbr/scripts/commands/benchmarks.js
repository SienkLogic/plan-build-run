/**
 * commands/benchmarks.js — CLI handler for cost & duration benchmarking.
 *
 * Subcommands: summary, phase, agents, session
 * Flags: --json for machine-readable output
 */

'use strict';

const { loadCostEntries, aggregateCosts, phaseSummary } = require('../lib/benchmark');

/**
 * Format milliseconds as "Xm Ys" for readability.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

/**
 * Pad a string to a given width (right-pad with spaces).
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function pad(str, width) {
  const s = String(str);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

/**
 * Render a simple text table from rows.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
function renderTable(headers, rows) {
  const widths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, String(row[i] || '').length), 0);
    return Math.max(h.length, maxRow);
  });

  const headerLine = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const separator = widths.map(w => '-'.repeat(w)).join('  ');
  const dataLines = rows.map(row =>
    row.map((cell, i) => pad(String(cell || ''), widths[i])).join('  ')
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

/**
 * Handle the `benchmarks` CLI command.
 * @param {string[]} args - CLI args where args[0] is 'benchmarks'
 * @param {{ planningDir: string, cwd: string, output: Function, error: Function }} ctx
 */
async function handleBenchmarks(args, ctx) {
  const { planningDir, output, error } = ctx;
  const subcommand = args[1];
  const jsonFlag = args.includes('--json');

  if (!subcommand || subcommand === '--help' || subcommand === 'help') {
    const usage = [
      'Usage: pbr-tools.js benchmarks <subcommand> [options]',
      '',
      'Subcommands:',
      '  summary              Per-phase cost table with quality scores',
      '  phase <N>            Per-agent breakdown within a single phase',
      '  agents               Per-agent-type averages across all phases',
      '  session              Current session cost summary',
      '',
      'Flags:',
      '  --json               Machine-readable JSON output',
    ].join('\n');
    process.stdout.write(usage + '\n');
    return;
  }

  if (subcommand === 'summary') {
    const result = phaseSummary(planningDir);
    if (result.totals.count === 0) {
      process.stdout.write('No benchmark data found. Cost tracking begins on next agent spawn.\n');
      return;
    }
    if (jsonFlag) {
      output(result);
      return;
    }
    const headers = ['Phase', 'Agents', 'Duration', 'Avg', 'Quality'];
    const rows = Object.entries(result.phases)
      .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .map(([phase, stats]) => [
        phase,
        String(stats.count),
        formatDuration(stats.total_ms),
        formatDuration(stats.avg_ms),
        stats.quality || '-'
      ]);
    process.stdout.write(renderTable(headers, rows) + '\n');
    process.stdout.write('\nTotal: ' + result.totals.count + ' agents, ' + formatDuration(result.totals.total_ms) + '\n');
    return;
  }

  if (subcommand === 'phase') {
    const phaseNum = args[2];
    if (!phaseNum) {
      error('Usage: pbr-tools.js benchmarks phase <N>');
      return;
    }
    const entries = loadCostEntries(planningDir);
    const filtered = entries.filter(e => String(e.phase) === String(phaseNum));
    if (filtered.length === 0) {
      process.stdout.write('No benchmark data found for phase ' + phaseNum + '.\n');
      return;
    }
    const { groups, totals } = aggregateCosts(filtered, 'agent');
    if (jsonFlag) {
      output({ phase: phaseNum, groups, totals });
      return;
    }
    const headers = ['Agent', 'Count', 'Total Duration', 'Avg Duration'];
    const rows = Object.entries(groups)
      .sort(([, a], [, b]) => b.total_ms - a.total_ms)
      .map(([agent, stats]) => [
        agent,
        String(stats.count),
        formatDuration(stats.total_ms),
        formatDuration(stats.avg_ms)
      ]);
    process.stdout.write('Phase ' + phaseNum + ' Agent Breakdown\n');
    process.stdout.write(renderTable(headers, rows) + '\n');
    process.stdout.write('\nTotal: ' + totals.count + ' agents, ' + formatDuration(totals.total_ms) + '\n');
    return;
  }

  if (subcommand === 'agents') {
    const entries = loadCostEntries(planningDir);
    if (entries.length === 0) {
      process.stdout.write('No benchmark data found. Cost tracking begins on next agent spawn.\n');
      return;
    }
    const { groups, totals } = aggregateCosts(entries, 'agent');
    if (jsonFlag) {
      output({ groups, totals });
      return;
    }
    const headers = ['Agent Type', 'Count', 'Total Duration', 'Avg Duration'];
    const rows = Object.entries(groups)
      .sort(([, a], [, b]) => b.total_ms - a.total_ms)
      .map(([agent, stats]) => [
        agent,
        String(stats.count),
        formatDuration(stats.total_ms),
        formatDuration(stats.avg_ms)
      ]);
    process.stdout.write(renderTable(headers, rows) + '\n');
    process.stdout.write('\nTotal: ' + totals.count + ' agents, ' + formatDuration(totals.total_ms) + '\n');
    return;
  }

  if (subcommand === 'session') {
    const entries = loadCostEntries(planningDir);
    if (entries.length === 0) {
      process.stdout.write('No benchmark data found. Cost tracking begins on next agent spawn.\n');
      return;
    }
    const { groups, totals } = aggregateCosts(entries, 'session');
    if (jsonFlag) {
      output({ groups, totals });
      return;
    }
    const headers = ['Session', 'Count', 'Total Duration', 'Avg Duration'];
    const rows = Object.entries(groups)
      .sort(([, a], [, b]) => b.total_ms - a.total_ms)
      .map(([session, stats]) => [
        session,
        String(stats.count),
        formatDuration(stats.total_ms),
        formatDuration(stats.avg_ms)
      ]);
    process.stdout.write(renderTable(headers, rows) + '\n');
    process.stdout.write('\nTotal: ' + totals.count + ' agents, ' + formatDuration(totals.total_ms) + '\n');
    return;
  }

  error('Unknown benchmarks subcommand: ' + subcommand + '\nAvailable: summary, phase, agents, session');
}

module.exports = { handleBenchmarks, formatDuration, renderTable };
