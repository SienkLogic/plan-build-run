import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

/**
 * List all notes from .planning/notes/*.md, sorted by date descending.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<Array<{filename: string, title: string, date: string|null, promoted: boolean, html: string}>>}
 */
export async function listNotes(projectDir) {
  const notesDir = join(projectDir, '.planning', 'notes');

  let entries;
  try {
    entries = await readdir(notesDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const mdFiles = entries.filter(f => f.endsWith('.md')).sort().reverse();

  const results = await Promise.allSettled(
    mdFiles.map(f => readMarkdownFile(join(notesDir, f)))
  );

  const notes = [];
  for (let i = 0; i < mdFiles.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled') continue;

    const { frontmatter, html } = result.value;
    const filename = mdFiles[i];

    // Derive title from filename: strip date prefix and extension, title-case
    const slug = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    notes.push({
      filename,
      title,
      date: frontmatter.date || null,
      promoted: !!frontmatter.promoted,
      html
    });
  }

  return notes;
}

export async function getNoteBySlug(projectDir, slug) {
  const notesDir = join(projectDir, '.planning', 'notes');
  let entries;
  try {
    entries = await readdir(notesDir);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const filename = entries.find(f => f.endsWith('.md') && f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '') === slug);
  if (!filename) return null;
  const { frontmatter, html } = await readMarkdownFile(join(notesDir, filename));
  const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { filename, slug, title, date: frontmatter.date || null, promoted: !!frontmatter.promoted, html };
}
