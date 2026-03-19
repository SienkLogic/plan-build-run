'use strict';

/**
 * lib/auto-cleanup.js — Auto-cleanup for completed phases.
 *
 * Matches pending todos and notes against phase completion context,
 * then closes todos (move to done/) or archives notes (add frontmatter flag).
 * Requires 2+ signal matches before taking action.
 */

const fs = require('fs');
const path = require('path');
const { todoList, todoDone } = require('./todo');
const { parseYamlFrontmatter, atomicWrite } = require('./core');

// Common stop words excluded from keyword matching
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'in', 'on', 'for', 'of', 'and', 'or',
  'is', 'it', 'with', 'by', 'at', 'from', 'as', 'be', 'was', 'are',
  'has', 'had', 'have', 'this', 'that', 'not', 'but', 'if', 'do',
  'no', 'so', 'up', 'out', 'can', 'will', 'all', 'its', 'add', 'use'
]);

/**
 * Tokenize a string into lowercase non-stop-words.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Score how well an item matches the phase completion context.
 *
 * @param {{ title: string, body: string }} item - Todo or note content
 * @param {{ phaseName: string, phaseNum: number|string, keyFiles: string[], commitMessages: string[], summaryDescriptions: string[] }} context
 * @returns {{ score: number, signals: string[] }}
 */
function matchScore(item, context) {
  const signals = [];
  const title = (item.title || '').toLowerCase();
  const body = (item.body || '').toLowerCase();
  const combined = title + ' ' + body;

  // Signal A: Title keyword match (2+ shared non-stop-words with phaseName)
  const titleTokens = tokenize(item.title);
  const phaseTokens = tokenize(context.phaseName);
  let sharedCount = 0;
  for (const word of titleTokens) {
    if (phaseTokens.has(word)) sharedCount++;
  }
  if (sharedCount >= 2) {
    signals.push('title-keyword');
  }

  // Signal B: File path match
  const keyFiles = context.keyFiles || [];
  for (const filePath of keyFiles) {
    if (filePath && combined.includes(filePath.toLowerCase())) {
      signals.push('file-path');
      break;
    }
  }

  // Signal C: Commit message match
  const commitMessages = context.commitMessages || [];
  for (const msg of commitMessages) {
    if (msg && msg.length > 5 && combined.includes(msg.toLowerCase())) {
      signals.push('commit-message');
      break;
    }
  }

  // Signal D: Summary description match
  const summaryDescriptions = context.summaryDescriptions || [];
  for (const desc of summaryDescriptions) {
    if (desc && desc.length > 5 && combined.includes(desc.toLowerCase())) {
      signals.push('summary-description');
      break;
    }
  }

  return { score: signals.length, signals };
}

/**
 * Auto-close pending todos that match the phase completion context.
 * Requires 2+ signals before closing.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {{ phaseName: string, phaseNum: number|string, keyFiles: string[], commitMessages: string[], summaryDescriptions: string[] }} context
 * @returns {{ closed: object[], partial: object[], skipped: number }}
 */
function autoCloseTodos(planningDir, context) {
  const { todos } = todoList(planningDir, { status: 'pending' });
  const closed = [];
  const partial = [];
  let skipped = 0;

  for (const todo of todos) {
    const result = matchScore(
      { title: todo.title, body: todo.body },
      context
    );

    if (result.score >= 2) {
      const doneResult = todoDone(planningDir, todo.number);
      if (doneResult.success) {
        closed.push({
          number: todo.number,
          title: todo.title,
          signals: result.signals,
          score: result.score
        });
      } else {
        // If todoDone failed, treat as partial
        partial.push({
          number: todo.number,
          title: todo.title,
          signals: result.signals,
          score: result.score,
          error: doneResult.error
        });
      }
    } else if (result.score === 1) {
      partial.push({
        number: todo.number,
        title: todo.title,
        signals: result.signals,
        score: result.score
      });
    } else {
      skipped++;
    }
  }

  return { closed, partial, skipped };
}

/**
 * Auto-archive notes that match the phase completion context.
 * Adds archived: true to frontmatter. Does NOT move files.
 * Requires 2+ signals before archiving.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {{ phaseName: string, phaseNum: number|string, keyFiles: string[], commitMessages: string[], summaryDescriptions: string[] }} context
 * @returns {{ archived: object[], partial: object[], skipped: number }}
 */
function autoArchiveNotes(planningDir, context) {
  const notesDir = path.join(planningDir, 'notes');
  const archived = [];
  const partial = [];
  let skipped = 0;

  if (!fs.existsSync(notesDir)) {
    return { archived, partial, skipped };
  }

  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));

  for (const filename of files) {
    const filePath = path.join(notesDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseYamlFrontmatter(content);

    // Skip already-archived notes
    if (fm.archived === true || fm.archived === 'true') {
      skipped++;
      continue;
    }

    const itemTitle = (fm.date ? fm.date + ' ' : '') + filename.replace(/\.md$/, '');
    const result = matchScore(
      { title: itemTitle, body: content },
      context
    );

    if (result.score >= 2) {
      // Add archived fields to frontmatter
      const archiveFields = `archived: true\narchived_reason: "Addressed by Phase ${context.phaseNum}"`;
      let updatedContent;

      // Insert before closing --- of frontmatter
      const fmMatch = content.match(/^(---\s*\r?\n[\s\S]*?\r?\n)(---)/);
      if (fmMatch) {
        updatedContent = fmMatch[1] + archiveFields + '\n' + fmMatch[2] + content.slice(fmMatch[0].length);
      } else {
        // No frontmatter — add one
        updatedContent = `---\n${archiveFields}\n---\n${content}`;
      }

      const writeResult = atomicWrite(filePath, updatedContent);
      if (writeResult.success) {
        archived.push({
          filename,
          signals: result.signals,
          score: result.score
        });
      }
    } else if (result.score === 1) {
      partial.push({
        filename,
        signals: result.signals,
        score: result.score
      });
    } else {
      skipped++;
    }
  }

  return { archived, partial, skipped };
}

module.exports = { matchScore, autoCloseTodos, autoArchiveNotes };
