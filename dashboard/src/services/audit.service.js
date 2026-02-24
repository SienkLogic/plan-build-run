import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

export async function listAuditReports(projectDir) {
  const auditsDir = join(projectDir, '.planning', 'audits');
  let entries;
  try {
    entries = await readdir(auditsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const mdFiles = entries.filter(f => f.endsWith('.md')).sort().reverse();
  const reports = [];
  for (const filename of mdFiles) {
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
    const date = dateMatch ? dateMatch[1] : null;
    const slug = dateMatch ? dateMatch[2] : filename.replace(/\.md$/, '');
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    reports.push({ filename, date, slug, title });
  }
  return reports;
}

export async function getAuditReport(projectDir, filename) {
  if (!/^[\w.-]+\.md$/.test(filename)) return null;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null;

  const auditsDir = join(projectDir, '.planning', 'audits');
  try {
    const { frontmatter, html } = await readMarkdownFile(join(auditsDir, filename));
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
    const date = dateMatch ? dateMatch[1] : null;
    const slug = dateMatch ? dateMatch[2] : filename.replace(/\.md$/, '');
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { filename, date, slug, title, frontmatter, html };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
