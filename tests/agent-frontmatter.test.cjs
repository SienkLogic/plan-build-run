/**
 * PBR Agent Frontmatter Tests
 *
 * Validates that all agent .md files have correct frontmatter fields:
 * - Anti-heredoc instruction present in file-writing agents
 * - skills: field in all agents
 * - Commented hooks: pattern in file-writing agents
 * - Spawn type consistency across workflows
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
// Legacy workflows dir removed; skills are now in plugins/pbr/skills/
const SKILLS_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'skills');
const COMMANDS_DIR = path.join(__dirname, '..', 'commands', 'pbr');

const ALL_AGENTS = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.startsWith('pbr-') && f.endsWith('.md'))
  .map(f => f.replace('.md', ''));

const FILE_WRITING_AGENTS = ALL_AGENTS.filter(name => {
  const content = fs.readFileSync(path.join(AGENTS_DIR, name + '.md'), 'utf-8');
  const toolsMatch = content.match(/^tools:\s*(.+)$/m);
  return toolsMatch && toolsMatch[1].includes('Write');
});

const READ_ONLY_AGENTS = ALL_AGENTS.filter(name => !FILE_WRITING_AGENTS.includes(name));

// ─── Anti-Heredoc Instruction ────────────────────────────────────────────────

describe('HDOC: anti-heredoc instruction', () => {
  for (const agent of FILE_WRITING_AGENTS) {
    test(`${agent} has anti-heredoc instruction`, async () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      assert.ok(
        content.includes("never use `Bash(cat << 'EOF')` or heredoc"),
        `${agent} missing anti-heredoc instruction`
      );
    });
  }

  test('no active heredoc patterns in any agent file', async () => {
    for (const agent of ALL_AGENTS) {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      // Match actual heredoc commands (not references in anti-heredoc instruction)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip lines that are part of the anti-heredoc instruction or markdown code fences
        if (line.includes('never use') || line.includes('NEVER') || line.trim().startsWith('```')) continue;
        // Check for actual heredoc usage instructions
        if (/^cat\s+<<\s*'?EOF'?\s*>/.test(line.trim())) {
          assert.fail(`${agent}:${i + 1} has active heredoc pattern: ${line.trim()}`);
        }
      }
    }
  });
});

// ─── Skills Frontmatter ──────────────────────────────────────────────────────

describe('SKILL: skills frontmatter', () => {
  for (const agent of ALL_AGENTS) {
    test(`${agent} has skills: in frontmatter`, async () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(
        frontmatter.includes('skills:'),
        `${agent} missing skills: in frontmatter`
      );
    });
  }

  test('skill references follow naming convention', async () => {
    for (const agent of ALL_AGENTS) {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      const skillLines = frontmatter.split('\n').filter(l => l.trim().startsWith('- pbr-'));
      for (const line of skillLines) {
        const skillName = line.trim().replace('- ', '');
        assert.match(skillName, /^pbr-[\w-]+-workflow$/, `Invalid skill name: ${skillName}`);
      }
    }
  });
});

// ─── Hooks Frontmatter ───────────────────────────────────────────────────────

describe('HOOK: hooks frontmatter pattern', () => {
  for (const agent of FILE_WRITING_AGENTS) {
    test(`${agent} has commented hooks pattern`, async () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(
        frontmatter.includes('# hooks:'),
        `${agent} missing commented hooks: pattern in frontmatter`
      );
    });
  }

  for (const agent of READ_ONLY_AGENTS) {
    test(`${agent} (read-only) does not need hooks`, async () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      // Read-only agents may or may not have hooks — just verify they parse
      assert.ok(frontmatter.includes('name:'), `${agent} has valid frontmatter`);
    });
  }
});

// ─── Spawn Type Consistency ──────────────────────────────────────────────────

describe('SPAWN: spawn type consistency', () => {
  test('no "First, read agent .md" workaround pattern remains', () => {
    const dirs = [SKILLS_DIR, COMMANDS_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const hasWorkaround = content.includes('First, read ~/.claude/agents/pbr-');
        assert.ok(
          !hasWorkaround,
          `${file} still has "First, read agent .md" workaround — use named subagent_type instead`
        );
      }
    }
  });

  test('named agent spawns use correct agent names', async () => {
    const validAgentTypes = new Set([
      ...ALL_AGENTS,
      'general-purpose',  // Allowed for orchestrator spawns
    ]);

    const dirs = [SKILLS_DIR, COMMANDS_DIR];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const matches = content.matchAll(/subagent_type="([^"]+)"/g);
        for (const match of matches) {
          const agentType = match[1];
          assert.ok(
            validAgentTypes.has(agentType),
            `${file} references unknown agent type: ${agentType}`
          );
        }
      }
    }
  });

  test('debug skill uses debugger agent (not general-purpose)', async () => {
    const debugSkillPath = path.join(SKILLS_DIR, 'debug', 'SKILL.md');
    if (!fs.existsSync(debugSkillPath)) return; // skip if skill not present
    const content = fs.readFileSync(debugSkillPath, 'utf-8');
    assert.ok(
      content.includes('debugger') || content.includes('pbr-debugger'),
      'debug skill should reference debugger agent'
    );
  });
});

// ─── Required Frontmatter Fields ─────────────────────────────────────────────

describe('AGENT: required frontmatter fields', () => {
  for (const agent of ALL_AGENTS) {
    test(`${agent} has name, description, tools, color`, () => {
      const content = fs.readFileSync(path.join(AGENTS_DIR, agent + '.md'), 'utf-8');
      const frontmatter = content.split('---')[1] || '';
      assert.ok(frontmatter.includes('name:'), `${agent} missing name:`);
      assert.ok(frontmatter.includes('description:'), `${agent} missing description:`);
      assert.ok(frontmatter.includes('tools:'), `${agent} missing tools:`);
      assert.ok(frontmatter.includes('color:'), `${agent} missing color:`);
    });
  }
});
