#!/usr/bin/env node

/**
 * PostToolUse hook for Write|Edit: Incrementally updates the architecture graph
 * when source files are written or edited.
 *
 * - Parses stdin JSON for tool_input.file_path (the file just written/edited)
 * - Determines planningDir by walking up ancestors from the file path
 * - Skips files inside .planning/ (avoid self-referential updates)
 * - Skips non-source files (.md, .json, .txt, .log)
 * - Calls isGraphEnabled() from graph.cjs; returns null if disabled
 * - Calls loadGraph(); if missing, calls buildGraph() for initial build
 * - Otherwise calls updateGraphIncremental() for incremental update
 * - Logs to .planning/logs/hooks.jsonl with event type "graph_update"
 * - Returns null (PostToolUse no-block)
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

// Source extensions to process
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);

// ─── Helper: find .planning directory by walking up ──────────────────────────

/**
 * Walk up the directory tree from filePath to find the nearest .planning/ directory.
 * @param {string} filePath - Absolute file path
 * @returns {string|null} Absolute path to .planning/, or null if not found
 */
function findPlanningDir(filePath) {
  let dir = path.isAbsolute(filePath) ? path.dirname(filePath) : path.dirname(path.resolve(filePath));
  const root = path.parse(dir).root;

  // Don't walk too deep (max 20 levels)
  let depth = 0;
  while (dir !== root && depth < 20) {
    const candidate = path.join(dir, '.planning');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // at root
    dir = parent;
    depth++;
  }
  return null;
}

// ─── Helper: check if a file is a source file we should process ──────────────

/**
 * Check if a file path represents a processable source file.
 * @param {string} filePath - File path (relative or absolute)
 * @returns {boolean}
 */
function isSourceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

// ─── Log helper: write directly to planningDir to avoid CWD dependency ───────

const MAX_LOG_ENTRIES = 200;

/**
 * Write a graph_update log entry to .planning/logs/hooks.jsonl.
 * Bypasses hook-logger's CWD dependency so tests with temp dirs work correctly.
 * @param {string} planningDir
 * @param {string} file - Changed file path
 * @param {number} nodes - Node count
 */
function writeGraphUpdateLog(planningDir, file, nodes) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, 'hooks.jsonl');
    const entry = {
      ts: new Date().toISOString(),
      hook: 'graph-update',
      event: 'graph_update',
      decision: 'graph_update',
      file,
      nodes
    };

    let lines = [];
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8').trim();
      if (content) lines = content.split('\n');
    }
    lines.push(JSON.stringify(entry));
    if (lines.length > MAX_LOG_ENTRIES) lines = lines.slice(lines.length - MAX_LOG_ENTRIES);
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  } catch (_e) {
    // Best-effort — never fail the hook
  }
}

// ─── Core update logic (exported for testing) ─────────────────────────────────

/**
 * Run the graph update for a changed file.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} projectRoot - Path to project root
 * @param {string} changedFile - Relative path of the changed file
 * @returns {null} Always returns null (no block)
 */
function updateGraph(planningDir, projectRoot, changedFile) {
  // Normalize changedFile to relative form
  const normalizedFile = changedFile.replace(/\\/g, '/');

  // Skip files inside .planning/
  if (normalizedFile.includes('.planning/') || normalizedFile.startsWith('.planning')) {
    return null;
  }

  // Skip non-source files
  if (!isSourceFile(normalizedFile)) {
    return null;
  }

  // Load graph module
  const graphModule = require(path.resolve(__dirname, '../../..', 'plan-build-run', 'bin', 'lib', 'graph.cjs'));

  // Check if graph is enabled
  if (!graphModule.isGraphEnabled(planningDir)) {
    return null;
  }

  // Load existing graph or do a full build
  let graph = graphModule.loadGraph(planningDir);
  if (!graph) {
    graph = graphModule.buildGraph(planningDir, projectRoot);
  } else {
    graph = graphModule.updateGraphIncremental(planningDir, projectRoot, normalizedFile);
  }

  // Log the update directly to the planningDir logs
  const nodeCount = (graph && graph._meta && graph._meta.node_count) || 0;
  writeGraphUpdateLog(planningDir, normalizedFile, nodeCount);

  return null;
}

// ─── Main (stdin-based hook entry point) ─────────────────────────────────────

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const filePath = (data.tool_input && data.tool_input.file_path) || '';
      if (!filePath) {
        process.exit(0);
        return;
      }

      // Resolve absolute path for planning dir detection
      const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      const planningDir = findPlanningDir(absFilePath);
      if (!planningDir) {
        process.exit(0);
        return;
      }

      const projectRoot = path.dirname(planningDir);
      // Get relative file path from project root
      let relFilePath = path.relative(projectRoot, absFilePath).replace(/\\/g, '/');

      updateGraph(planningDir, projectRoot, relFilePath);
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

module.exports = { updateGraph, findPlanningDir, isSourceFile };
if (require.main === module || process.argv[1] === __filename) { main(); }
