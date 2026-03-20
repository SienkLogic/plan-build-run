/**
 * Decision Journal — CRUD operations for decision records
 *
 * Decisions are stored as individual markdown files in .planning/decisions/{YYYY-MM-DD}-{slug}.md
 * Each file has YAML frontmatter and structured body sections.
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter, reconstructFrontmatter } = require('./frontmatter');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decisionsDir(planningDir) {
  return path.join(planningDir, 'decisions');
}

function slugify(text) {
  if (!text || !text.trim()) return 'untitled';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

// ─── CRUD Functions ───────────────────────────────────────────────────────────

function recordDecision(planningDir, opts) {
  const dir = decisionsDir(planningDir);
  fs.mkdirSync(dir, { recursive: true });

  const {
    decision,
    rationale = '',
    alternatives = [],
    context = '',
    agent = 'user',
    phase = '',
    tags = [],
    consequences = '',
  } = opts;

  const slug = slugify(decision);
  const dateStr = new Date().toISOString().split('T')[0];
  let filename = `${dateStr}-${slug}.md`;

  // Handle duplicates
  let counter = 2;
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${dateStr}-${slug}-${counter}.md`;
    counter++;
  }

  // Build frontmatter
  const fm = {
    date: dateStr,
    decision,
    status: 'active',
    agent,
    phase,
    tags,
  };
  const fmStr = reconstructFrontmatter(fm);

  // Build body
  const altText = alternatives.length > 0
    ? alternatives.map(a => `- ${a}`).join('\n')
    : 'None documented.';

  const body = `## Context

${context || 'No context provided.'}

## Decision

${rationale || 'No rationale provided.'}

## Alternatives Considered

${altText}

## Consequences

${consequences || 'To be determined.'}
`;

  const content = `---\n${fmStr}\n---\n\n${body}`;
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');

  return { path: filename, slug };
}

function listDecisions(planningDir, filters) {
  const dir = decisionsDir(planningDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const decisions = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const fm = extractFrontmatter(content);

    // Extract slug from filename: {date}-{slug}.md
    const slugMatch = file.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
    const slug = slugMatch ? slugMatch[1] : file.replace('.md', '');

    decisions.push({
      slug,
      date: fm.date || '',
      decision: fm.decision || '',
      status: fm.status || 'active',
      agent: fm.agent || 'user',
      phase: fm.phase || '',
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      path: file,
    });
  }

  // Apply filters
  let filtered = decisions;
  if (filters) {
    if (filters.status) {
      filtered = filtered.filter(d => d.status === filters.status);
    }
    if (filters.phase) {
      filtered = filtered.filter(d => d.phase === filters.phase);
    }
    if (filters.tag) {
      filtered = filtered.filter(d => d.tags.includes(filters.tag));
    }
  }

  // Sort by date descending
  filtered.sort((a, b) => b.date.localeCompare(a.date));

  return filtered;
}

function getDecision(planningDir, slug) {
  const dir = decisionsDir(planningDir);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const match = files.find(f => {
    // Match *-{slug}.md pattern
    const slugMatch = f.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
    return slugMatch && slugMatch[1] === slug;
  });

  if (!match) return null;

  const content = fs.readFileSync(path.join(dir, match), 'utf-8');
  const fm = extractFrontmatter(content);

  // Extract body (everything after frontmatter)
  const bodyMatch = content.match(/^---\n[\s\S]+?\n---\n\n?([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : '';

  return { frontmatter: fm, body, path: match };
}

function supersedeDecision(planningDir, oldSlug, newSlug) {
  const dir = decisionsDir(planningDir);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const match = files.find(f => {
    const slugMatch = f.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
    return slugMatch && slugMatch[1] === oldSlug;
  });

  if (!match) return null;

  const filePath = path.join(dir, match);
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Update status and add superseded_by
  fm.status = 'superseded';
  fm.superseded_by = newSlug;

  const fmStr = reconstructFrontmatter(fm);
  const bodyMatch = content.match(/^---\n[\s\S]+?\n---\n([\s\S]*)$/);
  const bodyPart = bodyMatch ? bodyMatch[1] : '';

  fs.writeFileSync(filePath, `---\n${fmStr}\n---\n${bodyPart}`, 'utf-8');

  return { oldPath: match, newStatus: 'superseded' };
}

module.exports = { recordDecision, listDecisions, getDecision, supersedeDecision, slugify };
