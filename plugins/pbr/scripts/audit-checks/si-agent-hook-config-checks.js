'use strict';

/**
 * Audit checks SI-06 through SI-12: Agent, hook, and config self-integrity.
 *
 * Each function takes pluginRoot (path to plugins/pbr/) and returns:
 *   { status: 'pass'|'warn'|'fail', evidence: string[], message: string }
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('../lib/frontmatter');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      return { file: f, frontmatter: extractFrontmatter(content), content };
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
// SI-10: Command-Skill Mapping Validity
// ---------------------------------------------------------------------------

function checkCommandSkillMapping(pluginRoot) {
  // Commands are at repo root: commands/pbr/*.md
  // pluginRoot is plugins/pbr/, so repo root is ../../
  const repoRoot = path.resolve(pluginRoot, '..', '..');
  const commandsDir = path.join(repoRoot, 'commands', 'pbr');
  const skillsDir = path.join(pluginRoot, 'skills');
  const evidence = [];

  if (!fs.existsSync(commandsDir)) {
    return { status: 'warn', evidence: ['commands/pbr/ directory not found'], message: 'Cannot locate commands directory' };
  }

  const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));

  for (const cmdFile of commandFiles) {
    const filePath = path.join(commandsDir, cmdFile);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract skill reference from text like `pbr:{skill-name}`
    // Some commands are inline (no skill delegation) — skip those
    const skillMatch = content.match(/`pbr:([\w-]+)`/);
    if (!skillMatch) continue;

    const skillName = skillMatch[1];
    const skillDir = path.join(skillsDir, skillName);

    if (!fs.existsSync(skillDir)) {
      evidence.push(`${cmdFile}: references skill "${skillName}" but ${path.join('skills', skillName)} does not exist`);
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} command-skill mapping issues found`
      : `All ${commandFiles.length} commands map to existing skills`,
  };
}

// ---------------------------------------------------------------------------
// SI-11: Config Schema-Code Consistency
// ---------------------------------------------------------------------------

/**
 * Recursively extract all property paths from a JSON Schema.
 * Returns flat array of dot-separated paths (e.g., "features.tdd_mode").
 */
function extractSchemaPropertyPaths(schema, prefix) {
  const paths = [];
  const props = schema.properties || {};

  for (const [key, def] of Object.entries(props)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.push(fullPath);

    // Recurse into nested objects
    if (def.type === 'object' && def.properties) {
      paths.push(...extractSchemaPropertyPaths(def, fullPath));
    }
  }

  return paths;
}

function checkConfigSchemaCodeConsistency(pluginRoot) {
  const schemaPath = path.join(pluginRoot, 'scripts', 'config-schema.json');
  if (!fs.existsSync(schemaPath)) {
    return { status: 'warn', evidence: ['config-schema.json not found'], message: 'Cannot locate schema file' };
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const schemaPaths = new Set(extractSchemaPropertyPaths(schema, ''));
  const evidence = [];

  // Scan key config-consuming files
  const configFiles = [
    path.join(pluginRoot, 'scripts', 'lib', 'config.js'),
  ];

  const codeKeys = new Set();

  for (const configFile of configFiles) {
    if (!fs.existsSync(configFile)) continue;

    const source = fs.readFileSync(configFile, 'utf8');

    // Match config.{key} or config.{key}.{subkey} patterns
    // Exclude file extensions (config.js, config.json, config.cjs) and method calls
    const dotAccessRegex = /\bconfig\.(\w+(?:\.\w+)*)/g;
    let match;
    while ((match = dotAccessRegex.exec(source)) !== null) {
      const key = match[1];
      // Skip file extensions and common non-property patterns
      if (/^(js|json|cjs|mjs|ts|yaml|yml|md|txt)$/.test(key)) continue;
      if (/^(js|json|cjs|mjs|ts|yaml|yml|md|txt)\./.test(key)) continue;
      codeKeys.add(key);
    }

    // Match config['{key}'] patterns
    const bracketAccessRegex = /config\[['"](\w+(?:\.\w+)*)['"]\]/g;
    while ((match = bracketAccessRegex.exec(source)) !== null) {
      codeKeys.add(match[1]);
    }
  }

  // Check for keys in code but not in schema (ignore common false positives)
  const ignoredCodeKeys = new Set(['audit', 'version', 'schema_version']);
  for (const key of codeKeys) {
    // Only check top-level key portion
    const topLevel = key.split('.')[0];
    if (ignoredCodeKeys.has(topLevel)) continue;
    if (!schemaPaths.has(key) && !schemaPaths.has(topLevel)) {
      evidence.push(`Code references config.${key} but not found in schema`);
    }
  }

  return {
    status: evidence.length > 0 ? 'warn' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} config key consistency issues (advisory)`
      : 'Config schema and code are consistent',
  };
}

// ---------------------------------------------------------------------------
// SI-12: Plugin Manifest Version Sync
// ---------------------------------------------------------------------------

function checkPluginManifestVersionSync(pluginRoot) {
  const repoRoot = path.resolve(pluginRoot, '..', '..');
  const evidence = [];

  // Read package.json version
  const packageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { status: 'fail', evidence: ['package.json not found at repo root'], message: 'Cannot locate package.json' };
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const expectedVersion = packageJson.version;

  // Check PBR plugin.json
  const pbrPluginJson = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(pbrPluginJson)) {
    const pbrManifest = JSON.parse(fs.readFileSync(pbrPluginJson, 'utf8'));
    if (pbrManifest.version && pbrManifest.version !== expectedVersion) {
      evidence.push(`plugins/pbr/.claude-plugin/plugin.json: version "${pbrManifest.version}" != package.json "${expectedVersion}"`);
    }
  }

  // Check cursor-pbr plugin.json (optional)
  const cursorPluginJson = path.join(repoRoot, 'plugins', 'cursor-pbr', '.cursor-plugin', 'plugin.json');
  if (fs.existsSync(cursorPluginJson)) {
    const cursorManifest = JSON.parse(fs.readFileSync(cursorPluginJson, 'utf8'));
    if (cursorManifest.version && cursorManifest.version !== expectedVersion) {
      evidence.push(`plugins/cursor-pbr/.cursor-plugin/plugin.json: version "${cursorManifest.version}" != package.json "${expectedVersion}"`);
    }
  }

  // Check copilot-pbr plugin.json (optional)
  const copilotPluginJson = path.join(repoRoot, 'plugins', 'copilot-pbr', 'plugin.json');
  if (fs.existsSync(copilotPluginJson)) {
    const copilotManifest = JSON.parse(fs.readFileSync(copilotPluginJson, 'utf8'));
    if (copilotManifest.version && copilotManifest.version !== expectedVersion) {
      evidence.push(`plugins/copilot-pbr/plugin.json: version "${copilotManifest.version}" != package.json "${expectedVersion}"`);
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} version mismatches found`
      : `All plugin manifests match package.json version ${expectedVersion}`,
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
  checkCommandSkillMapping,
  checkConfigSchemaCodeConsistency,
  checkPluginManifestVersionSync,
};
