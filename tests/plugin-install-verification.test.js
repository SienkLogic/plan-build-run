/**
 * Plugin Install & Setup Verification Tests
 *
 * Comprehensive validation that the PBR plugin is structurally correct
 * and will load properly via `claude --plugin-dir .` or npm install.
 *
 * 7 test groups:
 *   1. Plugin manifest validation (version sync with package.json)
 *   2. hooks.json script existence (canonical plugins/pbr/scripts/ location)
 *   3. run-hook.js bootstrap pattern validation
 *   4. Command registration completeness (63+ commands -> valid skills)
 *   5. Skill frontmatter validation (name, description, allowed-tools)
 *   6. Agent frontmatter validation (name, description, model, tools)
 *   7. npm pack file inclusion
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'pbr');

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    // Array item
    const arrayMatch = line.match(/^\s+-\s+(.+)/);
    if (arrayMatch && inArray && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(arrayMatch[1].replace(/^["']|["']$/g, ''));
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '' || val === '[]') {
        // Could be start of array block or empty value
        fm[key] = val === '[]' ? [] : '';
        currentKey = key;
        inArray = val === '';
      } else {
        fm[key] = val.replace(/^["']|["']$/g, '');
        currentKey = key;
        inArray = false;
      }
    }
  }
  return fm;
}

// ── 1. Plugin manifest validation ────────────────────────────────────────────

describe('Plugin manifest validation', () => {
  let pluginJson;
  let packageJson;

  beforeAll(() => {
    pluginJson = JSON.parse(
      fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')
    );
    packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
  });

  test('plugin.json version matches package.json version', () => {
    expect(pluginJson.version).toBe(packageJson.version);
  });

  test('plugin.json has required fields: name, version, description', () => {
    expect(pluginJson.name).toBeDefined();
    expect(typeof pluginJson.name).toBe('string');
    expect(pluginJson.version).toBeDefined();
    expect(typeof pluginJson.version).toBe('string');
    expect(pluginJson.description).toBeDefined();
    expect(typeof pluginJson.description).toBe('string');
  });

  test('plugin.json name is "pbr"', () => {
    expect(pluginJson.name).toBe('pbr');
  });
});

// ── 2. hooks.json script existence ───────────────────────────────────────────

describe('hooks.json script resolution against canonical location', () => {
  let hooks;
  let extractedScripts;

  beforeAll(() => {
    const raw = fs.readFileSync(
      path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'
    );
    hooks = JSON.parse(raw);

    // Extract all script names from bootstrap commands
    extractedScripts = new Set();
    for (const [, groups] of Object.entries(hooks.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks || []) {
          if (hook.type !== 'command' || !hook.command) continue;
          const match = hook.command.match(/run-hook\.js[)'"]*\s+(\S+\.js)/);
          if (match) {
            extractedScripts.add(match[1]);
          }
        }
      }
    }
  });

  test('extracts at least 10 unique scripts from hooks.json', () => {
    expect(extractedScripts.size).toBeGreaterThanOrEqual(10);
  });

  test.each([
    'auto-continue.js',
    'block-skill-self-read.js',
    'enforce-context-budget.js',
    'hook-server-client.js',
    'intercept-plan-mode.js',
    'log-notification.js',
    'post-bash-triage.js',
    'post-compact.js',
    'post-write-dispatch.js',
    'pre-bash-dispatch.js',
    'pre-write-dispatch.js',
    'progress-tracker.js',
    'prompt-routing.js',
    'track-user-gates.js',
    'validate-skill-args.js',
    'validate-task.js',
  ])('%s exists in plugins/pbr/scripts/', (scriptName) => {
    const scriptPath = path.join(PLUGIN, 'scripts', scriptName);
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  test('every script referenced in hooks.json exists in plugins/pbr/scripts/', () => {
    const missing = [];
    for (const script of extractedScripts) {
      const scriptPath = path.join(PLUGIN, 'scripts', script);
      if (!fs.existsSync(scriptPath)) {
        missing.push(script);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ── 3. run-hook.js bootstrap pattern ─────────────────────────────────────────

describe('run-hook.js bootstrap pattern validation', () => {
  let hooks;

  beforeAll(() => {
    const raw = fs.readFileSync(
      path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'
    );
    hooks = JSON.parse(raw);
  });

  test('run-hook.js exists and has size > 100 bytes', () => {
    const runHookPath = path.join(PLUGIN, 'scripts', 'run-hook.js');
    expect(fs.existsSync(runHookPath)).toBe(true);
    const stat = fs.statSync(runHookPath);
    expect(stat.size).toBeGreaterThan(100);
  });

  test('every command-type hook contains the MSYS path fix pattern', () => {
    const missingPattern = [];
    for (const [eventName, groups] of Object.entries(hooks.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks || []) {
          if (hook.type !== 'command' || !hook.command) continue;
          // Check for MSYS path fix: match(/^\/([a-zA-Z])\/(.*)/
          if (!hook.command.includes('match(/^\\/([a-zA-Z])\\/(.*)/')) {
            missingPattern.push(`${eventName}: ${hook.command.substring(0, 60)}...`);
          }
        }
      }
    }
    expect(missingPattern).toEqual([]);
  });

  test('every command-type hook references run-hook.js', () => {
    const missingRunHook = [];
    for (const [eventName, groups] of Object.entries(hooks.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks || []) {
          if (hook.type !== 'command' || !hook.command) continue;
          if (!hook.command.includes('run-hook.js')) {
            missingRunHook.push(`${eventName}: missing run-hook.js reference`);
          }
        }
      }
    }
    expect(missingRunHook).toEqual([]);
  });
});

// ── 4. Command registration completeness ─────────────────────────────────────

describe('Command registration completeness', () => {
  const COMMANDS_DIR = path.join(PLUGIN, 'commands');
  const SKILLS_DIR = path.join(PLUGIN, 'skills');

  let commandFiles;

  beforeAll(() => {
    commandFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
  });

  test('at least 60 command files exist', () => {
    expect(commandFiles.length).toBeGreaterThanOrEqual(60);
  });

  test('every command that references a skill maps to an existing SKILL.md', () => {
    const invalid = [];
    const staticCommands = ['join-discord'];

    for (const cmdFile of commandFiles) {
      const cmdName = cmdFile.replace(/\.md$/, '');
      if (staticCommands.includes(cmdName)) continue;

      const content = fs.readFileSync(path.join(COMMANDS_DIR, cmdFile), 'utf8');
      const match = content.match(/`pbr:([a-z-]+)`\s*skill/);
      if (match) {
        const skillName = match[1];
        const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
        if (!fs.existsSync(skillPath)) {
          invalid.push(`${cmdFile}: references skill "${skillName}" but SKILL.md not found`);
        }
      }
    }
    expect(invalid).toEqual([]);
  });
});

// ── 5. Skill frontmatter validation ──────────────────────────────────────────

describe('Skill frontmatter validation', () => {
  const SKILLS_DIR = path.join(PLUGIN, 'skills');

  const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => d.name !== 'shared')
    .filter(d => fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
    .map(d => d.name)
    .sort();

  test('at least 20 skills exist', () => {
    expect(skillDirs.length).toBeGreaterThanOrEqual(20);
  });

  test.each(skillDirs)('skills/%s/SKILL.md has valid frontmatter', (skillName) => {
    const content = fs.readFileSync(
      path.join(SKILLS_DIR, skillName, 'SKILL.md'), 'utf8'
    );
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm.name).toBeTruthy();
    expect(fm.description).toBeTruthy();
    expect(fm['allowed-tools']).toBeDefined();
  });
});

// ── 6. Agent frontmatter validation ──────────────────────────────────────────

describe('Agent frontmatter validation', () => {
  const AGENTS_DIR = path.join(PLUGIN, 'agents');

  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  test('at least 10 agent files exist', () => {
    expect(agentFiles.length).toBeGreaterThanOrEqual(10);
  });

  const validModels = ['sonnet', 'opus', 'haiku', 'inherit'];

  test.each(agentFiles)('agents/%s has valid frontmatter', (filename) => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, filename), 'utf8');
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();

    // name field
    expect(fm.name).toBeTruthy();

    // description field
    expect(fm.description).toBeTruthy();

    // model field (optional -- defaults to inherit when absent)
    if (fm.model) {
      expect(validModels).toContain(fm.model);
    }

    // tools field - check raw content for tools array
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    expect(fmMatch).not.toBeNull();
    expect(fmMatch[1]).toMatch(/tools:/);
    // At least one tool listed under tools:
    const rawLines = fmMatch[1].split(/\r?\n/);
    const toolsIdx = rawLines.findIndex(x => /^tools:/.test(x));
    const toolItems = [];
    for (let i = toolsIdx + 1; i < rawLines.length; i++) {
      if (/^\s+-\s+\w+/.test(rawLines[i])) {
        toolItems.push(rawLines[i]);
      } else if (/^\w/.test(rawLines[i])) {
        break; // next top-level key
      }
    }
    expect(toolItems.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 7. npm pack file inclusion ───────────────────────────────────────────────

describe('npm pack file inclusion', () => {
  let packageJson;

  beforeAll(() => {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
  });

  test('package.json files array includes "plugins/"', () => {
    expect(packageJson.files).toBeDefined();
    expect(Array.isArray(packageJson.files)).toBe(true);
    expect(packageJson.files).toContain('plugins/');
  });

  test.each([
    ['hooks', path.join(PLUGIN, 'hooks')],
    ['scripts', path.join(PLUGIN, 'scripts')],
    ['skills', path.join(PLUGIN, 'skills')],
    ['agents', path.join(PLUGIN, 'agents')],
    ['commands', path.join(PLUGIN, 'commands')],
    ['.claude-plugin', path.join(PLUGIN, '.claude-plugin')],
  ])('plugin directory %s exists on disk', (_name, dirPath) => {
    expect(fs.existsSync(dirPath)).toBe(true);
    const stat = fs.statSync(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  test('key plugin files exist', () => {
    const keyFiles = [
      path.join(PLUGIN, '.claude-plugin', 'plugin.json'),
      path.join(PLUGIN, 'hooks', 'hooks.json'),
      path.join(PLUGIN, 'scripts', 'run-hook.js'),
    ];
    for (const f of keyFiles) {
      expect(fs.existsSync(f)).toBe(true);
    }
  });
});
