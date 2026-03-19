'use strict';

const fs = require('fs');
const path = require('path');

const MAX_SNAPSHOTS = 10;

/**
 * Parse YAML frontmatter and body from snapshot file content.
 */
function parseSnapshotFile(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, body: content };

  const frontmatter = {};
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Parse numbers
      if (/^\d+$/.test(val)) {
        frontmatter[key] = parseInt(val, 10);
      } else {
        frontmatter[key] = val;
      }
    }
  }

  return { frontmatter, body: fmMatch[2] };
}

/**
 * Parse section content from markdown body.
 */
function parseSections(body) {
  const sections = {};
  const sectionRegex = /^## (.+)$/gm;
  const matches = [];
  let match;

  while ((match = sectionRegex.exec(body)) !== null) {
    matches.push({ title: match[1], index: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].title.length - 3 : body.length;
    const content = body.slice(start, end).trim();
    const items = content.split(/\r?\n/)
      .filter(l => l.startsWith('- '))
      .map(l => l.slice(2).trim());
    sections[matches[i].title] = items.length > 0 ? items : content;
  }

  return sections;
}

/**
 * Prune snapshots directory to keep only the newest MAX_SNAPSHOTS files.
 */
function pruneSnapshots(snapDir) {
  let files;
  try {
    files = fs.readdirSync(snapDir)
      .filter(f => f.endsWith('-snapshot.md'))
      .sort();
  } catch (_e) {
    return;
  }

  while (files.length > MAX_SNAPSHOTS) {
    const oldest = files.shift();
    try {
      fs.unlinkSync(path.join(snapDir, oldest));
    } catch (_e) { /* ignore */ }
  }
}

/**
 * Write a mental model snapshot to .planning/sessions/snapshots/.
 * @param {string} planningDir - Path to .planning directory
 * @param {object} context - Snapshot context
 */
function writeSnapshot(planningDir, context) {
  const snapDir = path.join(planningDir, 'sessions', 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString();
  // Replace colons with hyphens for Windows compat in filename
  const fileTs = timestamp.replace(/:/g, '-').replace(/\.\d+Z$/, '');
  const fileName = `${fileTs}-snapshot.md`;

  const filesWorkingOn = context.files_working_on || [];
  const pendingDecisions = context.pending_decisions || [];
  const openQuestions = context.open_questions || [];
  const recentCommits = context.recent_commits || [];
  const currentApproach = context.current_approach || '';

  const lines = [
    '---',
    `timestamp: "${timestamp}"`,
    `session_id: "${context.session_id || 'unknown'}"`,
    `files_count: ${filesWorkingOn.length}`,
    '---',
    '',
    '## Working Set',
    ...filesWorkingOn.map(f => `- ${f}`),
    '',
    '## Current Approach',
    currentApproach,
    '',
    '## Pending Decisions',
    ...(pendingDecisions.length > 0 ? pendingDecisions.map(d => `- ${d}`) : ['None']),
    '',
    '## Open Questions',
    ...(openQuestions.length > 0 ? openQuestions.map(q => `- ${q}`) : ['None']),
    '',
    '## Recent Commits',
    ...(recentCommits.length > 0 ? recentCommits.map(c => `- ${c}`) : ['None']),
    '',
  ];

  fs.writeFileSync(path.join(snapDir, fileName), lines.join('\n'));

  // Prune to max snapshots
  pruneSnapshots(snapDir);
}

/**
 * Load the most recent snapshot from .planning/sessions/snapshots/.
 * @param {string} planningDir - Path to .planning directory
 * @returns {object|null} Snapshot data or null
 */
function loadLatestSnapshot(planningDir, options = {}) {
  const snapDir = path.join(planningDir, 'sessions', 'snapshots');
  if (!fs.existsSync(snapDir)) return null;

  let files;
  try {
    files = fs.readdirSync(snapDir)
      .filter(f => f.endsWith('-snapshot.md'))
      .sort();
  } catch (_e) {
    return null;
  }

  if (files.length === 0) return null;

  const latestFile = files[files.length - 1];
  const content = fs.readFileSync(path.join(snapDir, latestFile), 'utf8');
  const { frontmatter, body } = parseSnapshotFile(content);

  // Staleness check: return null if snapshot exceeds maxAgeHours
  if (options.maxAgeHours != null && frontmatter.timestamp) {
    const ageHours = (Date.now() - new Date(frontmatter.timestamp).getTime()) / 3600000;
    if (ageHours > options.maxAgeHours) return null;
  }

  const sections = parseSections(body);

  return {
    timestamp: frontmatter.timestamp || null,
    session_id: frontmatter.session_id || null,
    files_working_on: Array.isArray(sections['Working Set']) ? sections['Working Set'] : [],
    current_approach: typeof sections['Current Approach'] === 'string' ? sections['Current Approach'] : '',
    pending_decisions: Array.isArray(sections['Pending Decisions']) ? sections['Pending Decisions'].filter(d => d !== 'None') : [],
    open_questions: Array.isArray(sections['Open Questions']) ? sections['Open Questions'].filter(q => q !== 'None') : [],
    recent_commits: Array.isArray(sections['Recent Commits']) ? sections['Recent Commits'].filter(c => c !== 'None') : [],
  };
}

/**
 * Format a snapshot into a concise briefing text.
 * @param {object|null} snapshot - Output from loadLatestSnapshot
 * @returns {string} Briefing text, capped at 1200 chars
 */
function formatSnapshotBriefing(snapshot) {
  if (!snapshot) return '';

  const lines = [];

  // Relative time
  let timeAgo = '';
  if (snapshot.timestamp) {
    const diffMs = Date.now() - new Date(snapshot.timestamp).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) {
      timeAgo = `${diffMin}m ago`;
    } else if (diffMin < 1440) {
      timeAgo = `${Math.floor(diffMin / 60)}h ago`;
    } else {
      timeAgo = `${Math.floor(diffMin / 1440)}d ago`;
    }
  }

  lines.push(`Last session${timeAgo ? ` (${timeAgo})` : ''}:`);

  const files = snapshot.files_working_on || [];
  if (files.length > 0) {
    const shown = files.slice(0, 3).join(', ');
    const suffix = files.length > 3 ? ` (+${files.length - 3} more)` : '';
    lines.push(`- Working on: ${shown}${suffix} (${files.length} files)`);
  }

  if (snapshot.current_approach) {
    const approach = snapshot.current_approach.length > 100
      ? snapshot.current_approach.slice(0, 100) + '...'
      : snapshot.current_approach;
    lines.push(`- Approach: ${approach}`);
  }

  const decisions = snapshot.pending_decisions || [];
  const questions = snapshot.open_questions || [];
  if (decisions.length > 0 || questions.length > 0) {
    lines.push(`- Pending: ${decisions.length} decisions, ${questions.length} open questions`);
  }

  let result = lines.join('\n');
  if (result.length > 1200) {
    result = result.slice(0, 1197) + '...';
  }

  return result;
}

module.exports = { writeSnapshot, loadLatestSnapshot, formatSnapshotBriefing };
