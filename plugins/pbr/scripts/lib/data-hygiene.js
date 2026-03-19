/**
 * lib/data-hygiene.js — Data maintenance for .planning/ research, intel, and codebase directories.
 *
 * Provides:
 *   dataStatus(planningDir) — Freshness report for each data directory
 *   dataPrune(planningDir, options) — Archive stale files with dry-run support
 */

const fs = require('fs');
const path = require('path');

const STALENESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Files that must never be archived
const PROTECTED_FILES = {
  research: ['SUMMARY.md', 'STACK.md'],
  codebase: ['graph.json'],
  intel: [] // .last-refresh.json is a dot-file, won't match normal iteration
};

/**
 * Gather freshness and size information for research/, intel/, and codebase/ directories.
 *
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @returns {{ research: object, intel: object, codebase: object, checked_at: string }}
 */
function dataStatus(planningDir) {
  const now = new Date();
  const result = { checked_at: now.toISOString() };

  for (const dirName of ['research', 'intel', 'codebase']) {
    const dirPath = path.join(planningDir, dirName);
    const info = { files: 0, size_kb: 0, newest_mtime: null, stale: true };

    if (!fs.existsSync(dirPath)) {
      result[dirName] = info;
      continue;
    }

    let newestMtime = 0;
    let totalSize = 0;
    let fileCount = 0;

    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        // Skip archive subdirectory and dot-files other than .last-refresh.json
        if (entry === 'archive') continue;

        const fullPath = path.join(dirPath, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          fileCount++;
          totalSize += stat.size;
          if (stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
          }
        } catch (_e) {
          // Skip unreadable files
        }
      }
    } catch (_e) {
      // Directory unreadable
    }

    info.files = fileCount;
    info.size_kb = Math.round(totalSize / 1024 * 10) / 10;
    info.newest_mtime = newestMtime > 0 ? new Date(newestMtime).toISOString() : null;
    info.stale = newestMtime === 0 || (now.getTime() - newestMtime) > STALENESS_THRESHOLD_MS;

    // Directory-specific freshness indicators
    if (dirName === 'intel') {
      const refreshPath = path.join(dirPath, '.last-refresh.json');
      try {
        if (fs.existsSync(refreshPath)) {
          const refreshData = JSON.parse(fs.readFileSync(refreshPath, 'utf8'));
          if (refreshData.timestamp) {
            info.last_refresh = refreshData.timestamp;
          }
        }
      } catch (_e) {
        // Ignore parse errors
      }
    } else if (dirName === 'codebase') {
      const graphPath = path.join(dirPath, 'graph.json');
      try {
        if (fs.existsSync(graphPath)) {
          const stat = fs.statSync(graphPath);
          info.graph_mtime = new Date(stat.mtimeMs).toISOString();
        }
      } catch (_e) {
        // Ignore
      }
    } else if (dirName === 'research') {
      const summaryPath = path.join(dirPath, 'SUMMARY.md');
      try {
        if (fs.existsSync(summaryPath)) {
          const stat = fs.statSync(summaryPath);
          info.summary_mtime = new Date(stat.mtimeMs).toISOString();
        }
      } catch (_e) {
        // Ignore
      }
    }

    result[dirName] = info;
  }

  return result;
}

/**
 * Archive files older than a given date in research/ and codebase/ directories.
 *
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {object} options
 * @param {string} options.before - ISO date string; files older than this get archived
 * @param {boolean} [options.dryRun=false] - If true, report what would be archived without moving
 * @returns {{ archived: Array<{from: string, to: string}>, skipped: string[], dry_run: boolean }}
 */
function dataPrune(planningDir, options) {
  const { before, dryRun = false } = options || {};
  const cutoff = before ? new Date(before).getTime() : 0;
  const archived = [];
  const skipped = [];

  if (!cutoff || isNaN(cutoff)) {
    return { archived, skipped, dry_run: dryRun, error: 'Invalid or missing --before date' };
  }

  for (const dirName of ['research', 'codebase']) {
    const dirPath = path.join(planningDir, dirName);
    if (!fs.existsSync(dirPath)) continue;

    const protectedSet = new Set(PROTECTED_FILES[dirName] || []);
    const archiveDir = path.join(dirPath, 'archive');

    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch (_e) {
      continue;
    }

    for (const entry of entries) {
      if (entry === 'archive') continue;

      const fullPath = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        if (protectedSet.has(entry)) {
          skipped.push(`${dirName}/${entry} (protected)`);
          continue;
        }

        if (stat.mtimeMs < cutoff) {
          const destPath = path.join(archiveDir, entry);
          if (!dryRun) {
            fs.mkdirSync(archiveDir, { recursive: true });
            fs.renameSync(fullPath, destPath);
          }
          archived.push({
            from: `${dirName}/${entry}`,
            to: `${dirName}/archive/${entry}`
          });
        }
      } catch (_e) {
        // Skip unreadable files
      }
    }
  }

  return { archived, skipped, dry_run: dryRun };
}

module.exports = { dataStatus, dataPrune };
