/**
 * Plugin structure validation tests.
 *
 * Smoke tests that the plugin is structurally valid for `claude --plugin-dir .`
 * loading: hooks.json references valid scripts, command files exist with
 * required content, agent files have valid frontmatter, and package.json
 * has required fields.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(ROOT, 'hooks');
const AGENTS_DIR = path.join(ROOT, 'plugins', 'pbr', 'agents');
const COMMANDS_DIR = path.join(ROOT, 'plugins', 'pbr', 'commands');

describe('hooks.json validity', () => {
  let hooks;

  beforeAll(() => {
    const raw = fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8');
    hooks = JSON.parse(raw);
  });

  test('hooks.json is valid JSON with hooks object', () => {
    expect(hooks).toHaveProperty('hooks');
    expect(typeof hooks.hooks).toBe('object');
  });

  test('all referenced hook scripts exist on disk', () => {
    const missing = [];
    for (const [, groups] of Object.entries(hooks.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks || []) {
          if (hook.type !== 'command' || !hook.command) continue;
          // Extract the script name from the bootstrap command
          // Pattern: ...run-hook.js" scriptname.js [args]
          const match = hook.command.match(/run-hook\.js[)'"]*\s+(\S+\.js)/);
          if (!match) continue;
          const scriptPath = path.join(HOOKS_DIR, match[1]);
          if (!fs.existsSync(scriptPath)) {
            missing.push(`${match[1]} (referenced in hooks.json)`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('command files', () => {
  const commandFiles = fs.readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.md'));

  test('commands/pbr/ contains at least one command file', () => {
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  test.each(commandFiles)('%s has description field', (filename) => {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
    expect(content).toMatch(/description:/);
  });
});

describe('agent frontmatter', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  test.each(agentFiles)('%s has valid frontmatter with name, description, tools', (filename) => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, filename), 'utf8');
    // Must start with --- frontmatter (handle \r\n or \n)
    expect(content).toMatch(/^---\r?\n/);
    // Extract frontmatter block
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    expect(fmMatch).not.toBeNull();
    const fm = fmMatch[1];
    expect(fm).toMatch(/name:\s*.+/);
    expect(fm).toMatch(/description:\s*.+/);
    expect(fm).toMatch(/tools:/);
  });
});

describe('package.json', () => {
  let pkg;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  });

  test('has name field', () => {
    expect(pkg.name).toBeDefined();
    expect(typeof pkg.name).toBe('string');
  });

  test('has version field', () => {
    expect(pkg.version).toBeDefined();
  });

  test('has scripts section', () => {
    expect(pkg.scripts).toBeDefined();
    expect(typeof pkg.scripts).toBe('object');
  });
});
