'use strict';

/**
 * Audit checks SI-06 through SI-12: Agent, hook, and config self-integrity.
 *
 * Each function takes pluginRoot (path to plugins/pbr/) and returns:
 *   { status: 'pass'|'warn'|'fail', evidence: string[], message: string }
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object with extracted key-value pairs (simple flat parsing).
 */
function parseFrontmatter(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return {};

  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) return {};

  const fmLines = lines.slice(1, endIdx);
  const result = {};
  let currentKey = null;
  let inArray = false;

  for (const line of fmLines) {
    // Array item
    if (inArray && /^\s+-\s+/.test(line)) {
      const val = line.replace(/^\s+-\s+/, '').trim();
      result[currentKey].push(val);
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();

      if (rawVal === '' || rawVal === '[]') {
        // Could be start of array or empty value
        result[key] = [];
        currentKey = key;
        inArray = true;
        continue;
      }

      // Inline array like [Read, Write, Edit]
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        result[key] = rawVal.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        currentKey = key;
        inArray = false;
        continue;
      }

      // Scalar value
      result[key] = rawVal.replace(/^["']|["']$/g, '');
      currentKey = key;
      inArray = false;
      continue;
    }

    // Array item under current key (indented with -)
    if (currentKey && /^\s+-\s/.test(line)) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      const val = line.replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
      result[currentKey].push(val);
      inArray = true;
      continue;
    }

    // Not a recognized line — end array mode
    inArray = false;
  }

  return result;
}

/**
 * Read all agent .md files and return array of { file, frontmatter, content }.
 */
function readAgentFiles(pluginRoot) {
  const agentsDir = path.join(pluginRoot, 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(agentsDir, f);
      const content = fs.readFileSync(filePath, 'utf8');
      return { file: f, frontmatter: parseFrontmatter(content), content };
    });
}

// ---------------------------------------------------------------------------
// SI-06: Agent Frontmatter Validity
// ---------------------------------------------------------------------------

const REQUIRED_AGENT_FIELDS = ['name', 'description', 'tools'];
const VALID_MODEL_VALUES = ['sonnet', 'opus', 'haiku', 'inherit'];

function checkAgentFrontmatterValidity(pluginRoot) {
  const agents = readAgentFiles(pluginRoot);
  const evidence = [];

  for (const agent of agents) {
    const fm = agent.frontmatter;
    const missing = REQUIRED_AGENT_FIELDS.filter(f => !fm[f] || (Array.isArray(fm[f]) && fm[f].length === 0 && f === 'tools'));

    if (missing.length > 0) {
      evidence.push(`${agent.file}: missing required fields: ${missing.join(', ')}`);
    }

    // model is optional but if present must be valid
    if (fm.model && !VALID_MODEL_VALUES.includes(fm.model)) {
      evidence.push(`${agent.file}: invalid model value "${fm.model}" (valid: ${VALID_MODEL_VALUES.join(', ')})`);
    }
  }

  if (agents.length === 0) {
    return { status: 'warn', evidence: ['No agent files found'], message: 'No agents directory or no .md files' };
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} agent frontmatter issues found`
      : `All ${agents.length} agents have valid frontmatter`,
  };
}

// ---------------------------------------------------------------------------
// SI-07: Agent Tool List Accuracy
// ---------------------------------------------------------------------------

const KNOWN_VALID_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'WebSearch', 'AskUserQuestion',
];

function checkAgentToolListAccuracy(pluginRoot) {
  const agents = readAgentFiles(pluginRoot);
  const evidence = [];

  for (const agent of agents) {
    const tools = agent.frontmatter.tools;
    if (!Array.isArray(tools)) continue;

    const unknown = tools.filter(t => !KNOWN_VALID_TOOLS.includes(t));
    if (unknown.length > 0) {
      evidence.push(`${agent.file}: unknown tools: ${unknown.join(', ')}`);
    }
  }

  return {
    status: evidence.length > 0 ? 'warn' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} agents have unknown tools (advisory)`
      : `All agent tool lists use known tools`,
  };
}

// ---------------------------------------------------------------------------
// SI-08: Hook Script Existence
// ---------------------------------------------------------------------------

function checkHookScriptExistence(pluginRoot) {
  const hooksJsonPath = path.join(pluginRoot, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) {
    return { status: 'fail', evidence: ['hooks.json not found'], message: 'Cannot locate hooks.json' };
  }

  const hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
  const hooks = hooksConfig.hooks || {};
  const evidence = [];
  const scriptsDir = path.join(pluginRoot, 'scripts');

  // Extract script filenames from hook command strings
  // Pattern: run-hook.js" {script}.js
  const scriptRegex = /run-hook\.js[)'"]*\)\s*"\s+([\w-]+\.js)/;

  for (const [_event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const hookList = entry.hooks || [];
      for (const hook of hookList) {
        const command = hook.command || '';
        const match = command.match(scriptRegex);
        if (match) {
          const scriptName = match[1];
          // The script is loaded via run-hook.js which resolves from the scripts directory
          const scriptPath = path.join(scriptsDir, scriptName);
          if (!fs.existsSync(scriptPath)) {
            evidence.push(`Missing script: ${scriptName} (referenced in hooks.json)`);
          }
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} hook scripts missing`
      : 'All hook scripts exist',
  };
}

// ---------------------------------------------------------------------------
// SI-09: PreToolUse Stdout Compliance
// ---------------------------------------------------------------------------

function checkPreToolUseStdoutCompliance(pluginRoot) {
  const hooksJsonPath = path.join(pluginRoot, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) {
    return { status: 'fail', evidence: ['hooks.json not found'], message: 'Cannot locate hooks.json' };
  }

  const hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
  const hooks = hooksConfig.hooks || {};
  const preToolUseEntries = hooks.PreToolUse || [];
  const evidence = [];
  const scriptsDir = path.join(pluginRoot, 'scripts');

  const scriptRegex = /run-hook\.js[)'"]*\)\s*"\s+([\w-]+\.js)/;

  for (const entry of preToolUseEntries) {
    const hookList = entry.hooks || [];
    for (const hook of hookList) {
      const command = hook.command || '';
      const match = command.match(scriptRegex);
      if (!match) continue;

      const scriptName = match[1];
      const scriptPath = path.join(scriptsDir, scriptName);

      if (!fs.existsSync(scriptPath)) continue; // SI-08 handles missing scripts

      const source = fs.readFileSync(scriptPath, 'utf8');

      // Check for JSON stdout emission patterns
      const hasStdoutWrite = /process\.stdout\.write\s*\(\s*JSON\.stringify\s*\(/.test(source);
      const hasConsoleLog = /console\.log\s*\(\s*JSON\.stringify\s*\(/.test(source);

      if (!hasStdoutWrite && !hasConsoleLog) {
        evidence.push(`${scriptName}: no JSON stdout emission detected (PreToolUse hooks MUST emit JSON on stdout)`);
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} PreToolUse hooks lack JSON stdout emission`
      : 'All PreToolUse hooks emit JSON on stdout',
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkAgentFrontmatterValidity,
  checkAgentToolListAccuracy,
  checkHookScriptExistence,
  checkPreToolUseStdoutCompliance,
};
