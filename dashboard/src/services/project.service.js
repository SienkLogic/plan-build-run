import { join, resolve, relative } from 'node:path';
import { readMarkdownFile, listPlanningFiles } from '../repositories/planning.repository.js';

/**
 * Get homepage data for the dashboard.
 * Reads .planning/README.md if it exists, returns fallback data if not.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{title: string, projectDir: string, content: string}>}
 */
export async function getHomepage(projectDir) {
  try {
    const readmePath = join(projectDir, '.planning', 'README.md');
    const { frontmatter, html } = await readMarkdownFile(readmePath);

    return {
      title: frontmatter.title || 'PBR Dashboard',
      projectDir,
      content: html
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        title: 'Welcome',
        projectDir,
        content: '<p>No project README found.</p>'
      };
    }
    throw error;
  }
}

/**
 * Read a specific markdown file from within the .planning/ directory.
 * Validates that the resolved path stays within .planning/ to prevent
 * path traversal attacks.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {string} relativePath - Path relative to .planning/ (e.g., 'phases/01/PLAN.md')
 * @returns {Promise<{frontmatter: object, html: string, rawContent: string}>}
 * @throws {Error} If path escapes .planning/ or file not found
 */
export async function getMarkdownFile(projectDir, relativePath) {
  const planningDir = resolve(projectDir, '.planning');
  const filePath = resolve(planningDir, relativePath);

  // Path traversal protection: ensure resolved path is under .planning/
  const rel = relative(planningDir, filePath);
  if (rel.startsWith('..') || resolve(filePath) !== filePath && rel.startsWith('..')) {
    const err = new Error('Path traversal not allowed: path escapes .planning/ directory');
    err.code = 'PATH_TRAVERSAL';
    err.status = 403;
    throw err;
  }

  return readMarkdownFile(filePath);
}
