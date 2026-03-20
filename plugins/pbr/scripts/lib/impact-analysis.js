'use strict';
/**
 * impact-analysis.cjs — Predictive impact analysis via dependency tracing.
 *
 * Builds a dependency graph of source files, then traces which files and
 * plans are affected by a set of changed files. Reports risk level.
 */

const fs = require('fs');
const path = require('path');
const { parsePlanToSpec } = require('./spec-engine');

// ─── Glob-like file scanner ───────────────────────────────────────────────────

/**
 * Recursively collect all files under a directory matching include patterns,
 * excluding node_modules and other common noise.
 * @param {string} dir
 * @param {Object} options
 * @returns {string[]}
 */
function collectFiles(dir, options) {
  const opts = options || {};
  const include = opts.include || ['**/*.js', '**/*.cjs', '**/*.mjs'];
  const exclude = opts.exclude || ['node_modules/**', '.git/**', 'dist/**', 'coverage/**'];
  const results = [];

  function shouldExclude(relPath) {
    return exclude.some(pattern => {
      const parts = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\/$/, '');
      return relPath.includes(parts.replace(/\//g, path.sep));
    });
  }

  function matches(relPath) {
    // Simple glob: check extension
    const ext = path.extname(relPath);
    const validExts = [];
    for (const p of include) {
      const m = p.match(/\*(\.\w+)$/);
      if (m) validExts.push(m[1]);
    }
    return validExts.length === 0 || validExts.includes(ext);
  }

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (shouldExclude(rel)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && matches(rel)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

// ─── Dependency Extraction ────────────────────────────────────────────────────

/**
 * Extract require/import paths from file content.
 * @param {string} content
 * @returns {string[]} relative-ish module paths
 */
function extractImports(content) {
  const deps = [];
  // CJS: require('./foo') or require('../bar')
  const cjsRe = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  // ESM: import ... from './foo' or import './foo'
  const esmRe = /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = cjsRe.exec(content)) !== null) {
    const p = m[1];
    if (p.startsWith('.')) deps.push(p);
  }
  while ((m = esmRe.exec(content)) !== null) {
    const p = m[1];
    if (p.startsWith('.')) deps.push(p);
  }
  return deps;
}

/**
 * Resolve a relative import path to an absolute file path.
 * Tries multiple extensions if the import has no extension.
 * @param {string} fromFile - The file containing the import
 * @param {string} importPath - The relative import path
 * @returns {string|null} Absolute path or null if not resolvable
 */
function resolveImport(fromFile, importPath) {
  const base = path.resolve(path.dirname(fromFile), importPath);
  // If already has extension and exists
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  // Try adding extensions
  for (const ext of ['.js', '.cjs', '.mjs', '.ts', '.json']) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  // Try index file
  for (const ext of ['.js', '.cjs', '.mjs']) {
    const idx = path.join(base, 'index' + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

// ─── Dependency Map ───────────────────────────────────────────────────────────

/**
 * Build a dependency map: file -> list of files it imports.
 * @param {string} projectRoot
 * @param {Object} [options]
 * @returns {Map<string, string[]>}
 */
function buildDependencyMap(projectRoot, options) {
  const files = collectFiles(projectRoot, options);
  const depMap = new Map();

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (_e) {
      depMap.set(file, []);
      continue;
    }
    const rawDeps = extractImports(content);
    const resolvedDeps = [];
    for (const dep of rawDeps) {
      const resolved = resolveImport(file, dep);
      if (resolved) resolvedDeps.push(resolved);
    }
    depMap.set(file, resolvedDeps);
  }

  return depMap;
}

// ─── Reverse Map ──────────────────────────────────────────────────────────────

/**
 * Build reverse dependency map: file -> list of files that depend on it.
 * @param {Map<string, string[]>} depMap
 * @returns {Map<string, string[]>}
 */
function buildReverseMap(depMap) {
  const reverseMap = new Map();

  // Initialize all known files
  for (const file of depMap.keys()) {
    reverseMap.set(file, []);
  }

  // Invert: for each file and its deps, add file to each dep's reverse entry
  for (const [file, deps] of depMap) {
    for (const dep of deps) {
      if (!reverseMap.has(dep)) reverseMap.set(dep, []);
      reverseMap.get(dep).push(file);
    }
  }

  return reverseMap;
}

// ─── BFS Traversal ────────────────────────────────────────────────────────────

/**
 * Traverse dependents via BFS from a set of start files.
 * @param {string[]} startFiles
 * @param {Map<string, string[]>} reverseMap
 * @param {number} [maxDepth=10]
 * @returns {Map<string, number>} file -> depth
 */
function traverseDependents(startFiles, reverseMap, maxDepth) {
  const max = maxDepth || 10;
  const visited = new Map(); // file -> depth
  const queue = startFiles.map(f => ({ file: f, depth: 0 }));

  while (queue.length > 0) {
    const { file, depth } = queue.shift();
    if (visited.has(file)) continue;
    visited.set(file, depth);
    if (depth >= max) continue;
    const dependents = reverseMap.get(file) || [];
    for (const dep of dependents) {
      if (!visited.has(dep)) {
        queue.push({ file: dep, depth: depth + 1 });
      }
    }
  }

  return visited;
}

// ─── Plan Scanner ─────────────────────────────────────────────────────────────

/**
 * Scan .planning/phases/ for PLAN.md files and find those that reference
 * any of the affected files in files_modified.
 * @param {string} projectRoot
 * @param {Set<string>} affectedFiles - absolute paths
 * @returns {string[]} plan IDs or paths
 */
function findAffectedPlans(projectRoot, affectedFiles) {
  const phasesDir = path.join(projectRoot, '.planning', 'phases');
  const affectedPlans = [];

  if (!fs.existsSync(phasesDir)) return affectedPlans;

  let phases;
  try {
    phases = fs.readdirSync(phasesDir, { withFileTypes: true });
  } catch (_e) {
    return affectedPlans;
  }

  for (const phaseEntry of phases) {
    if (!phaseEntry.isDirectory()) continue;
    const phaseDir = path.join(phasesDir, phaseEntry.name);
    let planFiles;
    try {
      planFiles = fs.readdirSync(phaseDir).filter(f => /^PLAN.*\.md$/i.test(f));
    } catch (_e) {
      continue;
    }
    for (const planFile of planFiles) {
      const planPath = path.join(phaseDir, planFile);
      try {
        const content = fs.readFileSync(planPath, 'utf-8');
        const spec = parsePlanToSpec(content);
        const filesModified = spec.frontmatter.files_modified;
        if (!filesModified) continue;
        const planPaths = Array.isArray(filesModified) ? filesModified : [filesModified];
        for (const pm of planPaths) {
          // Check if this plan's file overlaps with affected files
          for (const affected of affectedFiles) {
            if (affected.endsWith(pm) || pm.endsWith(path.basename(affected))) {
              affectedPlans.push(`${phaseEntry.name}/${planFile}`);
              break;
            }
          }
        }
      } catch (_e) {
        // Skip unreadable plan files
      }
    }
  }

  return [...new Set(affectedPlans)];
}

// ─── Impact Analysis ──────────────────────────────────────────────────────────

/**
 * Analyze the impact of changed files on the codebase.
 * @param {string[]} changedFiles - Absolute paths of changed files
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options]
 * @returns {{ affected: AffectedFile[], affectedPlans: string[], risk: string, depth: number }}
 */
function analyzeImpact(changedFiles, projectRoot, options) {
  const depMap = buildDependencyMap(projectRoot, options);
  const reverseMap = buildReverseMap(depMap);

  // BFS from changed files to find all affected files
  const visited = traverseDependents(changedFiles, reverseMap);

  // Build affected file list (excluding the changed files themselves at depth 0)
  const affected = [];
  let maxDepth = 0;
  for (const [file, depth] of visited) {
    if (depth > 0) {
      affected.push({ file, depth });
      if (depth > maxDepth) maxDepth = depth;
    }
  }

  // Risk classification
  let risk;
  if (affected.length <= 3) {
    risk = 'low';
  } else if (affected.length <= 10) {
    risk = 'medium';
  } else {
    risk = 'high';
  }

  // Find affected plans
  const affectedFileSet = new Set([...changedFiles, ...affected.map(a => a.file)]);
  const affectedPlans = findAffectedPlans(projectRoot, affectedFileSet);

  return {
    affected,
    affectedPlans,
    risk,
    depth: maxDepth,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildDependencyMap,
  buildReverseMap,
  analyzeImpact,
  traverseDependents,
  collectFiles,
};
