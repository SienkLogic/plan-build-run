#!/usr/bin/env node
/**
 * milestone-learnings.js — Auto-aggregate learnings from milestone phase SUMMARY.md files.
 * Called by the milestone complete flow after archiving phases.
 *
 * Aggregation targets:
 * 1. ~/.claude/learnings.jsonl — global cross-project JSONL store (existing)
 * 2. .planning/KNOWLEDGE.md — project-scoped knowledge base with table format (new)
 *
 * Usage: node milestone-learnings.js <milestone-archive-path> [--project <name>]
 *   e.g. node milestone-learnings.js .planning/milestones/v2.0 --project my-app
 *
 * Env: PBR_LEARNINGS_FILE — override the learnings JSONL file path (for testing)
 * Env: PBR_KNOWLEDGE_FILE — override the KNOWLEDGE.md file path (for testing)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { learningsIngest, copyToGlobal } = require('./lib/learnings');
const { extractFrontmatter } = require('./lib/frontmatter');

// --- Helpers ---

// parseFrontmatter replaced by extractFrontmatter from lib/frontmatter.js

/**
 * Extract learning entries from a SUMMARY.md file's frontmatter.
 * @param {string} summaryContent — raw file content
 * @param {string} sourceProject — project name
 * @returns {object[]} array of raw learning entry objects
 */
function extractLearningsFromSummary(summaryContent, sourceProject) {
  const fm = extractFrontmatter(summaryContent);
  if (!fm || Object.keys(fm).length === 0) return [];

  const entries = [];

  // provides items -> tech-pattern
  const provides = Array.isArray(fm.provides) ? fm.provides : [];
  for (const item of provides) {
    if (!item || typeof item !== 'string') continue;
    entries.push({
      source_project: sourceProject,
      type: 'tech-pattern',
      tags: ['stack:inferred'],
      confidence: 'low',
      occurrences: 1,
      summary: `Built: ${item}`,
      detail: item
    });
  }

  // key_decisions items -> process-win
  const decisions = Array.isArray(fm.key_decisions) ? fm.key_decisions : [];
  for (const item of decisions) {
    if (!item || typeof item !== 'string') continue;
    entries.push({
      source_project: sourceProject,
      type: 'process-win',
      tags: ['decision'],
      confidence: 'low',
      occurrences: 1,
      summary: `Decision: ${item}`,
      detail: item
    });
  }

  // patterns items -> tech-pattern
  const patterns = Array.isArray(fm.patterns) ? fm.patterns : [];
  for (const item of patterns) {
    if (!item || typeof item !== 'string') continue;
    entries.push({
      source_project: sourceProject,
      type: 'tech-pattern',
      tags: ['pattern'],
      confidence: 'low',
      occurrences: 1,
      summary: `Pattern: ${item}`,
      detail: item
    });
  }

  // deferred items -> deferred-item
  const deferred = Array.isArray(fm.deferred) ? fm.deferred : [];
  for (const item of deferred) {
    if (!item || typeof item !== 'string') continue;
    entries.push({
      source_project: sourceProject,
      type: 'deferred-item',
      tags: ['deferred'],
      confidence: 'low',
      occurrences: 1,
      summary: `Deferred: ${item}`,
      detail: item
    });
  }

  // issues items -> planning-failure or anti-pattern
  const issues = Array.isArray(fm.issues) ? fm.issues : [];
  for (const item of issues) {
    if (!item || typeof item !== 'string') continue;
    entries.push({
      source_project: sourceProject,
      type: 'planning-failure',
      tags: ['issue'],
      confidence: 'low',
      occurrences: 1,
      summary: `Issue: ${item}`,
      detail: item
    });
  }

  return entries;
}

/**
 * Recursively find all SUMMARY*.md files under a phases directory.
 * Matches both single-summary (SUMMARY.md) and per-plan (SUMMARY-45-01.md) patterns.
 * @param {string} phasesDir
 * @returns {string[]} absolute paths to SUMMARY*.md files
 */
