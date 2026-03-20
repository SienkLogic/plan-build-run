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
const { logHook, getLogFilename } = require('./hook-logger');

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

// ─── Architecture guard: pattern checks (merged from architecture-guard.js) ──

const MAX_GUARD_LOG_ENTRIES = 200;

/**
 * Write an architecture_guard log entry to .planning/logs/hooks-YYYY-MM-DD.jsonl.
 * @param {string} planningDir
 * @param {string} file
 * @param {string} violation
 */
function writeGuardLog(planningDir, file, violation) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logPath = path.join(logsDir, getLogFilename());
    const entry = {
      ts: new Date().toISOString(),
      hook: 'architecture-guard',
      event: 'architecture_guard',
      decision: 'architecture_guard',
      file,
      violation
    };

    let lines = [];
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8').trim();
      if (content) lines = content.split('\n');
    }
    lines.push(JSON.stringify(entry));
    if (lines.length > MAX_GUARD_LOG_ENTRIES) lines = lines.slice(lines.length - MAX_GUARD_LOG_ENTRIES);
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging
  }
}

/**
 * Check a CJS lib module for required patterns.
 * Applies to: plan-build-run/bin/lib/*.cjs
 * @param {string} filePath - Relative file path
 * @param {string} content - File content
 * @returns {string|null} Violation message or null
 */
function checkCjsLib(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');
  if (!/plan-build-run\/bin\/lib\/[^/]+\.cjs$/.test(normalized)) return null;

  const violations = [];
  if (!/['"]use strict['"]/.test(content)) {
    violations.push("missing 'use strict' directive");
  }
  if (!/module\.exports/.test(content)) {
    violations.push('missing module.exports');
  }

  if (violations.length === 0) return null;
  return `CJS lib module ${path.basename(filePath)}: ${violations.join(', ')}. Convention: 'use strict' at top, module.exports at bottom.`;
}

/**
 * Check a hook script for required patterns.
 * Applies to: plugins/pbr/scripts/*.js
 * @param {string} filePath - Relative file path
 * @param {string} content - File content
 * @returns {string|null} Violation message or null
 */
function checkHookScript(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');
  if (!/plugins\/pbr\/scripts\/[^/]+\.js$/.test(normalized)) return null;

  const violations = [];
  if (!/logHook|hook-logger/.test(content)) {
    violations.push("missing logHook import from hook-logger");
  }
  if (!(/process\.stdin/.test(content) || /JSON\.parse/.test(content))) {
    violations.push('missing stdin read (process.stdin or JSON.parse)');
  }

  if (violations.length === 0) return null;
  return `Hook script ${path.basename(filePath)}: ${violations.join(', ')}. Convention: require hook-logger, read from process.stdin.`;
}

/**
 * Check an agent definition for required frontmatter fields.
 * Applies to: plugins/pbr/agents/*.md
 * @param {string} filePath - Relative file path
 * @param {string} content - File content
 * @returns {string|null} Violation message or null
 */
function checkAgentDef(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');
  if (!/plugins\/pbr\/agents\/[^/]+\.md$/.test(normalized)) return null;

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return `Agent definition ${path.basename(filePath)}: missing YAML frontmatter. Convention: frontmatter with name, description, tools.`;
  }

  const fm = fmMatch[1];
  const violations = [];
  if (!/\bname\s*:/.test(fm)) violations.push("missing 'name' field");
  if (!/\bdescription\s*:/.test(fm)) violations.push("missing 'description' field");
  if (!/\btools\s*:/.test(fm)) violations.push("missing 'tools' field");

  if (violations.length === 0) return null;
  return `Agent definition ${path.basename(filePath)}: ${violations.join(', ')}. Convention: YAML frontmatter with name, description, tools.`;
}

/**
 * Check a skill definition for required frontmatter fields.
 * Applies to: plugins/pbr/skills/{name}/SKILL.md
 * @param {string} filePath - Relative file path
 * @param {string} content - File content
 * @returns {string|null} Violation message or null
 */
function checkSkillDef(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');
  if (!/plugins\/pbr\/skills\/[^/]+\/SKILL\.md$/.test(normalized)) return null;

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return `Skill definition ${path.basename(path.dirname(filePath))}/SKILL.md: missing YAML frontmatter. Convention: frontmatter with name, description.`;
  }

  const fm = fmMatch[1];
  const violations = [];
  if (!/\bname\s*:/.test(fm)) violations.push("missing 'name' field");
  if (!/\bdescription\s*:/.test(fm)) violations.push("missing 'description' field");

  if (violations.length === 0) return null;
  return `Skill definition ${path.basename(path.dirname(filePath))}/SKILL.md: ${violations.join(', ')}. Convention: YAML frontmatter with name, description.`;
}

