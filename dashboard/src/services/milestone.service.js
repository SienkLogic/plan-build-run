import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';
import { getRoadmapData } from './roadmap.service.js';

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

  // Try to parse STATS.md for each version to get name/date/duration
  for (const [version, milestone] of versionMap) {
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
        const { frontmatter } = await readMarkdownFile(statsPath);
        milestone.name = frontmatter.milestone || frontmatter.name || `v${version}`;
        milestone.date = frontmatter.completed || frontmatter.date || '';
        milestone.duration = frontmatter.duration || '';
      } catch (_e) {
        milestone.name = `v${version}`;
      }
    } else {
      milestone.name = `v${version}`;
    }
  }

  // Sort by version descending (newest first) — strip internal format field
  return [...versionMap.values()]
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
    .map(({ format: _f, ...rest }) => rest);
}

/**
 * Combine active milestones from ROADMAP.md with archived milestones.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{active: Array, archived: Array}>}
 */
export async function getAllMilestones(projectDir) {
  const [roadmapData, archived] = await Promise.all([
    getRoadmapData(projectDir),
    listArchivedMilestones(projectDir)
  ]);

  return {
    active: roadmapData.milestones || [],
    archived
  };
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
