import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMarkdownFile } from '../repositories/planning.repository.js';

export async function listQuickTasks(projectDir) {
  const quickDir = join(projectDir, '.planning', 'quick');
  let entries;
  try {
    entries = await readdir(quickDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  const tasks = [];
  for (const dirName of dirs) {
    const match = dirName.match(/^(\d{3})-(.+)$/);
    if (!match) continue;
    const [, id, slug] = match;
    const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    let status = 'in-progress';
    try {
      const summaryPath = join(quickDir, dirName, 'SUMMARY.md');
      const { frontmatter } = await readMarkdownFile(summaryPath);
      if (frontmatter.status) status = frontmatter.status;
    } catch { /* No SUMMARY.md yet */ }
    tasks.push({ id, slug, dirName, title, status });
  }
  return tasks;
}

export async function getQuickTask(projectDir, id) {
  const quickDir = join(projectDir, '.planning', 'quick');
  let entries;
  try {
    entries = await readdir(quickDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const dirEntry = entries.filter(e => e.isDirectory()).find(e => e.name.startsWith(id + '-'));
  if (!dirEntry) return null;

  const taskDir = join(quickDir, dirEntry.name);
  const match = dirEntry.name.match(/^(\d{3})-(.+)$/);
  const slug = match ? match[2] : dirEntry.name;
  const title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let planHtml = null, summaryHtml = null, summaryFrontmatter = {};
  try {
    const plan = await readMarkdownFile(join(taskDir, 'PLAN.md'));
    planHtml = plan.html;
  } catch { /* missing */ }
  try {
    const summary = await readMarkdownFile(join(taskDir, 'SUMMARY.md'));
    summaryHtml = summary.html;
    summaryFrontmatter = summary.frontmatter;
  } catch { /* missing */ }

  return { id, slug, dirName: dirEntry.name, title, status: summaryFrontmatter.status || 'in-progress', planHtml, summaryHtml };
}
