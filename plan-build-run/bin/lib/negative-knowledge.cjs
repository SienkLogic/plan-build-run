/**
 * Negative Knowledge — tracking, querying, and resolving failure entries
 *
 * Stores entries as .planning/negative-knowledge/{YYYY-MM-DD}-{slug}.md
 * Each entry has YAML frontmatter (date, title, category, files_involved, phase, status)
 * and body sections: What Was Tried, Why It Failed, What Worked Instead.
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter, spliceFrontmatter } = require('./frontmatter.cjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nkDir(planningDir) {
  return path.join(planningDir, 'negative-knowledge');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Core functions ──────────────────────────────────────────────────────────

/**
 * Record a failure entry.
 * @param {string} planningDir - Path to .planning directory
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.category - One of: verification-gap, build-failure, plan-revision, debug-finding
 * @param {string[]} opts.filesInvolved
 * @param {string} opts.whatTried
 * @param {string} opts.whyFailed
 * @param {string} [opts.whatWorked='']
 * @param {string} [opts.phase='']
 * @returns {{ path: string, slug: string }}
 */
function recordFailure(planningDir, opts) {
  const dir = nkDir(planningDir);
  fs.mkdirSync(dir, { recursive: true });

  const date = todayISO();
  const slug = slugify(opts.title);
  const filename = `${date}-${slug}.md`;
  const filePath = path.join(dir, filename);

  // Build YAML frontmatter
  const filesYaml = opts.filesInvolved
    .map(f => `  - ${f}`)
    .join('\n');

  const content = `---
date: ${date}
title: ${opts.title}
category: ${opts.category}
files_involved:
${filesYaml}
phase: ${opts.phase || ''}
status: active
---

## What Was Tried

${opts.whatTried}

## Why It Failed

${opts.whyFailed}

## What Worked Instead

${opts.whatWorked || 'Pending resolution.'}
`;

  fs.writeFileSync(filePath, content, 'utf8');
  return { path: filePath, slug };
}

/**
 * Query entries by file path overlap.
 * @param {string} planningDir
 * @param {string[]} filePaths - Paths to match against files_involved
 * @returns {object[]} Matching entries sorted by date descending
 */
function queryByFiles(planningDir, filePaths) {
  const entries = readAllEntries(planningDir);
  const fileSet = new Set(filePaths);

  return entries
    .filter(entry => {
      const involved = entry.files_involved || [];
      return involved.some(f => fileSet.has(f));
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * List failure entries with optional filters.
 * @param {string} planningDir
 * @param {object} filters
 * @param {string} [filters.category]
 * @param {string} [filters.phase]
 * @param {string} [filters.status]
 * @returns {object[]} Matching entries sorted by date descending
 */
function listFailures(planningDir, filters) {
  let entries = readAllEntries(planningDir);

  if (filters.category) {
    entries = entries.filter(e => e.category === filters.category);
  }
  if (filters.phase) {
    entries = entries.filter(e => e.phase === filters.phase);
  }
  if (filters.status) {
    entries = entries.filter(e => e.status === filters.status);
  }

  return entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * Mark an entry as resolved by slug.
 * @param {string} planningDir
 * @param {string} slug
 */
function resolveEntry(planningDir, slug) {
  const dir = nkDir(planningDir);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    if (file.includes(slug)) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      // Replace status: active with status: resolved in frontmatter
      const fm = extractFrontmatter(content);
      fm.status = 'resolved';
      const newContent = spliceFrontmatter(content, fm);
      fs.writeFileSync(filePath, newContent, 'utf8');
      return;
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Read all entries from the negative-knowledge directory.
 * @param {string} planningDir
 * @returns {object[]} Array of parsed entry objects
 */
function readAllEntries(planningDir) {
  const dir = nkDir(planningDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const entries = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = extractFrontmatter(content);

    // Parse files_involved — extractFrontmatter may return it as array or object
    let filesInvolved = fm.files_involved || [];
    if (!Array.isArray(filesInvolved)) {
      filesInvolved = Object.values(filesInvolved);
    }

    entries.push({
      slug: file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, ''),
      date: fm.date || '',
      title: fm.title || '',
      category: fm.category || '',
      files_involved: filesInvolved,
      phase: fm.phase || '',
      status: fm.status || 'active',
      path: filePath,
    });
  }

  return entries;
}

module.exports = { recordFailure, queryByFiles, listFailures, resolveEntry };
