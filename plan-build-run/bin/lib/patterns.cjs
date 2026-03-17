'use strict';

/**
 * patterns.cjs -- Cross-project pattern library for Plan-Build-Run.
 *
 * Storage: JSON files in ~/.claude/patterns/
 * Schema: id, name, source_project, type, tags, description, files,
 *         template_content, confidence, created_at
 *
 * Usage (library):
 *   const { patternExtract, patternQuery, patternList } = require('./patterns.cjs');
 *
 * Usage (CLI via pbr-tools.cjs):
 *   node pbr-tools.cjs patterns extract <json-file>
 *   node pbr-tools.cjs patterns query [--tags X,Y] [--type T] [--stack S]
 *   node pbr-tools.cjs patterns list
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Constants ---

const PATTERNS_DIR = path.join(os.homedir(), '.claude', 'patterns');

const PATTERN_TYPES = [
  'architecture',
  'testing',
  'auth',
  'crud',
  'deployment',
  'error-handling',
  'api-design',
  'data-model',
];

// --- Shared I/O helpers ---

/**
 * Read all JSON files from a directory, returning parsed objects.
 * Skips malformed files.
 * @param {string} dir
 * @returns {object[]}
 */
function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .reduce((acc, f) => {
      try {
        acc.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      } catch (_e) {
        // Skip malformed files
      }
      return acc;
    }, []);
}

/**
 * Write a JSON object to a file, creating parent dirs as needed.
 * @param {string} filePath
 * @param {object} data
 */
function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Append a JSONL entry to an audit log file.
 * @param {string} logDir
 * @param {object} entry
 */
function appendAuditLog(logDir, entry) {
  if (!logDir) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'cross-project.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_e) {
    // Non-fatal: audit log failures must not break operations
  }
}

/**
 * Sanitize a name for use as a filename.
 * Replaces non-alphanumeric characters with hyphens.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// --- Core functions ---

/**
 * Extract a pattern and store it in basePath.
 * Deduplicates by name+source_project: updates existing if found.
 *
 * @param {object} entry - Pattern entry to store
 * @param {{ basePath?: string, configFeatures?: object, logDir?: string }} [options]
 * @returns {{ action: 'created'|'updated', pattern: object } | { enabled: false }}
 */
function patternExtract(entry, options = {}) {
  const configFeatures = options.configFeatures || {};
  if (configFeatures.cross_project_patterns === false) {
    return { enabled: false };
  }

  const basePath = options.basePath || PATTERNS_DIR;
  const logDir = options.logDir;

  // Validate required fields
  const required = ['name', 'source_project', 'type', 'tags', 'description'];
  const missing = required.filter(f => entry[f] === undefined || entry[f] === null);
  if (missing.length > 0) {
    throw new Error(`Missing required pattern fields: ${missing.join(', ')}`);
  }

  // Build full pattern object
  const pattern = Object.assign({}, entry);
  if (!pattern.id) {
    try {
      pattern.id = crypto.randomUUID();
    } catch (_e) {
      pattern.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
  }
  if (!pattern.created_at) {
    pattern.created_at = new Date().toISOString();
  }

  const sanitized = sanitizeName(pattern.name);
  const filePath = path.join(basePath, `${sanitized}.json`);

  // Check for existing entry with same name (dedup)
  let action = 'created';
  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (existing.name === pattern.name && existing.source_project === pattern.source_project) {
        // Merge: union tags, bump confidence
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...(pattern.tags || [])]));
        const merged = Object.assign({}, existing, pattern, {
          tags: mergedTags,
          updated_at: new Date().toISOString(),
        });
        writeJsonFile(filePath, merged);
        appendAuditLog(logDir, {
          timestamp: new Date().toISOString(),
          operation: 'pattern-extract',
          feature: 'cross_project_patterns',
          detail: { name: pattern.name, tags: mergedTags },
        });
        return { action: 'updated', pattern: merged };
      }
    } catch (_e) {
      // File unreadable — overwrite
    }
  }

  writeJsonFile(filePath, pattern);
  appendAuditLog(logDir, {
    timestamp: new Date().toISOString(),
    operation: 'pattern-extract',
    feature: 'cross_project_patterns',
    detail: { name: pattern.name, tags: pattern.tags },
  });

  return { action, pattern };
}

/**
 * Query patterns with optional filters.
 *
 * @param {{ tags?: string[], type?: string, stack?: string, minConfidence?: number }} [filters]
 * @param {{ basePath?: string, configFeatures?: object, logDir?: string }} [options]
 * @returns {object[] | { enabled: false }}
 */
function patternQuery(filters = {}, options = {}) {
  const configFeatures = options.configFeatures || {};
  if (configFeatures.cross_project_patterns === false) {
    return { enabled: false };
  }

  const basePath = options.basePath || PATTERNS_DIR;
  const logDir = options.logDir;

  let patterns = readJsonDir(basePath);

  // Filter by tags (ALL must be present)
  if (filters.tags && filters.tags.length > 0) {
    patterns = patterns.filter(p => {
      const pTags = p.tags || [];
      return filters.tags.every(t => pTags.includes(t));
    });
  }

  // Filter by type (exact match)
  if (filters.type) {
    patterns = patterns.filter(p => p.type === filters.type);
  }

  // Filter by stack (tag prefix "stack:")
  if (filters.stack) {
    const stackTag = `stack:${filters.stack}`;
    patterns = patterns.filter(p => {
      const pTags = p.tags || [];
      return pTags.includes(stackTag);
    });
  }

  // Filter by minConfidence
  if (filters.minConfidence !== undefined) {
    patterns = patterns.filter(p => (p.confidence || 0) >= filters.minConfidence);
  }

  // Sort by confidence descending, then created_at descending
  patterns.sort((a, b) => {
    const confDiff = (b.confidence || 0) - (a.confidence || 0);
    if (confDiff !== 0) return confDiff;
    return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
  });

  appendAuditLog(logDir, {
    timestamp: new Date().toISOString(),
    operation: 'pattern-query',
    feature: 'cross_project_patterns',
    detail: { tags: filters.tags, type: filters.type },
  });

  return patterns;
}

/**
 * List all patterns (summary fields only).
 *
 * @param {{ basePath?: string, configFeatures?: object }} [options]
 * @returns {Array<{ name, type, tags, source_project, confidence }> | { enabled: false }}
 */
function patternList(options = {}) {
  const configFeatures = options.configFeatures || {};
  if (configFeatures.cross_project_patterns === false) {
    return { enabled: false };
  }

  const basePath = options.basePath || PATTERNS_DIR;
  const patterns = readJsonDir(basePath);

  return patterns.map(p => ({
    name: p.name,
    type: p.type,
    tags: p.tags,
    source_project: p.source_project,
    confidence: p.confidence,
  }));
}

// --- Exports ---

module.exports = {
  PATTERNS_DIR,
  PATTERN_TYPES,
  patternExtract,
  patternQuery,
  patternList,
  // Shared helpers (used by templates.cjs)
  appendAuditLog,
};