function findSummaryFiles(phasesDir) {
  const results = [];
  if (!fs.existsSync(phasesDir)) return results;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(phasesDir, entry.name);
      if (entry.isDirectory()) {
        // Find all SUMMARY*.md files in this phase directory
        try {
          const phaseFiles = fs.readdirSync(fullPath);
          for (const file of phaseFiles) {
            if (/^SUMMARY.*\.md$/i.test(file)) {
              results.push(path.join(fullPath, file));
            }
          }
        } catch (_e) {
          // Ignore read errors for individual phase dirs
        }
        // Recurse in case of nested dirs
        results.push(...findSummaryFiles(fullPath));
      }
    }
  } catch (_e) {
    // Ignore permission errors
  }
  return results;
}

// --- KNOWLEDGE.md aggregation ---

/**
 * Default KNOWLEDGE.md template with empty tables.
 */
const KNOWLEDGE_TEMPLATE = `---
updated: "${new Date().toISOString().split('T')[0]}"
---
# Project Knowledge Base

Aggregated knowledge from milestone completions. Auto-maintained by milestone-learnings.js.

## Key Rules

Architectural rules and constraints discovered during development.

| ID | Rule | Source | Date |
|----|------|--------|------|

## Patterns

Reusable patterns and conventions established across phases.

| ID | Pattern | Source | Date |
|----|---------|--------|------|

## Lessons Learned

What worked, what didn't, and deferred items for future consideration.

| ID | Lesson | Type | Source | Date |
|----|--------|------|--------|------|
`;

/**
 * Count existing rows with a given prefix (K, P, L) in KNOWLEDGE.md content.
 * @param {string} content - KNOWLEDGE.md content
 * @param {string} prefix - Row ID prefix (K, P, L)
 * @returns {number} count of existing rows
 */
function countExistingRows(content, prefix) {
  const regex = new RegExp(`^\\| ${prefix}\\d+`, 'gm');
  return (content.match(regex) || []).length;
}

/**
 * Check if an item already exists in KNOWLEDGE.md (substring match).
 * @param {string} content - KNOWLEDGE.md content
 * @param {string} item - The item text to check for
 * @returns {boolean}
 */
function itemExists(content, item) {
  // Normalize for comparison: trim, lowercase, collapse whitespace
  const normalized = item.trim().toLowerCase().replace(/\s+/g, ' ');
  const contentNorm = content.toLowerCase().replace(/\s+/g, ' ');
  return contentNorm.includes(normalized);
}

/**
 * Aggregate extracted entries into .planning/KNOWLEDGE.md.
 * Creates the file if it doesn't exist. Deduplicates by substring match.
 * Auto-increments IDs based on existing entries.
 *
 * @param {object[]} rawEntries - Entries from extractLearningsFromSummary
 * @param {string} knowledgePath - Path to KNOWLEDGE.md
 * @returns {{ added: number, skipped: number }}
 */
