import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';
import { getRoadmapData } from './roadmap.service.js';

/**
 * Scan .planning/milestones/ for archived milestone files.
 * Groups files by version prefix (e.g., v1.0-ROADMAP.md, v1.0-STATS.md).
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array<{version: string, name: string, date: string, duration: string, files: string[]}>>}
 */
export async function listArchivedMilestones(projectDir) {
  const milestonesDir = join(projectDir, '.planning', 'milestones');

  let entries;
  try {
    entries = await readdir(milestonesDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  // Group files by version prefix: v1.0-ROADMAP.md -> version "1.0"
  const versionMap = new Map();
  const versionPattern = /^v([\w.-]+)-(\w+)\.md$/;

  for (const file of entries) {
    const match = file.match(versionPattern);
    if (!match) continue;

    const version = match[1];
    if (!versionMap.has(version)) {
      versionMap.set(version, { version, name: '', date: '', duration: '', files: [] });
    }
    versionMap.get(version).files.push(file);
  }

  // Try to parse STATS.md for each version to get name/date/duration
  for (const [version, milestone] of versionMap) {
    const statsFile = `v${version}-STATS.md`;
    if (milestone.files.includes(statsFile)) {
      try {
        const { frontmatter } = await readMarkdownFile(join(milestonesDir, statsFile));
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

  // Sort by version descending (newest first)
  return [...versionMap.values()].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
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
    const filePath = join(milestonesDir, `v${version}-${type}.md`);
    try {
      const result = await readMarkdownFile(filePath);
      sections.push({ type, frontmatter: result.frontmatter, html: result.html });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // File doesn't exist for this type — skip
    }
  }

  return { version, sections };
}
