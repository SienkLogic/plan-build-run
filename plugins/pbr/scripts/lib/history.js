/**
 * lib/history.js — HISTORY.md operations for Plan-Build-Run tools.
 *
 * Handles appending and loading project history records.
 */

const fs = require('fs');
const path = require('path');

/**
 * Append a record to HISTORY.md. Creates the file if it doesn't exist.
 * Each entry is a markdown section appended at the end.
 *
 * @param {object} entry - { type: 'milestone'|'phase'|'metric', title: string, body: string }
 * @param {string} [dir] - Path to .planning directory
 * @returns {{success: boolean, error?: string}}
 */
function historyAppend(entry, dir) {
  const planningDir = dir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const historyPath = path.join(planningDir, 'HISTORY.md');
  const timestamp = new Date().toISOString().slice(0, 10);

  let header = '';
  if (!fs.existsSync(historyPath)) {
    header = '# Project History\n\nCompleted milestones and phase records. This file is append-only.\n\n';
  }

  const section = `${header}## ${entry.type === 'milestone' ? 'Milestone' : 'Phase'}: ${entry.title}\n_Completed: ${timestamp}_\n\n${entry.body.trim()}\n\n---\n\n`;

  try {
    fs.appendFileSync(historyPath, section, 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Load HISTORY.md and parse it into structured records.
 * Returns null if HISTORY.md doesn't exist.
 *
 * @param {string} [dir] - Path to .planning directory
 * @returns {object|null} { records: [{type, title, date, body}], line_count }
 */
function historyLoad(dir) {
  const planningDir = dir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const historyPath = path.join(planningDir, 'HISTORY.md');
  if (!fs.existsSync(historyPath)) return null;

  const content = fs.readFileSync(historyPath, 'utf8');
  const records = [];
  const sectionRegex = /^## (Milestone|Phase): (.+)\n_Completed: (\d{4}-\d{2}-\d{2})_\n\n([\s\S]*?)(?=\n---|\s*$)/gm;

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    records.push({
      type: match[1].toLowerCase(),
      title: match[2].trim(),
      date: match[3],
      body: match[4].trim()
    });
  }

  return {
    records,
    line_count: content.split('\n').length
  };
}

module.exports = {
  historyAppend,
  historyLoad
};
