#!/usr/bin/env node
/**
 * milestone-learnings.js — Auto-aggregate learnings from milestone phase SUMMARY.md files.
 * Called by the milestone complete flow after archiving phases.
 *
 * Usage: node milestone-learnings.js <milestone-archive-path> [--project <name>]
 *   e.g. node milestone-learnings.js .planning/milestones/v2.0 --project my-app
 *
 * Env: PBR_LEARNINGS_FILE — override the learnings file path (for testing)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { learningsIngest } = require('./lib/learnings');

// --- Helpers ---

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object with string/array field values, or null if no frontmatter.
 * Only handles simple YAML: scalar strings and dash-list arrays.
 * @param {string} content
 * @returns {object|null}
 */
function parseFrontmatter(content) {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};
  const lines = yaml.split('\n');
  let currentKey = null;

  for (const line of lines) {
    // List item (must check before key match so "  - item" doesn't match as key)
    const listMatch = line.match(/^\s+-\s+"?([^"]+?)"?\s*$/);
    if (listMatch) {
      if (currentKey !== null) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(listMatch[1].trim());
      }
      continue;
    }

    // Key: value pair
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawVal = kvMatch[2].trim();

      if (rawVal === '' || rawVal === '[]') {
        // Empty scalar or empty inline array — may be followed by list items
        result[currentKey] = [];
      } else if (rawVal.startsWith('[')) {
        // Inline array (basic): [a, b]
        const inner = rawVal.slice(1, rawVal.lastIndexOf(']'));
        result[currentKey] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        result[currentKey] = rawVal.replace(/^["']|["']$/g, '');
      }
    }
  }

  return result;
}

/**
 * Extract learning entries from a SUMMARY.md file's frontmatter.
 * @param {string} summaryContent — raw file content
 * @param {string} sourceProject — project name
 * @returns {object[]} array of raw learning entry objects
 */
function extractLearningsFromSummary(summaryContent, sourceProject) {
  const fm = parseFrontmatter(summaryContent);
  if (!fm) return [];

  const entries = [];

  // provides items → tech-pattern
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

  // key_decisions items → process-win
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

  // patterns items → tech-pattern
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

  // deferred items → deferred-item
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

  // issues items → planning-failure or anti-pattern
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

  const phasesDir = path.join(resolvedArchivePath, 'phases');
  const summaryFiles = findSummaryFiles(phasesDir);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const summaryPath of summaryFiles) {
    try {
      const content = fs.readFileSync(summaryPath, 'utf8');
      const rawEntries = extractLearningsFromSummary(content, projectName);

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

  const summary = `Learnings aggregated: ${created} new, ${updated} updated, ${errors} errors`;
  process.stdout.write(summary + '\n');

  try {
    logHook('milestone-learnings', 'complete', 'aggregated', { created, updated, errors });
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

module.exports = { extractLearningsFromSummary, findSummaryFiles, parseFrontmatter };