/**
 * Run the architecture guard for a changed file.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} projectRoot - Path to project root
 * @param {string} changedFile - Relative path of the changed file
 * @returns {object|null} { additionalContext } if violation found, null otherwise
 */
function runGuard(planningDir, projectRoot, changedFile) {
  const normalizedFile = changedFile.replace(/\\/g, '/');

  // Check if guard is enabled
  try {
    const graphModule = require(path.resolve(__dirname, '../../..', 'plan-build-run', 'bin', 'lib', 'graph.cjs'));
    if (!graphModule.isGuardEnabled(planningDir)) {
      return null;
    }
  } catch (_e) {
    // If graph module unavailable, default to enabled
  }

  // Read file content from disk
  let content = '';
  const absPath = path.join(projectRoot, normalizedFile);
  try {
    if (fs.existsSync(absPath)) {
      content = fs.readFileSync(absPath, 'utf8');
    }
  } catch (_e) {
    return null; // Can't read file, skip check
  }

  // Run all pattern checks
  const violation = checkCjsLib(normalizedFile, content) ||
    checkHookScript(normalizedFile, content) ||
    checkAgentDef(normalizedFile, content) ||
    checkSkillDef(normalizedFile, content);

  if (!violation) return null;

  // Log the violation
  writeGuardLog(planningDir, normalizedFile, violation);

  return {
    additionalContext: `Architecture guard: ${violation}`
  };
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
    try { logHook('graph-update', 'PostToolUse', 'skip', { reason: 'inside .planning', file: normalizedFile }); } catch (_e) { /* never crash */ }
    return null;
  }

  // Skip non-source files
  if (!isSourceFile(normalizedFile)) {
    try { logHook('graph-update', 'PostToolUse', 'skip', { reason: 'non-source file', file: normalizedFile }); } catch (_e) { /* never crash */ }
    return null;
  }

  // Load graph module
  const graphModule = require(path.resolve(__dirname, '../../..', 'plan-build-run', 'bin', 'lib', 'graph.cjs'));

  // Check if graph is enabled
  if (!graphModule.isGraphEnabled(planningDir)) {
    try { logHook('graph-update', 'PostToolUse', 'skip', { reason: 'graph disabled' }); } catch (_e) { /* never crash */ }
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

  // Run architecture guard after graph update
  const guardResult = runGuard(planningDir, projectRoot, changedFile);
  if (guardResult) return guardResult;

  return null;
}

// ─── HTTP handler for hook-server.js ──────────────────────────────────────────

/**
 * HTTP handler for hook-server.js.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 *
 * @param {Object} reqBody - Request body from hook-server
 * @param {Object} _cache - In-memory server cache (unused)
 * @returns {Promise<Object|null>} Hook response or null
 */
async function handleHttp(reqBody, _cache) {
  const data = reqBody.data || {};
  const filePath = (data.tool_input && data.tool_input.file_path) || '';

  if (!filePath) return null;

  const planningDir = reqBody.planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');

  try {
    // Resolve absolute path for project root detection
    const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const resolvedPlanningDir = findPlanningDir(absFilePath) || planningDir;
    const projectRoot = path.dirname(resolvedPlanningDir);
    const relFilePath = path.relative(projectRoot, absFilePath).replace(/\\/g, '/');

    return updateGraph(resolvedPlanningDir, projectRoot, relFilePath);
  } catch (_e) {
    try { logHook('graph-update', 'PostToolUse', 'error', { error: _e.message }); } catch (__e) { /* never crash */ }
    return null;
  }
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

      try { logHook('graph-update', 'PostToolUse', 'entry', { file: filePath }); } catch (_e) { /* never crash */ }

      if (!filePath) {
        try { logHook('graph-update', 'PostToolUse', 'skip', { reason: 'no file path' }); } catch (_e) { /* never crash */ }
        process.exit(0);
        return;
      }

      // Resolve absolute path for planning dir detection
      const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
      const planningDir = findPlanningDir(absFilePath);
      if (!planningDir) {
        try { logHook('graph-update', 'PostToolUse', 'skip', { reason: 'no .planning dir', file: filePath }); } catch (_e) { /* never crash */ }
        process.exit(0);
        return;
      }

      const projectRoot = path.dirname(planningDir);
      // Get relative file path from project root
      let relFilePath = path.relative(projectRoot, absFilePath).replace(/\\/g, '/');

      const result = updateGraph(planningDir, projectRoot, relFilePath);
      if (result) {
        process.stdout.write(JSON.stringify(result));
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

module.exports = { updateGraph, findPlanningDir, isSourceFile, checkCjsLib, checkHookScript, checkAgentDef, checkSkillDef, runGuard, writeGuardLog, handleHttp };
if (require.main === module || process.argv[1] === __filename) { main(); }
