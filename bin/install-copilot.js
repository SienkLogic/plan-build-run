#!/usr/bin/env node
/* eslint-env node */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = {
  local: args.includes('--local'),
  global: args.includes('--global'),
  dryRun: args.includes('--dry-run'),
  clean: args.includes('--clean'),
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`
Usage: install-copilot [options]

Install Plan-Build-Run for GitHub Copilot.

Options:
  --local      Install to .github/ in current working directory (default)
  --global     Install to ~/.copilot/
  --dry-run    Show what would be written without writing
  --clean      Remove previously installed PBR files before installing
  -h, --help   Show this help message
`);
  process.exit(0);
}

if (flags.local && flags.global) {
  console.error('Error: --local and --global are mutually exclusive.');
  process.exit(1);
}

// Default to local
if (!flags.local && !flags.global) {
  flags.local = true;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const PBR_SOURCE = path.resolve(__dirname, '..', 'plugins', 'pbr');
const TARGET = flags.global
  ? path.join(os.homedir(), '.copilot')
  : path.join(process.cwd(), '.github');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!flags.dryRun) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  if (flags.dryRun) {
    console.log(`  [dry-run] would write: ${filePath}`);
  } else {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  Warning: source not found, skipping: ${src}`);
    return false;
  }
  const content = fs.readFileSync(src, 'utf8');
  writeFile(dest, content);
  return true;
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    if (flags.dryRun) {
      console.log(`  [dry-run] would remove: ${filePath}`);
    } else {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
    return true;
  }
  return false;
}

/** List files in a directory matching a pattern, or return [] if dir missing. */
function listFiles(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(filter || (() => true));
}

/** List subdirectories in a directory, or return [] if dir missing. */
function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

// ---------------------------------------------------------------------------
// Frontmatter transforms
// ---------------------------------------------------------------------------

function transformAgentFrontmatter(content) {
  return content.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_match, fm) => {
    const lines = fm.split(/\r?\n/);
    const keepLines = [];
    let inToolsList = false;
    for (const line of lines) {
      if (/^model\s*:/.test(line)) { inToolsList = false; continue; }
      if (/^memory\s*:/.test(line)) { inToolsList = false; continue; }
      if (/^tools\s*:/.test(line)) { inToolsList = true; continue; }
      if (/^color\s*:/.test(line)) { inToolsList = false; continue; }
      if (/^isolation\s*:/.test(line)) { inToolsList = false; continue; }
      if (/^permissionMode\s*:/.test(line)) { inToolsList = false; continue; }
      if (inToolsList && /^\s+-/.test(line)) { continue; }
      if (inToolsList && line.trim() !== '') { inToolsList = false; }
      keepLines.push(line);
    }
    return '---\n' + keepLines.join('\n') + '\n---';
  });
}

function stripSkillFrontmatterFields(content) {
  return content.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_match, fm) => {
    const lines = fm.split(/\r?\n/);
    const keepLines = lines.filter(line => {
      if (/^allowed-tools\s*:/.test(line)) return false;
      if (/^argument-hint\s*:/.test(line)) return false;
      return true;
    });
    return '---\n' + keepLines.join('\n') + '\n---';
  });
}

// ---------------------------------------------------------------------------
// Body text transforms (shared between agents and skills)
// ---------------------------------------------------------------------------

function transformBody(content) {
  // Replace ${CLAUDE_PLUGIN_ROOT} with ${PLUGIN_ROOT}
  content = content.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '${PLUGIN_ROOT}');
  // Replace whole-word "subagents" with "agents" (preserve subagent_type)
  content = content.replace(/\bsubagents\b/g, 'agents');
  return content;
}

function transformSkillBody(content) {
  content = transformBody(content);
  // Replace /pbr: command references with pbr-
  content = content.replace(/\/pbr:/g, 'pbr-');
  return content;
}

// ---------------------------------------------------------------------------
// Clean
// ---------------------------------------------------------------------------

function cleanPreviousInstall() {
  console.log('Cleaning previous PBR installation...');
  let removed = 0;

  // Remove agent files: {target}/agents/pbr-*.agent.md
  const agentsDir = path.join(TARGET, 'agents');
  for (const f of listFiles(agentsDir, n => /^pbr-.*\.agent\.md$/.test(n))) {
    if (removeIfExists(path.join(agentsDir, f))) removed++;
  }

  // Remove skill directories: {target}/skills/pbr-*/
  const skillsDir = path.join(TARGET, 'skills');
  for (const d of listDirs(skillsDir)) {
    if (d.startsWith('pbr-')) {
      if (removeIfExists(path.join(skillsDir, d))) removed++;
    }
  }

  // Remove hook guard scripts
  const hookScriptsDir = path.join(TARGET, 'hooks', 'scripts');
  for (const f of listFiles(hookScriptsDir, n => /^pbr-guard\./.test(n))) {
    if (removeIfExists(path.join(hookScriptsDir, f))) removed++;
  }

  // Remove hooks.json if it exists
  removeIfExists(path.join(TARGET, 'hooks', 'hooks.json'));

  // Remove commands directory (all copied verbatim)
  const commandsDir = path.join(TARGET, 'commands');
  if (removeIfExists(commandsDir)) removed++;

  // Remove references directory
  const refsDir = path.join(TARGET, 'references');
  if (removeIfExists(refsDir)) removed++;

  // Remove copilot-instructions.md
  if (removeIfExists(path.join(TARGET, 'copilot-instructions.md'))) removed++;

  console.log(`  Removed ${removed} items.\n`);
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installAgents() {
  const srcDir = path.join(PBR_SOURCE, 'agents');
  const destDir = path.join(TARGET, 'agents');
  const files = listFiles(srcDir, n => n.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    const destName = `pbr-${name}.agent.md`;
    let content = fs.readFileSync(path.join(srcDir, file), 'utf8');
    content = transformAgentFrontmatter(content);
    content = transformBody(content);
    writeFile(path.join(destDir, destName), content);
    count++;
  }

  return count;
}

function installSkills() {
  const srcDir = path.join(PBR_SOURCE, 'skills');
  const dirs = listDirs(srcDir);
  let count = 0;

  for (const dir of dirs) {
    // Skip shared directory
    if (dir === 'shared') continue;

    const skillFile = path.join(srcDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    let content = fs.readFileSync(skillFile, 'utf8');
    content = stripSkillFrontmatterFields(content);
    content = transformSkillBody(content);

    const destDir = path.join(TARGET, 'skills', `pbr-${dir}`);
    writeFile(path.join(destDir, 'SKILL.md'), content);
    count++;
  }

  return count;
}

function installCommands() {
  const srcDir = path.join(PBR_SOURCE, 'commands');
  const destDir = path.join(TARGET, 'commands');
  const files = listFiles(srcDir, n => n.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    if (!fs.existsSync(srcPath)) continue;
    let content = fs.readFileSync(srcPath, 'utf8');
    content = transformSkillBody(content);
    writeFile(path.join(destDir, file), content);
    count++;
  }

  return count;
}

function installReferences() {
  const srcDir = path.join(PBR_SOURCE, 'references');
  const destDir = path.join(TARGET, 'references');
  const files = listFiles(srcDir, n => n.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    if (!fs.existsSync(srcPath)) continue;
    let content = fs.readFileSync(srcPath, 'utf8');
    content = transformBody(content);
    writeFile(path.join(destDir, file), content);
    count++;
  }

  return count;
}

function installHooks() {
  const hooksJson = JSON.stringify({
    version: 1,
    hooks: {
      preToolUse: [
        {
          type: 'command',
          bash: './hooks/scripts/pbr-guard.sh',
          powershell: './hooks/scripts/pbr-guard.ps1',
          timeoutSec: 10,
        },
      ],
    },
  }, null, 2);

  writeFile(path.join(TARGET, 'hooks', 'hooks.json'), hooksJson);

  const templateDir = path.join(PBR_SOURCE, 'templates', 'copilot-hooks');
  const destDir = path.join(TARGET, 'hooks', 'scripts');
  let count = 1; // hooks.json

  if (copyFile(path.join(templateDir, 'pbr-guard.sh'), path.join(destDir, 'pbr-guard.sh'))) count++;
  if (copyFile(path.join(templateDir, 'pbr-guard.ps1'), path.join(destDir, 'pbr-guard.ps1'))) count++;

  return count;
}

function installCopilotInstructions() {
  const src = path.join(PBR_SOURCE, 'templates', 'copilot-instructions.md');
  const dest = path.join(TARGET, 'copilot-instructions.md');
  return copyFile(src, dest) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`Plan-Build-Run Copilot Installer`);
  console.log(`  Source:  ${PBR_SOURCE}`);
  console.log(`  Target:  ${TARGET}`);
  console.log(`  Mode:    ${flags.global ? 'global' : 'local'}`);
  if (flags.dryRun) console.log('  [DRY RUN MODE]');
  console.log('');

  // Validate source exists
  if (!fs.existsSync(PBR_SOURCE)) {
    console.error(`Error: PBR source directory not found: ${PBR_SOURCE}`);
    process.exit(1);
  }

  if (flags.clean) {
    cleanPreviousInstall();
  }

  const summary = {};

  try {
    summary.agents = installAgents();
    summary.skills = installSkills();
    summary.commands = installCommands();
    summary.references = installReferences();
    summary.hooks = installHooks();
    summary.instructions = installCopilotInstructions();
  } catch (err) {
    console.error(`\nError during installation: ${err.message}`);
    process.exit(1);
  }

  // Print summary
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Installation summary:');
  console.log(`  Agents:       ${summary.agents} files`);
  console.log(`  Skills:       ${summary.skills} files`);
  console.log(`  Commands:     ${summary.commands} files`);
  console.log(`  References:   ${summary.references} files`);
  console.log(`  Hooks:        ${summary.hooks} files`);
  console.log(`  Instructions: ${summary.instructions} files`);
  console.log(`  Total:        ${total} files`);
  console.log(`\nPBR for Copilot installed to: ${TARGET}`);
  process.exit(0);
}

main();
