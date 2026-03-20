/**
 * lib/graph.cjs -- Living Architecture Graph for Plan-Build-Run.
 *
 * Builds, queries, and incrementally updates a dependency graph from
 * intel data (files.json, deps.json) and source directory scanning.
 * The graph is persisted to .planning/codebase/graph.json.
 *
 * All public functions gate on features.architecture_graph config toggle.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────

const GRAPH_FILE = 'codebase/graph.json';
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Safely read and parse a JSON file. Returns null on error.
 * @param {string} filePath
 * @returns {object|null}
 */
function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * Classify a file's node type based on its path.
 * @param {string} filePath - Relative or absolute file path
 * @returns {string} Node type
 */
function classifyNodeType(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (/plugins\/pbr\/scripts\//.test(normalized)) return 'hook';
  if (/plugins\/pbr\/agents\//.test(normalized)) return 'agent';
  if (/plugins\/pbr\/skills\//.test(normalized)) return 'skill';
  if (/plugins\/pbr\/scripts\/lib\//.test(normalized)) return 'lib';
  if (/plugins\/pbr\/templates\//.test(normalized)) return 'template';
  if (/\.test\.(js|cjs|mjs|ts)$/.test(normalized)) return 'test';
  if (/config[.-]/.test(path.basename(normalized))) return 'config';
  return 'script';
}

/**
 * Detect architectural patterns from file path and content.
 * @param {string} filePath - Relative file path
 * @param {string} [content] - File content (if available)
 * @returns {string[]} Detected pattern names
 */
function detectPatterns(filePath, content) {
  const patterns = [];
  const normalized = filePath.replace(/\\/g, '/');

  // Dispatch pattern: files that delegate to sub-scripts
  if (content && /dispatch|delegate|route/i.test(content) && /require\(/.test(content)) {
    patterns.push('dispatch');
  }

  // CommonJS lib pattern
  if (/\.cjs$/.test(normalized) && /lib\//.test(normalized)) {
    patterns.push('commonjs-lib');
  }

  // Hook lifecycle pattern (uses hook exit codes or logHook)
  if (content && (/logHook/.test(content) || /hook-logger/.test(content))) {
    patterns.push('hook-lifecycle');
  }

  return patterns;
}

// ─── Feature toggle ──────────────────────────────────────────────────────────

/**
 * Check if architecture graph is enabled in config.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function isGraphEnabled(planningDir) {
  try {
    const { configLoad } = require('./config');
    const config = configLoad(planningDir);
    if (!config) return true; // default enabled
    if (config.features && config.features.architecture_graph === false) return false;
    return true;
  } catch (_e) {
    return true;
  }
}

/**
 * Check if architecture guard is enabled in config.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function isGuardEnabled(planningDir) {
  try {
    const { configLoad } = require('./config');
    const config = configLoad(planningDir);
    if (!config) return true;
    if (config.features && config.features.architecture_guard === false) return false;
    return true;
  } catch (_e) {
    return true;
  }
}

// ─── Graph Building ──────────────────────────────────────────────────────────

/**
 * Build a full architecture graph from intel data and source scanning.
 *
 * @param {string} planningDir - Path to .planning directory
 * @param {string} projectRoot - Path to project root
 * @returns {object} Graph object or { disabled: true }
 */
function buildGraph(planningDir, projectRoot) {
  if (!isGraphEnabled(planningDir)) {
    return { disabled: true, message: 'Architecture graph disabled (features.architecture_graph=false)' };
  }

  const nodes = {};
  const edges = [];
  const patternMap = {};

  // ─── Read intel files.json for node data ─────────────────────────────────
  const filesData = safeReadJson(path.join(planningDir, 'intel', 'files.json'));
  if (filesData && filesData.entries) {
    for (const [filePath, entry] of Object.entries(filesData.entries)) {
      const nodeType = entry.type || classifyNodeType(filePath);
      nodes[filePath] = {
        type: nodeType,
        exports: entry.exports || [],
        size_lines: entry.lines || entry.size_lines || 0,
        patterns: [],
        last_modified: entry.last_modified || null
      };

      // Create import edges
      if (entry.imports && Array.isArray(entry.imports)) {
        for (const imp of entry.imports) {
          edges.push({ from: filePath, to: imp, type: 'import' });
        }
      }
    }
  }

  // ─── Scan project directories for additional nodes ───────────────────────
  if (projectRoot) {
    scanDirectory(projectRoot, 'plugins/pbr/scripts', 'hook', nodes, patternMap);
    scanDirectory(projectRoot, 'plugins/pbr/agents', 'agent', nodes, patternMap);
    scanDirectory(projectRoot, 'plugins/pbr/scripts/lib', 'lib', nodes, patternMap);
  }

  // ─── Detect patterns ─────────────────────────────────────────────────────
  for (const [filePath, node] of Object.entries(nodes)) {
    const fullPath = projectRoot ? path.join(projectRoot, filePath) : filePath;
    let content = null;
    try {
      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, 'utf8');
      }
    } catch (_e) { /* skip */ }

    const detected = detectPatterns(filePath, content);
    node.patterns = detected;

    for (const p of detected) {
      if (!patternMap[p]) {
        patternMap[p] = { description: describePattern(p), files: [], convention: conventionFor(p) };
      }
      if (!patternMap[p].files.includes(filePath)) {
        patternMap[p].files.push(filePath);
      }
    }
  }

  const graphObj = {
    _meta: {
      updated_at: new Date().toISOString(),
      version: 1,
      node_count: Object.keys(nodes).length,
      edge_count: edges.length
    },
    nodes,
    edges,
    patterns: patternMap
  };

  // Write to disk
  const codebaseDir = path.join(planningDir, 'codebase');
  if (!fs.existsSync(codebaseDir)) {
    fs.mkdirSync(codebaseDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(planningDir, GRAPH_FILE),
    JSON.stringify(graphObj, null, 2),
    'utf8'
  );

  return graphObj;
}

/**
 * Scan a directory and add nodes to the graph.
 * @param {string} projectRoot
 * @param {string} relDir - Relative directory path
 * @param {string} nodeType
 * @param {object} nodes - Nodes map to populate
 * @param {object} patternMap - Patterns map to populate
 */
function scanDirectory(projectRoot, relDir, nodeType, nodes, patternMap) {
  const absDir = path.join(projectRoot, relDir);
  if (!fs.existsSync(absDir)) return;

  try {
    const entries = fs.readdirSync(absDir);
    for (const entry of entries) {
      const relPath = path.join(relDir, entry).replace(/\\/g, '/');
      if (nodes[relPath]) continue; // already from intel

      const fullPath = path.join(absDir, entry);
      let stat;
      try { stat = fs.statSync(fullPath); } catch (_e) { continue; }
      if (!stat.isFile()) continue;

      let content = null;
      try { content = fs.readFileSync(fullPath, 'utf8'); } catch (_e) { /* skip */ }

      const lineCount = content ? content.split('\n').length : 0;

      nodes[relPath] = {
        type: nodeType,
        exports: [],
        size_lines: lineCount,
        patterns: [],
        last_modified: stat.mtime.toISOString()
      };
    }
  } catch (_e) { /* skip */ }
}

/**
 * Pattern description lookup.
 * @param {string} pattern
 * @returns {string}
 */
function describePattern(pattern) {
  const descriptions = {
    'dispatch': 'Hook dispatch pattern',
    'commonjs-lib': 'CJS library module',
    'hook-lifecycle': 'Hook lifecycle pattern (logHook, exit codes)'
  };
  return descriptions[pattern] || pattern;
}

/**
 * Pattern convention lookup.
 * @param {string} pattern
 * @returns {string}
 */
function conventionFor(pattern) {
  const conventions = {
    'dispatch': 'Sequential check chain with early return',
    'commonjs-lib': 'module.exports at bottom',
    'hook-lifecycle': 'logHook for audit trail, exit code 0 or 2'
  };
  return conventions[pattern] || '';
}

// ─── Graph Loading ───────────────────────────────────────────────────────────

/**
 * Load existing graph.json from disk.
 * @param {string} planningDir - Path to .planning directory
 * @returns {object|null}
 */
function loadGraph(planningDir) {
  return safeReadJson(path.join(planningDir, GRAPH_FILE));
}

// ─── Graph Querying ──────────────────────────────────────────────────────────

/**
 * Query a node's connections in the graph.
 *
 * @param {object} graph - The graph object
 * @param {string} nodeId - File path to query
 * @param {object} [opts] - Options
 * @param {number} [opts.depth=1] - Traversal depth
 * @param {string} [opts.direction='both'] - 'dependents'|'dependencies'|'both'
 * @returns {{ node: object|null, dependents: string[], dependencies: string[], impact_radius: number }}
 */
function queryGraph(graph, nodeId, opts = {}) {
  if (!graph || !graph.nodes) {
    return { node: null, dependents: [], dependencies: [], impact_radius: 0 };
  }

  const node = graph.nodes[nodeId] || null;
  const depth = opts.depth || 1;
  const direction = opts.direction || 'both';

  const dependents = new Set();
  const dependencies = new Set();

  if (node) {
    if (direction === 'both' || direction === 'dependents') {
      collectTransitive(graph, nodeId, 'dependents', depth, dependents);
    }
    if (direction === 'both' || direction === 'dependencies') {
      collectTransitive(graph, nodeId, 'dependencies', depth, dependencies);
    }
  }

  const depArray = [...dependents];
  const depsArray = [...dependencies];

  return {
    node,
    dependents: depArray,
    dependencies: depsArray,
    impact_radius: depArray.length + depsArray.length
  };
}

/**
 * Collect transitive connections.
 * @param {object} graph
 * @param {string} nodeId
 * @param {string} direction - 'dependents' or 'dependencies'
 * @param {number} maxDepth
 * @param {Set} result
 * @param {number} [currentDepth=0]
 */
function collectTransitive(graph, nodeId, direction, maxDepth, result, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;

  const edges = graph.edges || [];
  let neighbors;

  if (direction === 'dependents') {
    // Files that import nodeId (nodeId is the target)
    neighbors = edges.filter(e => e.to === nodeId).map(e => e.from);
  } else {
    // Files that nodeId imports (nodeId is the source)
    neighbors = edges.filter(e => e.from === nodeId).map(e => e.to);
  }

  for (const neighbor of neighbors) {
    if (!result.has(neighbor) && neighbor !== nodeId) {
      result.add(neighbor);
      collectTransitive(graph, neighbor, direction, maxDepth, result, currentDepth + 1);
    }
  }
}

// ─── Impact Analysis ─────────────────────────────────────────────────────────

/**
 * Get all transitively dependent files (blast radius).
 * @param {object} graph
 * @param {string} filePath
 * @returns {string[]}
 */
function getImpactedFiles(graph, filePath) {
  if (!graph || !graph.nodes) return [];

  const impacted = new Set();
  collectTransitive(graph, filePath, 'dependents', 100, impacted);
  return [...impacted];
}

// ─── Incremental Update ──────────────────────────────────────────────────────

/**
 * Update a single node and its edges without full rebuild.
 * @param {string} planningDir
 * @param {string} projectRoot
 * @param {string} changedFile - Relative path of the changed file
 * @returns {object} Updated graph
 */
function updateGraphIncremental(planningDir, projectRoot, changedFile) {
  const graphPath = path.join(planningDir, GRAPH_FILE);
  let graph = safeReadJson(graphPath);

  if (!graph) {
    // No existing graph -- do full build
    return buildGraph(planningDir, projectRoot);
  }

  // Re-read intel data for this file
  const filesData = safeReadJson(path.join(planningDir, 'intel', 'files.json'));
  const fileEntry = filesData && filesData.entries ? filesData.entries[changedFile] : null;

  // Remove old edges from/to this file
  graph.edges = (graph.edges || []).filter(e => e.from !== changedFile && e.to !== changedFile);

  if (fileEntry) {
    // Update/create node
    graph.nodes[changedFile] = {
      type: fileEntry.type || classifyNodeType(changedFile),
      exports: fileEntry.exports || [],
      size_lines: fileEntry.lines || fileEntry.size_lines || 0,
      patterns: [],
      last_modified: fileEntry.last_modified || new Date().toISOString()
    };

    // Re-create import edges
    if (fileEntry.imports && Array.isArray(fileEntry.imports)) {
      for (const imp of fileEntry.imports) {
        graph.edges.push({ from: changedFile, to: imp, type: 'import' });
      }
    }

    // Detect patterns
    const fullPath = projectRoot ? path.join(projectRoot, changedFile) : changedFile;
    let content = null;
    try {
      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, 'utf8');
      }
    } catch (_e) { /* skip */ }

    graph.nodes[changedFile].patterns = detectPatterns(changedFile, content);
  } else if (!graph.nodes[changedFile]) {
    // New file not in intel -- create minimal node
    const fullPath = projectRoot ? path.join(projectRoot, changedFile) : changedFile;
    let lineCount = 0;
    try {
      if (fs.existsSync(fullPath)) {
        lineCount = fs.readFileSync(fullPath, 'utf8').split('\n').length;
      }
    } catch (_e) { /* skip */ }

    graph.nodes[changedFile] = {
      type: classifyNodeType(changedFile),
      exports: [],
      size_lines: lineCount,
      patterns: [],
      last_modified: new Date().toISOString()
    };
  }

  // Update meta
  graph._meta = {
    ...graph._meta,
    updated_at: new Date().toISOString(),
    node_count: Object.keys(graph.nodes).length,
    edge_count: graph.edges.length
  };

  // Write back
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');

  return graph;
}

// ─── Health Checks ───────────────────────────────────────────────────────────

/**
 * Health check for architecture_graph feature.
 * @param {string} planningDir
 * @returns {{ feature: string, status: string, reason?: string, nodes?: number, edges?: number, last_updated?: string }}
 */
function graphHealthCheck(planningDir) {
  if (!isGraphEnabled(planningDir)) {
    return { feature: 'architecture_graph', status: 'disabled' };
  }

  const graphPath = path.join(planningDir, GRAPH_FILE);
  if (!fs.existsSync(graphPath)) {
    return {
      feature: 'architecture_graph',
      status: 'degraded',
      reason: 'graph.json not found -- run pbr-tools graph build'
    };
  }

  const graph = safeReadJson(graphPath);
  if (!graph || !graph._meta) {
    return {
      feature: 'architecture_graph',
      status: 'degraded',
      reason: 'graph.json could not be parsed'
    };
  }

  const updatedAt = graph._meta.updated_at;
  if (updatedAt) {
    const age = Date.now() - new Date(updatedAt).getTime();
    if (age > STALE_MS) {
      return {
        feature: 'architecture_graph',
        status: 'degraded',
        reason: 'graph.json stale',
        last_updated: updatedAt
      };
    }
  }

  return {
    feature: 'architecture_graph',
    status: 'healthy',
    nodes: graph._meta.node_count,
    edges: graph._meta.edge_count
  };
}

/**
 * Health check for architecture_guard feature.
 * @param {string} planningDir
 * @returns {{ feature: string, status: string }}
 */
function guardHealthCheck(planningDir) {
  if (!isGuardEnabled(planningDir)) {
    return { feature: 'architecture_guard', status: 'disabled' };
  }
  return { feature: 'architecture_guard', status: 'healthy' };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Feature toggles
  isGraphEnabled,
  isGuardEnabled,

  // Core graph operations
  buildGraph,
  loadGraph,
  queryGraph,
  getImpactedFiles,
  updateGraphIncremental,

  // Health checks
  graphHealthCheck,
  guardHealthCheck,

  // Internal (exposed for testing)
  classifyNodeType,
  detectPatterns,
  safeReadJson
};
