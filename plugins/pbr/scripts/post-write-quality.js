#!/usr/bin/env node

/**
 * PostToolUse quality check hook for Write|Edit.
 *
 * Runs opt-in code quality checks on modified JS/TS files:
 *   1. autoFormat:        Run Prettier on the file (requires local installation)
 *   2. typeCheck:         Run tsc --noEmit filtered to the edited file (requires local typescript)
 *   3. detectConsoleLogs: Warn about console.log statements left in the file
 *
 * All checks disabled by default. Enable via .planning/config.json:
 *   { "hooks": { "autoFormat": true, "typeCheck": true, "detectConsoleLogs": true } }
 *
 * Only processes JS/TS files (.js, .jsx, .ts, .tsx, .mjs, .cjs).
 * Silently skips if tools (prettier, tsc) are not installed in the project.
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { logHook } = require('./hook-logger');

const JS_TS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = checkQuality(data);
      if (result) {
        process.stdout.write(JSON.stringify(result.output));
      }
      process.exit(0);
    } catch (_e) {
      process.exit(0);
    }
  });
}

/**
 * Core quality check logic for use by dispatchers or standalone.
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @returns {null|{output: Object}} null if no checks fired, result otherwise
 */
function checkQuality(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  const ext = path.extname(filePath).toLowerCase();
  if (!JS_TS_EXTENSIONS.has(ext)) return null;

  const cwd = process.cwd();
  const config = loadHooksConfig(cwd);

  // No quality hooks enabled — early exit
  if (!config.autoFormat && !config.typeCheck && !config.detectConsoleLogs) return null;

  const messages = [];

  // 1. Auto-format with Prettier
  if (config.autoFormat) {
    const msg = runPrettier(filePath, cwd);
    if (msg) messages.push(msg);
  }

  // 2. TypeScript type-check (only for .ts/.tsx)
  if (config.typeCheck && TS_EXTENSIONS.has(ext)) {
    const msg = runTypeCheck(filePath, cwd);
    if (msg) messages.push(msg);
  }

  // 3. Console.log detection
  if (config.detectConsoleLogs) {
    const msg = detectConsoleLogs(filePath);
    if (msg) messages.push(msg);
  }

  if (messages.length === 0) return null;

  logHook('post-write-quality', 'PostToolUse', 'quality-check', {
    file: path.basename(filePath),
    checks: messages.length
  });

  return {
    output: {
      additionalContext: messages.join('\n')
    }
  };
}

/**
 * Load the hooks section from .planning/config.json.
 * Returns {} if not found or not configured.
 */
function loadHooksConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.hooks || {};
  } catch (_e) {
    return {};
  }
}

/**
 * Find a locally installed binary in node_modules/.bin/.
 * Returns the full path or null if not found.
 */
function findLocalBin(cwd, name) {
  const candidates = process.platform === 'win32'
    ? [path.join(cwd, 'node_modules', '.bin', name + '.cmd'),
      path.join(cwd, 'node_modules', '.bin', name)]
    : [path.join(cwd, 'node_modules', '.bin', name)];
  return candidates.find(c => fs.existsSync(c)) || null;
}

/**
 * Run Prettier on the file. Returns a message string or null.
 */
function runPrettier(filePath, cwd) {
  const bin = findLocalBin(cwd, 'prettier');
  if (!bin) return null;

  try {
    execSync(`"${bin}" --write "${filePath}"`, {
      cwd,
      timeout: 15000,
      stdio: 'pipe',
    });
    return `[Auto-format] Prettier reformatted ${path.basename(filePath)}. File on disk may differ from context — re-read before further edits.`;
  } catch (_e) {
    // Prettier failed (syntax error, unsupported file, etc.) — skip
    return null;
  }
}

/**
 * Run tsc --noEmit and filter to errors in the modified file.
 * Returns a message string or null.
 */
function runTypeCheck(filePath, cwd) {
  const bin = findLocalBin(cwd, 'tsc');
  if (!bin) return null;
  if (!fs.existsSync(path.join(cwd, 'tsconfig.json'))) return null;

  try {
    execSync(`"${bin}" --noEmit`, {
      cwd,
      timeout: 30000,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return null; // Clean pass — no errors
  } catch (e) {
    const output = (e.stdout || '').toString();
    const basename = path.basename(filePath);
    const relevantLines = output.split('\n')
      .filter(line => line.includes(basename) && /error TS\d+/.test(line));

    if (relevantLines.length === 0) return null;
    const detail = relevantLines.slice(0, 3).join('\n  ');
    const extra = relevantLines.length > 3 ? `\n  ...and ${relevantLines.length - 3} more` : '';
    return `[Type Check] ${relevantLines.length} error(s) in ${basename}:\n  ${detail}${extra}`;
  }
}

/**
 * Scan file for console.log statements. Returns a message string or null.
 */
function detectConsoleLogs(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const matches = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*\/\//.test(line)) continue; // skip single-line comments
      if (/\bconsole\.log\s*\(/.test(line)) {
        matches.push({ line: i + 1, text: line.trim().substring(0, 80) });
      }
    }

    if (matches.length === 0) return null;

    const detail = matches.slice(0, 3).map(m => `  L${m.line}: ${m.text}`).join('\n');
    const extra = matches.length > 3 ? `\n  ...and ${matches.length - 3} more` : '';
    return `[Console.log] ${matches.length} console.log(s) in ${path.basename(filePath)}:\n${detail}${extra}`;
  } catch (_e) {
    return null;
  }
}

module.exports = { checkQuality, loadHooksConfig, findLocalBin, runPrettier, runTypeCheck, detectConsoleLogs };
if (require.main === module) { main(); }
