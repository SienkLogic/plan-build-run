#!/usr/bin/env node

/**
 * PostToolUse hook for Write|Edit: Architecture consistency guard.
 *
 * Checks written files for architecture pattern conformance:
 *   - CJS lib modules (plan-build-run/bin/lib/*.cjs): must have 'use strict' + module.exports
 *   - Hook scripts (plugins/pbr/scripts/*.js): must require hook-logger and read stdin
 *   - Agent definitions (plugins/pbr/agents/*.md): must have name, description, tools frontmatter
 *   - Skill definitions (plugins/pbr/skills/{name}/SKILL.md): must have name, description frontmatter
 *
 * Returns null when no violations found, or { additionalContext } with violation details.
 * Logs violations to .planning/logs/hooks.jsonl with event type "architecture_guard".
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook, getLogFilename } = require('./hook-logger');

// ─── Log helper: write directly to planningDir ────────────────────────────────

const MAX_LOG_ENTRIES = 200;

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
    if (lines.length > MAX_LOG_ENTRIES) lines = lines.slice(lines.length - MAX_LOG_ENTRIES);
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  } catch (_e) {
    // Best-effort logging
  }
}

// ─── Pattern checks (exported for testing) ────────────────────────────────────

/**
 * Check a CJS lib module for required patterns.
 * Applies to: plan-build-run/bin/lib/*.cjs
 * @param {string} filePath - Relative file path
 * @param {string} content - File content
 * @returns {string|null} Violation message or null
 */
function checkCjsLib(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');
  // Only apply to lib/*.cjs files
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
  // Only apply to hook scripts
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

  // Check for YAML frontmatter
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

// ─── Core guard logic (exported for testing) ─────────────────────────────────

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

      // Resolve absolute path
      const absFilePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

      // Find planningDir by walking up
      const { findPlanningDir } = require('./graph-update.js');
      const planningDir = findPlanningDir(absFilePath);
      if (!planningDir) {
        process.exit(0);
        return;
      }

      const projectRoot = path.dirname(planningDir);
      const relFilePath = path.relative(projectRoot, absFilePath).replace(/\\/g, '/');

      const result = runGuard(planningDir, projectRoot, relFilePath);
      if (result) {
        process.stdout.write(JSON.stringify(result));
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

module.exports = { checkCjsLib, checkHookScript, checkAgentDef, checkSkillDef, runGuard };
if (require.main === module || process.argv[1] === __filename) { main(); }
