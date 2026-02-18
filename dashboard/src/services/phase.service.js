import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

/**
 * Format a phase directory name into a human-readable title.
 * Strips the numeric prefix and title-cases each word.
 *
 * @param {string} dirName - Directory name like "04-dashboard-landing-page"
 * @returns {string} Formatted name like "Dashboard Landing Page"
 */
function formatPhaseName(dirName) {
  const parts = dirName.split('-');
  // Remove the numeric prefix (first element)
  parts.shift();
  return parts
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Parse the "Task Results" markdown table from a SUMMARY.md body.
 * Returns an array of commit objects extracted from the table rows.
 *
 * Expected table format (produced by pbr executor):
 * | Task | Status | Commit | Files | Verify |
 * |------|--------|--------|-------|--------|
 * | 05-01-T1: Create phase.service.js | done | 2a52581 | 1 | passed |
 *
 * @param {string} rawContent - The markdown body content (after frontmatter)
 * @returns {Array<{task: string, status: string, hash: string, files: number, verify: string}>}
 */
export function parseTaskResultsTable(rawContent) {
  if (!rawContent) return [];

  // Find the Task Results section. The table may be followed by another section,
  // a blank line, or EOF. Use a non-greedy match to capture just the table block.
  const sectionRegex = /## Task Results\s*\n([\s\S]*?)(?=\n##\s|\n\n\n|$)/;
  const sectionMatch = rawContent.match(sectionRegex);
  if (!sectionMatch) return [];

  const tableBlock = sectionMatch[1].trim();
  const lines = tableBlock.split('\n');

  // Need at least header row + separator row + 1 data row = 3 lines
  if (lines.length < 3) return [];

  // Skip header row (index 0) and separator row (index 1)
  const dataRows = lines.slice(2);
  const commits = [];

  for (const row of dataRows) {
    // Split by pipe, trim, filter out empty strings from leading/trailing pipes
    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 5) continue;

    const hash = cells[2];
    // Skip rows where commit is empty, a dash, or not a hex string
    if (!hash || hash === '-' || hash === '' || !/^[0-9a-f]{5,40}$/i.test(hash)) continue;

    commits.push({
      task: cells[0],
      status: cells[1],
      hash: hash,
      files: parseInt(cells[3], 10) || 0,
      verify: cells[4]
    });
  }

  return commits;
}

/**
 * Get detailed information about a specific phase, including all plans,
 * their summaries, and verification status.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {string} phaseId - Two-digit phase identifier (e.g., "04")
 * @returns {Promise<{phaseId: string, phaseName: string, phaseDir: string|null, plans: Array, verification: object|null}>}
 */
export async function getPhaseDetail(projectDir, phaseId) {
  const emptyState = { phaseId, phaseName: 'Unknown', phaseDir: null, plans: [], verification: null };
  const phasesDir = join(projectDir, '.planning', 'phases');

  let phaseDirEntries;
  try {
    phaseDirEntries = await readdir(phasesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return emptyState;
    }
    throw error;
  }

  // Find the directory matching this phaseId (prefer longest name to handle stale renames)
  const phaseDir = phaseDirEntries
    .filter(entry => entry.isDirectory() && entry.name.startsWith(`${phaseId}-`))
    .sort((a, b) => b.name.length - a.name.length)
    [0];

  if (!phaseDir) {
    return emptyState;
  }

  const phaseName = formatPhaseName(phaseDir.name);
  const phaseFullPath = join(phasesDir, phaseDir.name);

  // Read files in the phase directory
  const phaseFiles = await readdir(phaseFullPath);

  // Filter and sort PLAN.md files
  const planRegex = /^\d{2}-\d{2}-PLAN\.md$/;
  const planIdRegex = /^(\d{2}-\d{2})-PLAN\.md$/;
  const planFiles = phaseFiles
    .filter(f => planRegex.test(f))
    .sort();

  // Build summary paths and read them in parallel
  const summaryPaths = planFiles.map(planFile => {
    const match = planFile.match(planIdRegex);
    const planId = match[1];
    return { planId, planFile, summaryPath: join(phaseFullPath, `SUMMARY-${planId}.md`) };
  });

  const summaryResults = await Promise.allSettled(
    summaryPaths.map(({ summaryPath }) => readMarkdownFile(summaryPath))
  );

  // Map results to plan objects
  const plans = summaryPaths.map(({ planId, planFile }, index) => {
    const result = summaryResults[index];
    if (result.status === 'fulfilled') {
      return {
        planId,
        planFile,
        summary: result.value.frontmatter,
        content: result.value.html,
        commits: parseTaskResultsTable(result.value.rawContent)
      };
    }
    if (result.reason && result.reason.code === 'ENOENT') {
      return { planId, planFile, summary: null, content: null, commits: [] };
    }
    // Unexpected error -- re-throw
    throw result.reason;
  });

  // Read VERIFICATION.md
  let verification = null;
  try {
    const verDoc = await readMarkdownFile(join(phaseFullPath, 'VERIFICATION.md'));
    verification = verDoc.frontmatter;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // ENOENT -> verification stays null
  }

  return {
    phaseId,
    phaseName,
    phaseDir: phaseDir.name,
    plans,
    verification
  };
}
