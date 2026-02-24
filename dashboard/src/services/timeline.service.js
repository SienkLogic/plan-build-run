import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { TTLCache } from '../utils/cache.js';

const execFile = promisify(execFileCb);

export const cache = new TTLCache(30_000); // 30s TTL

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
 * Aggregate timeline events from git commits, todo completions, and STATE.md
 * phase transitions into a unified chronological array.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {{ types?: string[], phase?: string, dateFrom?: string, dateTo?: string }} filters
 * @returns {Promise<Array>}
 */
export async function getTimelineEvents(projectDir, filters = {}) {
  const cacheKey = `timeline:${projectDir}:${JSON.stringify(filters)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59Z') : null;

  // --- Git commits ---
  let commitEvents = [];
  const logOutput = await git(projectDir, [
    'log', '--all', '--format=%H|%aI|%s|%an'
  ]);
  if (logOutput.trim()) {
    for (const line of logOutput.trim().split('\n')) {
      const parts = line.split('|');
      if (parts.length < 4) continue;
      const [id, isoDate, subject, ...authorParts] = parts;
      const author = authorParts.join('|');
      const date = new Date(isoDate);
      if (isNaN(date.getTime())) continue;

      // Phase filter: keep only commits whose subject matches scope pattern for that phase
      if (filters.phase) {
        const phaseNum = String(filters.phase).padStart(2, '0');
        const scopeRe = new RegExp(`\\(${phaseNum}-`);
        if (!scopeRe.test(subject)) continue;
      }

      if (dateFrom && date < dateFrom) continue;
      if (dateTo && date > dateTo) continue;

      commitEvents.push({ type: 'commit', id, date, title: subject, author });
    }
  }

  // --- Todo completions ---
  let todoEvents = [];
  try {
    const doneDir = join(projectDir, '.planning', 'todos', 'done');
    const entries = await readdir(doneDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        const raw = await readFile(join(doneDir, entry.name), 'utf-8');
        // Parse frontmatter manually
        const lines = raw.split(/\r?\n/);
        if (lines[0] !== '---') continue;
        const endIdx = lines.indexOf('---', 1);
        if (endIdx === -1) continue;
        const fmLines = lines.slice(1, endIdx);
        let title = '';
        let completedAt = '';
        for (const fmLine of fmLines) {
          const titleMatch = fmLine.match(/^title:\s*['"]?(.+?)['"]?\s*$/);
          if (titleMatch) title = titleMatch[1];
          const completedMatch = fmLine.match(/^completed_at:\s*['"]?(.+?)['"]?\s*$/);
          if (completedMatch) completedAt = completedMatch[1];
        }
        if (!completedAt) continue;
        const date = new Date(completedAt);
        if (isNaN(date.getTime())) continue;

        if (dateFrom && date < dateFrom) continue;
        if (dateTo && date > dateTo) continue;

        todoEvents.push({
          type: 'todo-completion',
          id: entry.name,
          date,
          title: title || entry.name.replace(/^\d{3}-/, '').replace(/\.md$/, '').replace(/-/g, ' ')
        });
      } catch {
        // skip unreadable files
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Non-ENOENT errors: skip silently for robustness
    }
  }

  // --- Phase transitions from STATE.md ---
  let phaseEvents = [];
  try {
    const statePath = join(projectDir, '.planning', 'STATE.md');
    const raw = await readFile(statePath, 'utf-8');
    const lines = raw.split(/\r?\n/);

    // Best-effort: extract current phase and last updated
    let currentPhase = '';
    let currentStatus = '';
    let lastUpdated = '';

    for (const line of lines) {
      const phaseMatch = line.match(/\*\*Current phase:\*\*\s*(.+)/);
      if (phaseMatch) currentPhase = phaseMatch[1].trim();

      const statusMatch = line.match(/\*\*Status:\*\*\s*(.+)/);
      if (statusMatch) currentStatus = statusMatch[1].trim();

      const updatedMatch = line.match(/\*\*Last updated:\*\*\s*(.+)/);
      if (updatedMatch) lastUpdated = updatedMatch[1].trim();
    }

    if (lastUpdated) {
      const date = new Date(lastUpdated);
      if (!isNaN(date.getTime())) {
        const title = currentPhase
          ? `Phase ${currentPhase} — ${currentStatus || 'active'}`
          : `Status: ${currentStatus || 'active'}`;

        if ((!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)) {
          phaseEvents.push({
            type: 'phase-transition',
            id: 'state-current',
            date,
            title
          });
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Non-ENOENT: skip silently
    }
  }

  // Merge and sort descending (newest first)
  let events = [...commitEvents, ...todoEvents, ...phaseEvents];
  events.sort((a, b) => b.date - a.date);

  // Apply types filter
  if (filters.types && filters.types.length > 0) {
    events = events.filter(e => filters.types.includes(e.type));
  }

  cache.set(cacheKey, events);
  return events;
}
