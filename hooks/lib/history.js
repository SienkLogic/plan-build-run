/**
 * lib/history.js — History operations for Plan-Build-Run tools.
 *
 * Handles appending and loading project history records.
 * History is stored in STATE.md under a ## History section.
 * Backwards compat: reads from legacy HISTORY.md if STATE.md has no ## History.
 */

const fs = require('fs');
const path = require('path');

/**
 * Append a history record to STATE.md ## History section.
 * Falls back to legacy HISTORY.md if STATE.md does not exist.
 * Creates the ## History section in STATE.md if it doesn't exist.
 *
 * @param {object} entry - { type: 'milestone'|'phase'|'metric', title: string, body: string }
 * @param {string} [dir] - Path to .planning directory
 * @returns {{success: boolean, error?: string, target?: string}}
 */
function historyAppend(entry, dir) {
  const planningDir = dir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const statePath = path.join(planningDir, 'STATE.md');
  const legacyPath = path.join(planningDir, 'HISTORY.md');
  const timestamp = new Date().toISOString().slice(0, 10);

  const section = `### ${entry.type === 'milestone' ? 'Milestone' : 'Phase'}: ${entry.title}\n_Completed: ${timestamp}_\n\n${entry.body.trim()}\n\n---\n\n`;

  // Primary target: STATE.md ## History section
  if (fs.existsSync(statePath)) {
    try {
      let content = fs.readFileSync(statePath, 'utf8');

      if (content.includes('## History')) {
        // Append after the ## History heading (at the end of the section)
        // Find the ## History line and append after all existing history content
        const historyIdx = content.indexOf('## History');
        // Find the next ## heading after ## History (or end of file)
        const afterHistory = content.slice(historyIdx + '## History'.length);
        const nextHeadingMatch = afterHistory.match(/\n## [^#]/);
        const insertPos = nextHeadingMatch
          ? historyIdx + '## History'.length + nextHeadingMatch.index
          : content.length;

        content = content.slice(0, insertPos).trimEnd() + '\n\n' + section + content.slice(insertPos);
      } else {
        // Add ## History section at end of STATE.md
        content = content.trimEnd() + '\n\n## History\n\n' + section;
      }

      fs.writeFileSync(statePath, content, 'utf8');
      return { success: true, target: 'STATE.md' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Fallback: legacy HISTORY.md (if STATE.md doesn't exist)
  let header = '';
  if (!fs.existsSync(legacyPath)) {
    header = '# Project History\n\nCompleted milestones and phase records. This file is append-only.\n\n';
  }

  const legacySection = `${header}## ${entry.type === 'milestone' ? 'Milestone' : 'Phase'}: ${entry.title}\n_Completed: ${timestamp}_\n\n${entry.body.trim()}\n\n---\n\n`;

  try {
    fs.appendFileSync(legacyPath, legacySection, 'utf8');
    return { success: true, target: 'HISTORY.md (legacy)' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Load history records. Reads from STATE.md ## History section first,
 * falls back to legacy HISTORY.md for backwards compatibility.
 *
 * @param {string} [dir] - Path to .planning directory
 * @returns {object|null} { records: [{type, title, date, body}], line_count, source }
 */
function historyLoad(dir) {
  const planningDir = dir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const statePath = path.join(planningDir, 'STATE.md');
  const legacyPath = path.join(planningDir, 'HISTORY.md');

  // Try STATE.md ## History section first
  if (fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    if (stateContent.includes('## History')) {
      const historyIdx = stateContent.indexOf('## History');
      const afterHistory = stateContent.slice(historyIdx);
      // Extract until next ## heading (not ###)
      const nextHeadingMatch = afterHistory.slice('## History'.length).match(/\n## [^#]/);
      const historyContent = nextHeadingMatch
        ? afterHistory.slice(0, '## History'.length + nextHeadingMatch.index)
        : afterHistory;

      const records = parseHistoryRecords(historyContent);
      if (records.length > 0) {
        return {
          records,
          line_count: historyContent.split('\n').length,
          source: 'STATE.md'
        };
      }
    }
  }

  // Fallback: legacy HISTORY.md
  if (fs.existsSync(legacyPath)) {
    const content = fs.readFileSync(legacyPath, 'utf8');
    const records = parseHistoryRecords(content);
    return {
      records,
      line_count: content.split('\n').length,
      source: 'HISTORY.md (legacy)'
    };
  }

  return null;
}

/**
 * Parse history records from markdown content.
 * Supports both ## and ### level headings for milestone/phase records.
 *
 * @param {string} content - Markdown content containing history records
 * @returns {Array<{type: string, title: string, date: string, body: string}>}
 */
function parseHistoryRecords(content) {
  const records = [];
  const sectionRegex = /^#{2,3} (Milestone|Phase): (.+)\n_Completed: (\d{4}-\d{2}-\d{2})_\n\n([\s\S]*?)(?=\n---|\s*$)/gm;

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    records.push({
      type: match[1].toLowerCase(),
      title: match[2].trim(),
      date: match[3],
      body: match[4].trim()
    });
  }

  return records;
}

module.exports = {
  historyAppend,
  historyLoad
};
