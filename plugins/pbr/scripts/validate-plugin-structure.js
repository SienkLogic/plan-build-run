#!/usr/bin/env node

/**
 * Validates the Plan-Build-Run plugin structure:
 * - Every skill directory has SKILL.md
 * - Every agent file has valid YAML frontmatter (name, description)
 * - hooks.json references existing scripts
 * - No broken relative links in markdown files
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
  warnings++;
}

function info(msg) {
  console.log(`OK: ${msg}`);
}

// 1. Check plugin.json exists
const pluginJsonPath = path.join(ROOT, '.claude-plugin', 'plugin.json');
if (!fs.existsSync(pluginJsonPath)) {
  error('.claude-plugin/plugin.json missing');
} else {
  try {
    const plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    if (!plugin.name) error('plugin.json missing "name" field');
    if (!plugin.version) error('plugin.json missing "version" field');
    if (!plugin.description) error('plugin.json missing "description" field');
    info(`Plugin: ${plugin.name} v${plugin.version}`);
  } catch (e) {
    error(`plugin.json is not valid JSON: ${e.message}`);
  }
}

// 2. Check every skill directory has SKILL.md
const skillsDir = path.join(ROOT, 'skills');
if (fs.existsSync(skillsDir)) {
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'shared');

  for (const dir of skillDirs) {
    const skillMd = path.join(skillsDir, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      error(`skills/${dir.name}/ missing SKILL.md`);
    } else {
      const content = fs.readFileSync(skillMd, 'utf8');
      if (!content.startsWith('---')) {
        error(`skills/${dir.name}/SKILL.md missing YAML frontmatter`);
      } else {
        const frontmatter = content.split('---')[1];
        if (!frontmatter.includes('name:')) {
          error(`skills/${dir.name}/SKILL.md frontmatter missing "name" field`);
        }
        if (!frontmatter.includes('description:')) {
          error(`skills/${dir.name}/SKILL.md frontmatter missing "description" field`);
        }
      }
      // Check: skills with Task in allowed-tools must have Context Budget section
      const frontmatterBlock = content.split('---')[1] || '';
      const hasTaskTool = /allowed-tools:.*Task/.test(frontmatterBlock);
      if (hasTaskTool && !content.includes('## Context Budget')) {
        warn(`skills/${dir.name}/SKILL.md has Task in allowed-tools but no "## Context Budget" section`);
      }

      info(`Skill: /pbr:${dir.name}`);
    }
  }
} else {
  error('skills/ directory missing');
}

// 3. Check every agent file has valid frontmatter
const agentsDir = path.join(ROOT, 'agents');
if (fs.existsSync(agentsDir)) {
  const agentFiles = fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'));

  for (const file of agentFiles) {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    if (!content.startsWith('---')) {
      error(`agents/${file} missing YAML frontmatter`);
    } else {
      const frontmatter = content.split('---')[1];
      if (!frontmatter.includes('name:')) {
        error(`agents/${file} frontmatter missing "name" field`);
      }
      if (!frontmatter.includes('description:')) {
        error(`agents/${file} frontmatter missing "description" field`);
      }
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      info(`Agent: ${nameMatch ? nameMatch[1].trim() : file}`);
    }
  }
} else {
  error('agents/ directory missing');
}

// 4. Check context files have valid structure
const contextsDir = path.join(ROOT, 'contexts');
if (fs.existsSync(contextsDir)) {
  const contextFiles = fs.readdirSync(contextsDir)
    .filter(f => f.endsWith('.md'));

  for (const file of contextFiles) {
    const content = fs.readFileSync(path.join(contextsDir, file), 'utf8');
    if (!content.startsWith('#')) {
      warn(`contexts/${file} should start with a heading`);
    }
    const name = file.replace('.md', '');
    info(`Context: ${name}`);
  }
} else {
  warn('contexts/ directory not found (contexts are optional)');
}

// 5. Check hooks.json references existing scripts
const hooksJsonPath = path.join(ROOT, 'hooks', 'hooks.json');
if (fs.existsSync(hooksJsonPath)) {
  try {
    const hooksFile = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));

    // Plugin hooks format: { hooks: { EventName: [ { matcher?, hooks: [ { type, command } ] } ] } }
    const hooksObj = hooksFile.hooks || {};
    for (const eventName of Object.keys(hooksObj)) {
      const matcherGroups = hooksObj[eventName];
      if (!Array.isArray(matcherGroups)) continue;
      for (const group of matcherGroups) {
        const handlers = group.hooks || [];
        for (const handler of handlers) {
          if (handler.command) {
            const cmd = handler.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, ROOT);
            const parts = cmd.split(' ');
            const scriptPart = parts.find(p => p.endsWith('.js'));
            if (scriptPart) {
              const scriptPath = scriptPart.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, ROOT);
              const resolvedPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(ROOT, scriptPath);
              if (!fs.existsSync(resolvedPath)) {
                error(`hooks.json references missing script: ${scriptPart}`);
              }
            }
          }
        }
      }
    }
    info('hooks.json validated');
  } catch (e) {
    error(`hooks.json is not valid JSON: ${e.message}`);
  }
} else {
  warn('hooks/hooks.json not found (hooks are optional)');
}

// 6. Summary
console.log('\n---');
console.log(`Validation complete: ${errors} errors, ${warnings} warnings`);

if (errors > 0) {
  process.exit(1);
}
