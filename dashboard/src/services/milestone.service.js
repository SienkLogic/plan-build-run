import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';
import { getRoadmapData } from './roadmap.service.js';
import { TTLCache } from '../utils/cache.js';

export const cache = new TTLCache(300_000); // 300s TTL

/**
 * Scan .planning/milestones/ for archived milestone files.
 * Supports two formats:
 * - Directory: v{version}/ containing ROADMAP.md, STATS.md, etc.
 * - Flat file: v{version}-{TYPE}.md (legacy)
 * Directory format takes precedence if both exist for the same version.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array<{version: string, name: string, date: string, duration: string, files: string[]}>>}
 */
export async function listArchivedMilestones(projectDir) {
  const cacheKey = `milestones:${projectDir}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const milestonesDir = join(projectDir, '.planning', 'milestones');

  let entries;
  try {
    entries = await readdir(milestonesDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const versionMap = new Map();

  // Pass 1: Detect directory-format milestones (v1.0/, v2.0/, etc.)
  const dirPattern = /^v([\w.-]+)$/;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(dirPattern);
    if (!match) continue;

    const version = match[1];
    // Read files inside the version directory
    let dirFiles;
    try {
      dirFiles = await readdir(join(milestonesDir, entry.name));
    } catch (_e) {
      continue;
    }
    const mdFiles = dirFiles.filter(f => f.endsWith('.md'));
    if (mdFiles.length === 0) continue;

    versionMap.set(version, { version, name: '', date: '', duration: '', files: mdFiles, format: 'directory' });
  }

  // Pass 2: Detect flat-file milestones (v1.0-ROADMAP.md, etc.) — skip versions already found as directories
  const filePattern = /^v([\w.-]+)-(\w+)\.md$/;
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const match = entry.name.match(filePattern);
    if (!match) continue;

    const version = match[1];
    // Skip if this version was already found as a directory
    if (versionMap.has(version) && versionMap.get(version).format === 'directory') continue;

    if (!versionMap.has(version)) {
      versionMap.set(version, { version, name: '', date: '', duration: '', files: [], format: 'flat' });
    }
    versionMap.get(version).files.push(entry.name);
  }

  // Try to parse STATS.md for each version to get name/date/duration/stats
  for (const [version, milestone] of versionMap) {
    milestone.stats = { phaseCount: 0, commitCount: 0, deliverables: [] };
    let statsPath;
    if (milestone.format === 'directory') {
      if (milestone.files.includes('STATS.md')) {
        statsPath = join(milestonesDir, `v${version}`, 'STATS.md');
      }
    } else {
      const statsFile = `v${version}-STATS.md`;
      if (milestone.files.includes(statsFile)) {
        statsPath = join(milestonesDir, statsFile);
      }
    }

    if (statsPath) {
      try {
        const { frontmatter, html, rawContent } = await readMarkdownFile(statsPath);
        milestone.name = frontmatter.milestone || frontmatter.name || `v${version}`;
        milestone.date = frontmatter.completed || frontmatter.date || '';
        milestone.duration = frontmatter.duration || '';
        milestone.stats.phaseCount = frontmatter.phases_completed || frontmatter.phase_count || 0;
        milestone.stats.commitCount = frontmatter.total_commits || frontmatter.commit_count || 0;
        milestone.stats.statsHtml = html || '';

        // Fallback: parse markdown content if frontmatter is empty
        if (milestone.name === `v${version}` && rawContent) {
          const nameMatch = rawContent.match(/\*\*Name:\*\*\s*(.+)/);
          if (nameMatch) milestone.name = nameMatch[1].trim();
          else {
            const titleMatch = rawContent.match(/^#\s+.*?:\s*(.+?)(?:\s*\(v[\d.]+\))?$/m);
            if (titleMatch) milestone.name = titleMatch[1].trim();
          }
        }
        if (!milestone.date && rawContent) {
          const dateMatch = rawContent.match(/\*\*Completed:\*\*\s*(.+)/);
          if (dateMatch) milestone.date = dateMatch[1].trim();
        }
        if (!milestone.duration && rawContent) {
          const durMatch = rawContent.match(/\*\*Duration:\*\*\s*(.+)/);
          if (durMatch) milestone.duration = durMatch[1].trim();
        }
        if (!milestone.stats.commitCount && rawContent) {
          const commitMatch = rawContent.match(/Total commits:\s*(\d+)/i) || rawContent.match(/\*\*Plans\*\*:\s*(\d+)/);
          if (commitMatch) milestone.stats.commitCount = parseInt(commitMatch[1], 10);
        }
      } catch (_e) {
        milestone.name = `v${version}`;
      }
    } else {
      milestone.name = `v${version}`;
    }

    // Try to read deliverables from archived ROADMAP.md
    if (milestone.format === 'directory' && milestone.files.includes('ROADMAP.md')) {
      try {
        const { frontmatter: rmFm } = await readMarkdownFile(join(milestonesDir, `v${version}`, 'ROADMAP.md'));
        if (Array.isArray(rmFm.phases)) {
          milestone.stats.deliverables = rmFm.phases.map(p => typeof p === 'string' ? p : (p.name || p.title || ''));
        }
      } catch (_e) { /* ignore */ }
    }

    // Try phases/ subdirectory for deliverables if none found yet
    if (milestone.format === 'directory' && milestone.stats.deliverables.length === 0) {
      try {
        const phasesDir = join(milestonesDir, `v${version}`, 'phases');
        const phaseDirs = await readdir(phasesDir, { withFileTypes: true });
        milestone.stats.deliverables = phaseDirs
          .filter(d => d.isDirectory())
          .map(d => d.name)
          .sort();
        if (milestone.stats.phaseCount === 0) {
          milestone.stats.phaseCount = milestone.stats.deliverables.length;
        }
      } catch (_e) { /* no phases dir */ }
    }
  }

  // Sort by version descending (newest first) — strip internal format field
  const result = [...versionMap.values()]
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
    .map(({ format: _f, ...rest }) => rest);

  cache.set(cacheKey, result);
  return result;
}

/**
 * Combine active milestones from ROADMAP.md with archived milestones.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{active: Array, archived: Array}>}
 */
export async function getAllMilestones(projectDir) {
  const allCacheKey = `all-milestones:${projectDir}`;
  const allCached = cache.get(allCacheKey);
  if (allCached) return allCached;

  const [roadmapData, archived] = await Promise.all([
    getRoadmapData(projectDir),
    listArchivedMilestones(projectDir)
  ]);

  const allResult = {
    active: roadmapData.milestones || [],
    archived
  };

  cache.set(allCacheKey, allResult);
  return allResult;
}

/**
 * Read all archived files for a specific milestone version.
 * Returns rendered HTML for each file type (ROADMAP, STATS, REQUIREMENTS).
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {string} version - Milestone version (e.g., "1.0")
 * @returns {Promise<{version: string, sections: Array<{type: string, frontmatter: object, html: string}>}>}
 */
export async function getMilestoneDetail(projectDir, version) {
  const milestonesDir = join(projectDir, '.planning', 'milestones');
  const fileTypes = ['ROADMAP', 'STATS', 'REQUIREMENTS'];

  const sections = [];
  for (const type of fileTypes) {
    // Try directory format first, then fall back to flat file
    const dirPath = join(milestonesDir, `v${version}`, `${type}.md`);
    const flatPath = join(milestonesDir, `v${version}-${type}.md`);

    let result;
    try {
      result = await readMarkdownFile(dirPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      try {
        result = await readMarkdownFile(flatPath);
      } catch (err2) {
        if (err2.code !== 'ENOENT') throw err2;
        // Neither format exists for this type — skip
        continue;
      }
    }
    sections.push({ type, frontmatter: result.frontmatter, html: result.html });
  }

  return { version, sections };
}
