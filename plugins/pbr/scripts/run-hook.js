#!/usr/bin/env node

/**
 * Hook wrapper that normalizes CLAUDE_PLUGIN_ROOT paths on Windows.
 *
 * Problem: On Windows with Git Bash, ${CLAUDE_PLUGIN_ROOT} expands to
 * a MSYS-style path like /d/Repos/project/plugins/pbr. Node.js on Windows
 * interprets this as D:\d\Repos\... (relative to drive root),
 * causing MODULE_NOT_FOUND errors.
 *
 * Invocation from hooks.json (bootstrap pattern):
 *   "node -e \"require(require('path').resolve(
 *     (function(r){var m=r.match(/^\\/([a-zA-Z])\\/(.*)/);
 *      return m?m[1]+':'+m[2].replace(/\\//g,'\\\\'):r})
 *     (process.env.CLAUDE_PLUGIN_ROOT||''),
 *     'scripts','run-hook.js'))(process.argv[1])\" <script> [args...]"
 *
 * Or directly (when CLAUDE_PLUGIN_ROOT resolves correctly):
 *   "node ${CLAUDE_PLUGIN_ROOT}/scripts/run-hook.js <script-name> [args...]"
 */

'use strict';

const path = require('path');

/**
 * Fix MSYS-style paths on Windows.
 * Converts /d/Repos/... to D:\Repos\...
 */
function fixMsysPath(p) {
  if (!p) return p;
  const match = p.match(/^\/([a-zA-Z])\/(.*)/);
  if (match) {
    return match[1].toUpperCase() + ':\\' + match[2].replace(/\//g, '\\');
  }
  return p;
}

// Fix CLAUDE_PLUGIN_ROOT in environment
const pluginRoot = fixMsysPath(process.env.CLAUDE_PLUGIN_ROOT || '');

// When invoked via `node -e "..." scriptName`, process.argv is:
//   [node, scriptName, ...extra]
// When invoked via `node run-hook.js scriptName`, process.argv is:
//   [node, run-hook.js, scriptName, ...extra]
// Detect which case we're in:
const invokedViaEval = !process.argv[1] ||
  !process.argv[1].endsWith('run-hook.js');

let scriptName, scriptArgs;
if (invokedViaEval) {
  // Called as module: exports a function, or check argv[1]
  scriptName = process.argv[1] || null;
  scriptArgs = process.argv.slice(2);
} else {
  // Called directly: node run-hook.js <script> [args...]
  scriptName = process.argv[2] || null;
  scriptArgs = process.argv.slice(3);
}

// When required as a module from -e bootstrap, export a runner function
if (typeof module !== 'undefined' && module.exports) {
  const BOOTSTRAP_SNIPPET = "node -e \"var r=process.env.CLAUDE_PLUGIN_ROOT||'',m=r.match(/^\\/([a-zA-Z])\\/(.*)/);if(m)r=m[1]+String.fromCharCode(58)+String.fromCharCode(92)+m[2];require(require('path').resolve(r,'scripts','run-hook.js'))\"";
  module.exports = runScript;
  module.exports.BOOTSTRAP_SNIPPET = BOOTSTRAP_SNIPPET;
  module.exports.runScript = runScript;
}

// If we have a script name, run it immediately
if (scriptName) {
  runScript(scriptName, scriptArgs);
}

function runScript(name, args) {
  args = args || [];
  // Try __dirname first, then pluginRoot
  const candidates = [
    path.resolve(__dirname, name),
    pluginRoot ? path.resolve(pluginRoot, 'scripts', name) : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      process.argv = [process.argv[0], candidate, ...args];
      require(candidate);
      return;
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }

  process.stderr.write(`run-hook: cannot find script: ${name}\n`);
  process.stderr.write(`  searched: ${candidates.join(', ')}\n`);
  process.exit(1);
}
