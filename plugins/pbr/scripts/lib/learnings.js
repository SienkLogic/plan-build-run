'use strict';

/**
 * learnings.js — Global cross-project learnings store for Plan-Build-Run.
 *
 * Storage: JSONL at ~/.claude/learnings.jsonl
 * Schema v1: id, source_project, type, tags, confidence, occurrences, summary, detail, custom_tags
 *
 * Usage (library):
 *   const { learningsIngest, learningsQuery } = require('./lib/learnings');
 *
 * Usage (CLI via pbr-tools.js):
 *   node pbr-tools.js learnings ingest <json-file>
 *   node pbr-tools.js learnings query [--tags X] [--min-confidence Y] [--stack S] [--type T]
 *   node pbr-tools.js learnings check-thresholds
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Constants ---

const GLOBAL_LEARNINGS_PATH = path.join(os.homedir(), '.claude', 'learnings.jsonl');

// Schema v1 type taxonomy
const LEARNING_TYPES = [
  'tech-pattern',        // positive: "this tech/pattern worked well"
  'anti-pattern',        // negative: "avoid this approach"
  'estimation-metric',   // timing/sizing data (e.g., "OAuth takes ~3 phases")
  'planning-failure',    // what went wrong in planning
  'deferred-item',       // common deferrals with trigger conditions
  'stack-insight',       // tech stack compatibility facts
  'process-win',         // positive process patterns
  'process-failure'      // negative process patterns
];

// Confidence tiers based on occurrence count
const CONFIDENCE_TIERS = { low: 1, medium: 2, high: 3 };

// Deferral thresholds for the 4 deferred items from phase 45
const DEFERRAL_THRESHOLDS = [
  { key: 'organic-taxonomy',       trigger: 'count > 50',   check: (count) => count > 50 },
  { key: 'statistical-confidence', trigger: 'any_tag >= 20', check: (_c, tagMax) => tagMax >= 20 },
  { key: 'audit-integration',      trigger: 'audits > 10',  check: (_c, _t, audits) => audits > 10 },
  { key: 'executor-injection',     trigger: 'queries > 30', check: (_c, _t, _a, queries) => queries > 30 }
];

// --- Core functions ---

/**
 * Compute confidence tier from occurrence count.
 * @param {number} occurrences
 * @returns {'low'|'medium'|'high'}
 */
function computeConfidence(occurrences) {
  if (occurrences >= 3) return 'high';
  if (occurrences === 2) return 'medium';
  return 'low';
}

/**
 * Validate a learning entry against schema v1.
 * @param {object} entry
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEntry(entry) {
  const errors = [];

  if (!entry) {
    return { valid: false, errors: ['entry is null or undefined'] };
  }

  // Required fields
  const required = ['id', 'source_project', 'type', 'tags', 'confidence', 'occurrences', 'summary'];
  for (const field of required) {
    if (entry[field] === undefined || entry[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // Type must be in taxonomy
  if (entry.type !== undefined && !LEARNING_TYPES.includes(entry.type)) {
    errors.push(`invalid type: "${entry.type}". Must be one of: ${LEARNING_TYPES.join(', ')}`);
  }

  // Confidence must be valid tier
  if (entry.confidence !== undefined && !['low', 'medium', 'high'].includes(entry.confidence)) {
    errors.push(`invalid confidence: "${entry.confidence}". Must be one of: low, medium, high`);
  }

  // Occurrences must be positive integer
  if (entry.occurrences !== undefined) {
    if (!Number.isInteger(entry.occurrences) || entry.occurrences < 1) {
      errors.push(`occurrences must be a positive integer, got: ${entry.occurrences}`);
    }
  }

  // Tags must be a non-empty array of strings
  if (entry.tags !== undefined) {
    if (!Array.isArray(entry.tags)) {
      errors.push('tags must be an array');
    } else if (entry.tags.length === 0) {
      errors.push('tags must be a non-empty array');
    } else {
      const nonStrings = entry.tags.filter(t => typeof t !== 'string');
      if (nonStrings.length > 0) {
        errors.push(`all tags must be strings; got ${nonStrings.length} non-string value(s)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load all entries from the learnings JSONL file.
 * @param {string} [filePath] — defaults to GLOBAL_LEARNINGS_PATH
 * @returns {object[]}
 */
