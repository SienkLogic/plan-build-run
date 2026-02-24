import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

/**
 * Parse requirement IDs and text from REQUIREMENTS.md markdown body.
 * Looks for lines matching: - **ID**: description text
 * Groups them by the nearest ## heading (section).
 *
 * @param {string} rawContent - Raw markdown string
 * @returns {Array<{sectionTitle: string, requirements: Array<{id: string, text: string, planRefs: string[]}>}>}
 */
function parseRequirementSections(rawContent) {
  const sections = [];
  let currentSection = null;

  for (const line of rawContent.split('\n')) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      currentSection = { sectionTitle: headingMatch[1].trim(), requirements: [] };
      sections.push(currentSection);
      continue;
    }
    // Match: - **P02-G1**: Some text  OR  - **P02-G1** Some text
    const reqMatch = line.match(/^[-*]\s+\*\*([A-Z][A-Z0-9]*-[A-Z0-9]+)\*\*[:\s]+(.+)/);
    if (reqMatch && currentSection) {
      currentSection.requirements.push({
        id: reqMatch[1].trim(),
        text: reqMatch[2].trim(),
        planRefs: []
      });
    }
  }

  return sections.filter(s => s.requirements.length > 0);
}

/**
 * Scan all PLAN-*.md files in all phase directories and collect requirement_ids
 * from their frontmatter. Returns a Map<requirementId, planId[]>.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Map<string, string[]>>}
 */
async function buildRequirementIndex(projectDir) {
  const phasesDir = join(projectDir, '.planning', 'phases');
  const index = new Map();

  let phaseDirs;
  try {
    phaseDirs = await readdir(phasesDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return index;
    throw err;
  }

  const planReadTasks = [];
  for (const entry of phaseDirs) {
    if (!entry.isDirectory()) continue;
    const phaseFullPath = join(phasesDir, entry.name);
    let phaseFiles;
    try {
      phaseFiles = await readdir(phaseFullPath);
    } catch { continue; }

    for (const filename of phaseFiles) {
      if (!/^PLAN-\d{2}\.md$/.test(filename)) continue;
      planReadTasks.push(
        readMarkdownFile(join(phaseFullPath, filename))
          .then(({ frontmatter }) => {
            const ids = frontmatter.requirement_ids;
            const planId = frontmatter.plan;
            if (!Array.isArray(ids) || !planId) return;
            for (const id of ids) {
              if (!index.has(id)) index.set(id, []);
              index.get(id).push(planId);
            }
          })
          .catch(() => { /* skip unreadable plan files */ })
      );
    }
  }

  await Promise.all(planReadTasks);
  return index;
}

/**
 * Build the full requirements traceability dataset:
 * - Parses REQUIREMENTS.md into sections + requirements
 * - Cross-references each requirement ID against plan frontmatter
 * - Returns coverage counts and per-requirement plan references
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{sections: Array, totalCount: number, coveredCount: number}>}
 */
export async function getRequirementsData(projectDir) {
  const reqPath = join(projectDir, '.planning', 'REQUIREMENTS.md');

  let rawContent;
  try {
    const parsed = await readMarkdownFile(reqPath);
    rawContent = parsed.rawContent || '';
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { sections: [], totalCount: 0, coveredCount: 0 };
    }
    throw err;
  }

  const [sections, reqIndex] = await Promise.all([
    Promise.resolve(parseRequirementSections(rawContent)),
    buildRequirementIndex(projectDir)
  ]);

  let totalCount = 0;
  let coveredCount = 0;

  for (const section of sections) {
    for (const req of section.requirements) {
      const refs = reqIndex.get(req.id) || [];
      req.planRefs = refs;
      req.covered = refs.length > 0;
      totalCount++;
      if (req.covered) coveredCount++;
    }
  }

  return { sections, totalCount, coveredCount };
}
