import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

/**
 * List all research docs from .planning/research/*.md, sorted by filename descending.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array>}
 */
export async function listResearchDocs(projectDir) {
  const dir = join(projectDir, '.planning', 'research');
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const mdFiles = entries.filter(f => f.endsWith('.md')).sort().reverse();
  const results = await Promise.allSettled(
    mdFiles.map(f => readMarkdownFile(join(dir, f)))
  );
  const docs = [];
  for (let i = 0; i < mdFiles.length; i++) {
    if (results[i].status !== 'fulfilled') continue;
    const { frontmatter, html } = results[i].value;
    const filename = mdFiles[i];
    const slug = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    docs.push({
      filename,
      slug,
      title,
      topic: frontmatter.topic || null,
      date: frontmatter.research_date
        ? (frontmatter.research_date instanceof Date
          ? frontmatter.research_date.toISOString().slice(0, 10)
          : String(frontmatter.research_date))
        : null,
      confidence: frontmatter.confidence || null,
      coverage: frontmatter.coverage || null,
      html
    });
  }
  return docs;
}

/**
 * List all codebase docs from .planning/codebase/*.md, sorted by filename descending.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array>}
 */
export async function listCodebaseDocs(projectDir) {
  const dir = join(projectDir, '.planning', 'codebase');
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const mdFiles = entries.filter(f => f.endsWith('.md')).sort().reverse();
  const results = await Promise.allSettled(
    mdFiles.map(f => readMarkdownFile(join(dir, f)))
  );
  const docs = [];
  for (let i = 0; i < mdFiles.length; i++) {
    if (results[i].status !== 'fulfilled') continue;
    const { frontmatter, html } = results[i].value;
    const filename = mdFiles[i];
    const slug = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    docs.push({
      filename,
      slug,
      title,
      date: frontmatter.scan_date
        ? (frontmatter.scan_date instanceof Date
          ? frontmatter.scan_date.toISOString().slice(0, 10)
          : String(frontmatter.scan_date))
        : null,
      html
    });
  }
  return docs;
}

/**
 * Get a single research or codebase doc by slug.
 * Searches research/ first, then codebase/.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @param {string} slug - Slug derived from filename (without date prefix and .md extension)
 * @returns {Promise<object|null>}
 */
export async function getResearchDocBySlug(projectDir, slug) {
  for (const subdir of ['research', 'codebase']) {
    const dir = join(projectDir, '.planning', subdir);
    let entries;
    try {
      entries = await readdir(dir);
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    const filename = entries.find(
      f => f.endsWith('.md') &&
           f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '') === slug
    );
    if (!filename) continue;
    const { frontmatter, html } = await readMarkdownFile(join(dir, filename));
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      filename,
      slug,
      title,
      topic: frontmatter.topic || null,
      date: frontmatter.research_date
        ? (frontmatter.research_date instanceof Date
          ? frontmatter.research_date.toISOString().slice(0, 10)
          : String(frontmatter.research_date))
        : frontmatter.scan_date
          ? (frontmatter.scan_date instanceof Date
            ? frontmatter.scan_date.toISOString().slice(0, 10)
            : String(frontmatter.scan_date))
          : null,
      confidence: frontmatter.confidence || null,
      sources_checked: frontmatter.sources_checked || null,
      coverage: frontmatter.coverage || null,
      section: subdir,
      html
    };
  }
  return null;
}