function aggregateToKnowledge(rawEntries, knowledgePath) {
  // Create KNOWLEDGE.md if missing
  if (!fs.existsSync(knowledgePath)) {
    const dir = path.dirname(knowledgePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(knowledgePath, KNOWLEDGE_TEMPLATE, 'utf8');
  }

  let content = fs.readFileSync(knowledgePath, 'utf8');
  const today = new Date().toISOString().split('T')[0];
  let added = 0;
  let skipped = 0;

  // Track current ID counts
  let kCount = countExistingRows(content, 'K');
  let pCount = countExistingRows(content, 'P');
  let lCount = countExistingRows(content, 'L');

  for (const entry of rawEntries) {
    const detail = entry.detail || entry.summary || '';
    if (!detail) { skipped++; continue; }

    // Dedup check
    if (itemExists(content, detail)) {
      skipped++;
      continue;
    }

    const source = entry.source_project || 'unknown';
    const escapedDetail = detail.replace(/\|/g, '\\|').replace(/\n/g, ' ');

    if (entry.type === 'process-win' || (entry.tags && entry.tags.includes('decision'))) {
      // Key decisions -> Key Rules table
      kCount++;
      const id = `K${String(kCount).padStart(3, '0')}`;
      const row = `| ${id} | ${escapedDetail} | ${source} | ${today} |`;
      content = insertTableRow(content, '## Key Rules', row);
      added++;
    } else if (entry.type === 'tech-pattern' && entry.tags && entry.tags.includes('pattern')) {
      // Patterns -> Patterns table
      pCount++;
      const id = `P${String(pCount).padStart(3, '0')}`;
      const row = `| ${id} | ${escapedDetail} | ${source} | ${today} |`;
      content = insertTableRow(content, '## Patterns', row);
      added++;
    } else {
      // Everything else -> Lessons Learned table
      lCount++;
      const id = `L${String(lCount).padStart(3, '0')}`;
      const typeLabel = entry.type || 'observation';
      const row = `| ${id} | ${escapedDetail} | ${typeLabel} | ${source} | ${today} |`;
      content = insertTableRow(content, '## Lessons Learned', row);
      added++;
    }
  }

  // Update frontmatter date
  content = content.replace(/^(updated:\s*)"[^"]*"/m, `$1"${today}"`);

  fs.writeFileSync(knowledgePath, content, 'utf8');
  return { added, skipped };
}

/**
 * Insert a table row at the end of a table section in KNOWLEDGE.md.
 * Finds the section heading, then locates the last row of the table and appends after it.
 * @param {string} content - Full KNOWLEDGE.md content
 * @param {string} sectionHeading - The ## heading to find
 * @param {string} row - The table row to insert
 * @returns {string} Updated content
 */
function insertTableRow(content, sectionHeading, row) {
  const lines = content.split('\n');
  let sectionFound = false;
  let lastTableRowIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(sectionHeading)) {
      sectionFound = true;
      continue;
    }
    if (sectionFound) {
      // Track table rows (lines starting with |)
      if (lines[i].startsWith('|')) {
        lastTableRowIdx = i;
      }
      // Stop at next section heading
      if (lines[i].startsWith('## ') && lastTableRowIdx !== -1) {
        break;
      }
    }
  }

  if (lastTableRowIdx !== -1) {
    // Insert after the last table row (or separator)
    lines.splice(lastTableRowIdx + 1, 0, row);
    return lines.join('\n');
  }

  // Fallback: append to end of file
  return content + '\n' + row + '\n';
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);

  // Parse CLI arguments
  const archivePath = args[0];
  if (!archivePath) {
    process.stderr.write(
      'Usage: node milestone-learnings.js <milestone-archive-path> [--project <name>]\n' +
      'Error: archive path is required\n'
    );
    process.exit(1);
  }

  // Parse --project flag
  let projectName = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      projectName = args[i + 1];
      i++;
    }
  }

  // Default project name to basename of cwd
  if (!projectName) {
    projectName = path.basename(process.cwd());
  }

  const resolvedArchivePath = path.resolve(archivePath);

  // Verify archive path exists
  if (!fs.existsSync(resolvedArchivePath)) {
    process.stderr.write(`Error: archive path does not exist: ${resolvedArchivePath}\n`);
    process.exit(1);
  }

  // Learnings file path (can be overridden for testing)
  const learningsOpts = process.env.PBR_LEARNINGS_FILE
    ? { filePath: process.env.PBR_LEARNINGS_FILE }
    : {};

  // KNOWLEDGE.md path (can be overridden for testing)
  const knowledgePath = process.env.PBR_KNOWLEDGE_FILE
    || path.join(process.cwd(), '.planning', 'KNOWLEDGE.md');

  const phasesDir = path.join(resolvedArchivePath, 'phases');
  const summaryFiles = findSummaryFiles(phasesDir);

  let created = 0;
  let updated = 0;
  let errors = 0;

  // Collect all entries for KNOWLEDGE.md aggregation
  const allEntries = [];

  for (const summaryPath of summaryFiles) {
    try {
      const content = fs.readFileSync(summaryPath, 'utf8');
      const rawEntries = extractLearningsFromSummary(content, projectName);
      allEntries.push(...rawEntries);

      // Ingest into global JSONL store (existing behavior)
      for (const rawEntry of rawEntries) {
        try {
          const result = learningsIngest(rawEntry, learningsOpts);
          if (result.action === 'created') {
            created++;
          } else {
            updated++;
          }
        } catch (ingestErr) {
          errors++;
          process.stderr.write(`[milestone-learnings] Ingest error: ${ingestErr.message}\n`);
        }
      }
    } catch (readErr) {
      errors++;
      process.stderr.write(`[milestone-learnings] Read error for ${summaryPath}: ${readErr.message}\n`);
    }
  }

  // --- Aggregate into project-scoped KNOWLEDGE.md ---
  let knowledgeAdded = 0;
  let knowledgeSkipped = 0;
  try {
    const result = aggregateToKnowledge(allEntries, knowledgePath);
    knowledgeAdded = result.added;
    knowledgeSkipped = result.skipped;
    process.stdout.write(`KNOWLEDGE.md: ${knowledgeAdded} new entries, ${knowledgeSkipped} duplicates skipped\n`);
  } catch (knowledgeErr) {
    process.stderr.write(`[milestone-learnings] KNOWLEDGE.md error: ${knowledgeErr.message}\n`);
  }

  // --- Also scan VERIFICATION.md files for recurring gap patterns ---
  try {
    if (fs.existsSync(phasesDir)) {
      const verificationEntries = [];
      const dirs = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const verPath = path.join(phasesDir, dir.name, 'VERIFICATION.md');
        if (!fs.existsSync(verPath)) continue;
        try {
          const verContent = fs.readFileSync(verPath, 'utf8');
          const fm = extractFrontmatter(verContent);
          if (!fm) continue;
          // Extract gaps from frontmatter
          const gaps = Array.isArray(fm.gaps) ? fm.gaps : [];
          for (const gap of gaps) {
            if (!gap || typeof gap !== 'string') continue;
            verificationEntries.push({
              source_project: projectName,
              type: 'anti-pattern',
              tags: ['verification-gap'],
              confidence: 'low',
              occurrences: 1,
              summary: `Gap: ${gap}`,
              detail: gap
            });
          }
        } catch (_e) { /* skip unreadable files */ }
      }
      if (verificationEntries.length > 0) {
        const verResult = aggregateToKnowledge(verificationEntries, knowledgePath);
        if (verResult.added > 0) {
          process.stdout.write(`KNOWLEDGE.md: ${verResult.added} verification gap entries added\n`);
        }
      }
    }
  } catch (_e) { /* non-fatal */ }

  // --- Cross-project knowledge copy ---
  let crossProjectCopied = 0;
  try {
    // Check if cross_project_knowledge is enabled in config
    const configPath = path.join(process.cwd(), '.planning', 'config.json');
    let crossProjectEnabled = false;
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      crossProjectEnabled = config.learnings && config.learnings.cross_project_knowledge === true;
    }

    if (crossProjectEnabled) {
      // Find all LEARNINGS.md files in phase directories
      const learningsFiles = [];
      if (fs.existsSync(phasesDir)) {
        const phaseDirs = fs.readdirSync(phasesDir, { withFileTypes: true });
        for (const dir of phaseDirs) {
          if (dir.isDirectory()) {
            const learningsPath = path.join(phasesDir, dir.name, 'LEARNINGS.md');
            if (fs.existsSync(learningsPath)) {
              learningsFiles.push(learningsPath);
            }
          }
        }
      }

      for (const filePath of learningsFiles) {
        try {
          const result = copyToGlobal(filePath, projectName);
          if (result.copied) crossProjectCopied++;
        } catch (_e) {
          // Non-fatal: log but continue
        }
      }

      if (crossProjectCopied > 0) {
        process.stdout.write(`Copied ${crossProjectCopied} learnings to global knowledge store\n`);
      }
    } else {
      process.stdout.write('Cross-project knowledge disabled, skipping global copy\n');
    }
  } catch (_e) {
    // Non-fatal: cross-project copy failure should not break milestone completion
  }

  const summary = `Learnings aggregated: ${created} new, ${updated} updated, ${errors} errors`;
  process.stdout.write(summary + '\n');

  try {
    logHook('milestone-learnings', 'complete', 'aggregated', { created, updated, errors, knowledgeAdded, knowledgeSkipped });
  } catch (_e) {
    // Non-fatal: logging failure must not break the script
  }
}

// Run if called directly
if (require.main === module || process.argv[1] === __filename) {
  main().catch(err => {
    process.stderr.write(`[milestone-learnings] Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { extractLearningsFromSummary, findSummaryFiles, extractFrontmatter, aggregateToKnowledge, countExistingRows, itemExists, insertTableRow, KNOWLEDGE_TEMPLATE };
