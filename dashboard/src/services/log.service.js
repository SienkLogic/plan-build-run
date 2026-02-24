import { readdir, stat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

/**
 * List .jsonl files in .planning/logs/ sorted by filename descending.
 * Returns array of { name, size, modified }.
 * @param {string} projectDir - Root project directory
 * @returns {Promise<Array<{name: string, size: number, modified: string}>>}
 */
export async function listLogFiles(projectDir) {
  const logsDir = join(projectDir, '.planning', 'logs');
  let entries;
  try {
    entries = await readdir(logsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const jsonlFiles = entries.filter(f => f.endsWith('.jsonl')).sort().reverse();
  const results = await Promise.allSettled(
    jsonlFiles.map(async f => {
      const s = await stat(join(logsDir, f));
      return { name: f, size: s.size, modified: s.mtime.toISOString() };
    })
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

/**
 * Read a page of entries from a JSONL log file.
 * Reads the entire file line-by-line but only keeps the requested page in memory.
 * @param {string} filePath - Absolute path to the .jsonl file
 * @param {object} opts - { page=1, pageSize=100, typeFilter='', q='' }
 * @returns {Promise<{ entries: object[], total: number, page: number, pageSize: number }>}
 */
export async function readLogPage(filePath, { page = 1, pageSize = 100, typeFilter = '', q = '' } = {}) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { entries: [], total: 0, page, pageSize };
    throw err;
  }

  // Parse and filter in a single pass — no full array of all lines held beyond filtering
  const allEntries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (typeFilter && obj.type !== typeFilter) continue;
    if (q && !JSON.stringify(obj).toLowerCase().includes(q.toLowerCase())) continue;
    allEntries.push(obj);
  }

  const total = allEntries.length;
  const start = (page - 1) * pageSize;
  const entries = allEntries.slice(start, start + pageSize);
  return { entries, total, page, pageSize };
}

/**
 * Tail a log file: watch for new lines appended after the current end.
 * Uses fs.stat polling via setInterval (no extra deps).
 * @param {string} filePath - Absolute path to the .jsonl file
 * @param {(entry: object) => void} onLine - Called for each new parsed entry
 * @returns {Promise<() => void>} cleanup function — call to stop watching
 */
export async function tailLogFile(filePath, onLine) {
  let currentSize;
  try {
    const s = await stat(filePath);
    currentSize = s.size;
  } catch {
    currentSize = 0;
  }

  const interval = setInterval(async () => {
    let newSize;
    try {
      const s = await stat(filePath);
      newSize = s.size;
    } catch {
      return;
    }
    if (newSize <= currentSize) return;

    // Read only the new bytes
    const stream = createReadStream(filePath, { start: currentSize, end: newSize - 1 });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try { onLine(JSON.parse(trimmed)); } catch { /* skip malformed */ }
    });
    currentSize = newSize;
  }, 500);

  return () => clearInterval(interval);
}
