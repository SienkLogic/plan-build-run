import { execFile as execFileCb } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { TTLCache } from '../utils/cache.js';

const execFile = promisify(execFileCb);

export const cache = new TTLCache(60_000); // 60s TTL

/**
 * Run a git command in the given directory, returning stdout.
 * Returns empty string on failure.
 */
async function git(projectDir, args) {
  try {
    const { stdout } = await execFile('git', args, {
      cwd: projectDir,
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Compute project analytics from git history and .planning/ files.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{phases: Array, summary: object, warning?: string}>}
 */
export async function getProjectAnalytics(projectDir) {
  const cacheKey = `analytics:${projectDir}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const phasesDir = join(projectDir, '.planning', 'phases');
  let phaseDirs = [];
  let warning = null;

  try {
    const entries = await readdir(phasesDir, { withFileTypes: true });
    phaseDirs = entries
      .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    if (err.code === 'ENOENT') {
      warning = 'No .planning/phases/ directory found';
    } else {
      warning = `Failed to read phases directory: ${err.message}`;
    }
  }

  // Get all commit log lines once
  const allLog = await git(projectDir, ['log', '--oneline', '--all']);
  const allLogLines = allLog ? allLog.trim().split('\n').filter(Boolean) : [];

  // Get numstat for lines changed
  const numstatRaw = await git(projectDir, ['log', '--numstat', '--all', '--format=COMMIT:%s']);

  const phases = [];

  for (const dir of phaseDirs) {
    const phaseNum = dir.name.split('-')[0];
    const phaseName = dir.name.split('-').slice(1).map(
      w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ');

    // Commit count: match scope pattern (NN-
    const scopePattern = new RegExp(`\\(${phaseNum}-`);
    const commitCount = allLogLines.filter(line => scopePattern.test(line)).length;

    // Phase duration from git dates (match commits by scope pattern in message)
    const dateOutput = await git(projectDir, [
      'log', '--all', `--format=%aI`, `--grep=(${phaseNum}-`
    ]);
    const dates = dateOutput.trim().split('\n').filter(Boolean).map(d => new Date(d));
    let duration = null;
    if (dates.length >= 2) {
      const earliest = new Date(Math.min(...dates));
      const latest = new Date(Math.max(...dates));
      const days = Math.round((latest - earliest) / (1000 * 60 * 60 * 24));
      duration = `${days}d`;
    }

    // Plan count
    let planCount = 0;
    try {
      const files = await readdir(join(phasesDir, dir.name));
      planCount = files.filter(f => /^(?:\d{2}-\d{2}-)?PLAN.*\.md$/i.test(f)).length;
    } catch {
      // ignore
    }

    // Lines changed: parse numstat output for commits matching this phase scope
    let linesChanged = 0;
    if (numstatRaw) {
      let currentCommitMatches = false;
      for (const line of numstatRaw.split('\n')) {
        if (line.startsWith('COMMIT:')) {
          currentCommitMatches = scopePattern.test(line);
        } else if (currentCommitMatches && line.trim()) {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            const added = parseInt(parts[0], 10) || 0;
            const deleted = parseInt(parts[1], 10) || 0;
            linesChanged += added + deleted;
          }
        }
      }
    }

    phases.push({
      phaseId: phaseNum,
      phaseName,
      commitCount,
      duration,
      planCount,
      linesChanged
    });
  }

  // Aggregate summary
  const totalCommits = phases.reduce((s, p) => s + p.commitCount, 0);
  const totalPhases = phases.length;
  const durations = phases.filter(p => p.duration).map(p => parseInt(p.duration, 10));
  const avgDuration = durations.length
    ? `${Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)}d`
    : 'N/A';
  const totalLinesChanged = phases.reduce((s, p) => s + p.linesChanged, 0);

  const result = {
    phases,
    summary: { totalCommits, totalPhases, avgDuration, totalLinesChanged },
    ...(warning ? { warning } : {})
  };

  cache.set(cacheKey, result);
  return result;
}