function loadAll(filePath) {
  const target = filePath || GLOBAL_LEARNINGS_PATH;
  if (!fs.existsSync(target)) {
    return [];
  }
  const content = fs.readFileSync(target, 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .reduce((acc, line) => {
      try {
        acc.push(JSON.parse(line));
      } catch (_e) {
        console.error(`[learnings] Skipping malformed line: ${line.slice(0, 80)}`);
      }
      return acc;
    }, []);
}

/**
 * Save all entries to the learnings JSONL file.
 * @param {object[]} entries
 * @param {string} [filePath] — defaults to GLOBAL_LEARNINGS_PATH
 */
function saveAll(entries, filePath) {
  const target = filePath || GLOBAL_LEARNINGS_PATH;
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const content = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
  fs.writeFileSync(target, content, 'utf8');
}

/**
 * Ingest a learning entry into the global store.
 * Deduplicates by source_project + type + summary.
 * If a duplicate is found, increments occurrences and updates confidence.
 * @param {object} rawEntry
 * @param {{ filePath?: string }} [options]
 * @returns {{ action: 'created'|'updated', entry: object }}
 */
function learningsIngest(rawEntry, options = {}) {
  const filePath = options.filePath || GLOBAL_LEARNINGS_PATH;

  // Fill in generated fields if missing
  const entry = Object.assign({}, rawEntry);
  if (!entry.id) {
    try {
      entry.id = crypto.randomUUID();
    } catch (_e) {
      entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  }
  if (!entry.created_at) {
    entry.created_at = new Date().toISOString();
  }

  const existing = loadAll(filePath);

  // Dedup check: same source_project + type + summary
  const dupIndex = existing.findIndex(
    e => e.source_project === entry.source_project &&
         e.type === entry.type &&
         e.summary === entry.summary
  );

  if (dupIndex !== -1) {
    // Update existing entry
    const dup = existing[dupIndex];
    dup.occurrences = (dup.occurrences || 1) + 1;
    dup.confidence = computeConfidence(dup.occurrences);
    dup.updated_at = new Date().toISOString();
    saveAll(existing, filePath);
    return { action: 'updated', entry: dup };
  }

  // New entry — validate before saving
  const validation = validateEntry(entry);
  if (!validation.valid) {
    throw new Error(`Invalid learning entry: ${validation.errors.join('; ')}`);
  }

  existing.push(entry);
  saveAll(existing, filePath);
  return { action: 'created', entry };
}

/**
 * Query learnings with optional filters.
 * @param {{ tags?: string[], minConfidence?: string, stack?: string, type?: string }} [filters]
 * @param {{ filePath?: string }} [options]
 * @returns {object[]} Matching entries sorted by occurrences descending
 */
function learningsQuery(filters = {}, options = {}) {
  const filePath = options.filePath || GLOBAL_LEARNINGS_PATH;
  let entries = loadAll(filePath);

  // Filter by tags (ALL listed tags must be present)
  if (filters.tags && filters.tags.length > 0) {
    entries = entries.filter(e => {
      const entryTags = e.tags || [];
      return filters.tags.every(t => entryTags.includes(t));
    });
  }

  // Filter by minConfidence (entry confidence must be >= threshold)
  if (filters.minConfidence && filters.minConfidence !== 'low') {
    const minLevel = CONFIDENCE_TIERS[filters.minConfidence];
    if (minLevel !== undefined) {
      entries = entries.filter(e => {
        const entryLevel = CONFIDENCE_TIERS[e.confidence] || 0;
        return entryLevel >= minLevel;
      });
    }
  }

  // Filter by stack: matches if tags include "stack:<value>" OR stack_tags includes value
  if (filters.stack) {
    const stackTag = `stack:${filters.stack}`;
    entries = entries.filter(e => {
      const entryTags = e.tags || [];
      const stackTags = e.stack_tags || [];
      return entryTags.includes(stackTag) || stackTags.includes(filters.stack);
    });
  }

  // Filter by type (exact match)
  if (filters.type) {
    entries = entries.filter(e => e.type === filters.type);
  }

  // Sort by occurrences descending
  entries.sort((a, b) => (b.occurrences || 1) - (a.occurrences || 1));

  return entries;
}

/**
 * Check deferral thresholds against current learnings data.
 * @param {{ filePath?: string }} [options]
 * @returns {Array<{ key: string, trigger: string, message: string }>} Triggered thresholds
 */
function checkDeferralThresholds(options = {}) {
  const filePath = options.filePath || GLOBAL_LEARNINGS_PATH;
  const entries = loadAll(filePath);

  const totalCount = entries.length;

  // Compute max occurrences for any single tag
  const tagCounts = {};
  for (const entry of entries) {
    for (const tag of (entry.tags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + (entry.occurrences || 1);
    }
  }
  const tagMax = Object.values(tagCounts).reduce((max, v) => Math.max(max, v), 0);

  // Count audit-type entries
  const auditCount = entries.filter(e => e.type === 'planning-failure' || e.type === 'process-failure').length;

  // Query count: default 0 (separate counter not implemented in v1 — threshold tracked externally)
  const queryCount = 0;

  const triggered = [];
  for (const threshold of DEFERRAL_THRESHOLDS) {
    if (threshold.check(totalCount, tagMax, auditCount, queryCount)) {
      triggered.push({
        key: threshold.key,
        trigger: threshold.trigger,
        message: `Deferral threshold met: ${threshold.key} (${threshold.trigger})`
      });
    }
  }

  return triggered;
}

// --- Exports ---

module.exports = {
  GLOBAL_LEARNINGS_PATH,
  LEARNING_TYPES,
  CONFIDENCE_TIERS,
  DEFERRAL_THRESHOLDS,
  computeConfidence,
  validateEntry,
  loadAll,
  saveAll,
  learningsIngest,
  learningsQuery,
  checkDeferralThresholds
};
