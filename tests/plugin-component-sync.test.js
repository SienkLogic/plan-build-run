/**
 * Plugin Component Sync Tests
 *
 * Ensures that skills, commands, and agents stay in sync across
 * the repo-root directories and the plugin directory.
 *
 * These tests catch the common failure mode where a new skill is added
 * to plugins/pbr/skills/ but the corresponding command registration
 * in plugins/pbr/commands/ is forgotten (or vice versa).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'pbr');

// ── Helpers ──────────────────────────────────────────────────────────────────

function listSkills(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => fs.existsSync(path.join(dir, d.name, 'SKILL.md')))
    .map(d => d.name)
    .sort();
}

function listCommands(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort();
}

function listAgents(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort();
}

/**
 * Extract the skill name a command file points to.
 * Commands contain "provided by the `pbr:{skill}` skill" in their body.
 * Returns the skill name, or null if not found.
 */
function extractTargetSkill(cmdPath) {
  const content = fs.readFileSync(cmdPath, 'utf8');
  const match = content.match(/`pbr:([a-z-]+)`\s*skill/);
  return match ? match[1] : null;
}

function extractDescription(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const descMatch = match[1].match(/^description:\s*["']?(.*?)["']?\s*$/m);
  return descMatch ? descMatch[1] : null;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Plugin component sync', () => {

  // Skills that intentionally have no command (shared fragments, etc.)
  const SKILLS_WITHOUT_COMMANDS = ['shared'];

  // Commands that are static pages (no skill reference or process steps)
  const STATIC_COMMANDS = ['join-discord'];

  test('every plugin skill has a matching command in plugins/pbr/commands/', () => {
    const skills = listSkills(path.join(PLUGIN, 'skills'));
    const commands = listCommands(path.join(PLUGIN, 'commands'));

    const missing = skills
      .filter(s => !SKILLS_WITHOUT_COMMANDS.includes(s))
      .filter(s => !commands.includes(s));

    expect(missing).toEqual([]);
  });

  test('every plugin command either references a valid skill or is self-contained', () => {
    const skills = listSkills(path.join(PLUGIN, 'skills'));
    const commands = listCommands(path.join(PLUGIN, 'commands'));
    const invalid = [];

    for (const cmd of commands) {
      if (STATIC_COMMANDS.includes(cmd)) continue;

      const cmdPath = path.join(PLUGIN, 'commands', `${cmd}.md`);
      const content = fs.readFileSync(cmdPath, 'utf8');
      const targetSkill = extractTargetSkill(cmdPath);

      if (targetSkill) {
        // Redirect command — verify the target skill exists
        if (!skills.includes(targetSkill)) {
          invalid.push(`${cmd}.md: references skill "${targetSkill}" but no plugins/pbr/skills/${targetSkill}/SKILL.md exists`);
        }
      } else {
        // Self-contained command — must have inline content (process/objective/steps)
        const hasContent = content.includes('<process>') ||
                          content.includes('<objective>') ||
                          content.includes('## ') ||
                          content.includes('/pbr:');
        if (!hasContent) {
          invalid.push(`${cmd}.md: no skill reference and no inline content found`);
        }
      }
    }

    expect(invalid).toEqual([]);
  });

  test('repo-root commands/pbr/ matches plugins/pbr/commands/', () => {
    const rootCommands = listCommands(path.join(ROOT, 'commands', 'pbr'));
    const pluginCommands = listCommands(path.join(PLUGIN, 'commands'));

    const inRootOnly = rootCommands.filter(c => !pluginCommands.includes(c));
    const inPluginOnly = pluginCommands.filter(c => !rootCommands.includes(c));

    expect(inRootOnly).toEqual([]);
    expect(inPluginOnly).toEqual([]);
  });

  test('repo-root skills match plugins/pbr/skills/', () => {
    const rootSkills = listSkills(path.join(ROOT, 'plan-build-run', 'skills'));
    const pluginSkills = listSkills(path.join(PLUGIN, 'skills'));

    const inRootOnly = rootSkills.filter(s => !pluginSkills.includes(s));
    const inPluginOnly = pluginSkills.filter(s => !rootSkills.includes(s));

    expect(inRootOnly).toEqual([]);
    expect(inPluginOnly).toEqual([]);
  });

  test('repo-root agents match plugins/pbr/agents/', () => {
    // Root uses pbr-{name}.md, plugin uses {name}.md
    const rootAgents = listAgents(path.join(ROOT, 'agents'))
      .filter(a => a.startsWith('pbr-'))
      .map(a => a.replace(/^pbr-/, ''));
    const pluginAgents = listAgents(path.join(PLUGIN, 'agents'));

    const inRootOnly = rootAgents.filter(a => !pluginAgents.includes(a));
    const inPluginOnly = pluginAgents.filter(a => !rootAgents.includes(a));

    expect(inRootOnly).toEqual([]);
    expect(inPluginOnly).toEqual([]);
  });

  test('direct command descriptions match their skill descriptions', () => {
    // Only check commands that map directly to same-named skills.
    // Alias commands (e.g., discuss-phase -> discuss) have different
    // descriptions intentionally.
    const commands = listCommands(path.join(PLUGIN, 'commands'));
    const mismatches = [];

    for (const cmd of commands) {
      const skillPath = path.join(PLUGIN, 'skills', cmd, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue; // alias command, skip

      const cmdPath = path.join(PLUGIN, 'commands', `${cmd}.md`);
      const cmdContent = fs.readFileSync(cmdPath, 'utf8');
      const skillContent = fs.readFileSync(skillPath, 'utf8');

      const cmdDesc = extractDescription(cmdContent);
      const skillDesc = extractDescription(skillContent);

      if (cmdDesc && skillDesc && cmdDesc !== skillDesc) {
        mismatches.push(`${cmd}: command="${cmdDesc}" vs skill="${skillDesc}"`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
