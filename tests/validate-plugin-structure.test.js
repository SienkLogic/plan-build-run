/**
 * Tests for validate-plugin-structure.js
 *
 * Since the script operates on the real plugin directory with globals,
 * we test by running it as a subprocess and checking output + exit code.
 *
 * For error-condition tests, we create a temp plugin directory and run a
 * small wrapper script that overrides the ROOT variable by re-implementing
 * targeted validation logic inline — since ROOT is hardcoded via __dirname.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'validate-plugin-structure.js');

/**
 * Build a minimal valid temp plugin directory structure.
 * Returns the tmpDir path.
 */
function makeTempPlugin() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-plugin-test-'));

  // .claude-plugin/plugin.json
  fs.mkdirSync(path.join(tmpDir, '.claude-plugin'));
  fs.writeFileSync(path.join(tmpDir, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin'
  }));

  // skills/test-skill/SKILL.md
  fs.mkdirSync(path.join(tmpDir, 'skills', 'test-skill'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'skills', 'test-skill', 'SKILL.md'),
    '---\nname: test-skill\ndescription: "A test skill"\n---\n\n# Test Skill\n');

  // agents/test-agent.md
  fs.mkdirSync(path.join(tmpDir, 'agents'));
  fs.writeFileSync(path.join(tmpDir, 'agents', 'test-agent.md'),
    '---\nname: test-agent\ndescription: "A test agent"\n---\n\n# Test Agent\n');

  // hooks/hooks.json
  fs.mkdirSync(path.join(tmpDir, 'hooks'));
  fs.writeFileSync(path.join(tmpDir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }));

  // scripts/ dir (for hooks references)
  fs.mkdirSync(path.join(tmpDir, 'scripts'));

  return tmpDir;
}

/**
 * Run the validation script against a custom ROOT directory.
 * We do this by writing a tiny wrapper script to a temp file.
 */
function runScriptAgainst(rootDir) {
  // Write a wrapper that overrides __dirname before requiring the script logic
  // We replicate the script's logic with a custom ROOT
  const wrapperScript = `
const fs = require('fs');
const path = require('path');

const ROOT = ${JSON.stringify(rootDir)};
let errors = 0;
let warnings = 0;

function error(msg) { console.error('ERROR: ' + msg); errors++; }
function warn(msg) { console.warn('WARN: ' + msg); warnings++; }
function info(msg) { console.log('OK: ' + msg); }

// Check plugin.json
const pluginJsonPath = path.join(ROOT, '.claude-plugin', 'plugin.json');
if (!fs.existsSync(pluginJsonPath)) {
  error('.claude-plugin/plugin.json missing');
} else {
  try {
    const plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    if (!plugin.name) error('plugin.json missing "name" field');
    if (!plugin.version) error('plugin.json missing "version" field');
    if (!plugin.description) error('plugin.json missing "description" field');
    info('Plugin: ' + plugin.name + ' v' + plugin.version);
  } catch (e) {
    error('plugin.json is not valid JSON: ' + e.message);
  }
}

// Check skills
const skillsDir = path.join(ROOT, 'skills');
if (fs.existsSync(skillsDir)) {
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'shared');
  for (const dir of skillDirs) {
    const skillMd = path.join(skillsDir, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      error('skills/' + dir.name + '/ missing SKILL.md');
    } else {
      info('Skill: /pbr:' + dir.name);
    }
  }
}

// Check agents
const agentsDir = path.join(ROOT, 'agents');
if (fs.existsSync(agentsDir)) {
  const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  for (const file of agentFiles) {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    if (!content.startsWith('---')) {
      error('agents/' + file + ' missing YAML frontmatter');
    } else {
      info('Agent: ' + file);
    }
  }
}

// Check contexts/ (dead check — contexts/ was removed from PBR)
const contextsDir = path.join(ROOT, 'contexts');
if (!fs.existsSync(contextsDir)) {
  warn('contexts/ directory not found (contexts are optional)');
}

// Check hooks.json
const hooksJsonPath = path.join(ROOT, 'hooks', 'hooks.json');
if (fs.existsSync(hooksJsonPath)) {
  try {
    JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
    info('hooks.json validated');
  } catch (e) {
    error('hooks.json is not valid JSON: ' + e.message);
  }
} else {
  warn('hooks/hooks.json not found (hooks are optional)');
}

console.log('\\n---');
console.log('Validation complete: ' + errors + ' errors, ' + warnings + ' warnings');
if (errors > 0) process.exit(1);
`;

  const wrapperPath = path.join(os.tmpdir(), `pbr-validate-wrapper-${Date.now()}.js`);
  try {
    fs.writeFileSync(wrapperPath, wrapperScript);
    try {
      const stdout = execSync(`node "${wrapperPath}" 2>&1`, { encoding: 'utf8', timeout: 10000, shell: true });
      return { exitCode: 0, output: stdout };
    } catch (e) {
      // Non-zero exit — combine stdout and stderr
      const output = (e.stdout || '') + (e.stderr || '');
      return { exitCode: e.status || 1, output };
    }
  } finally {
    try { fs.unlinkSync(wrapperPath); } catch (_) { /* ignore */ }
  }
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('validate-plugin-structure', () => {
  test('passes validation on the real PBR plugin', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toContain('Validation complete');
    expect(result).toContain('0 errors');
  });

  test('outputs plugin name and version', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toMatch(/Plugin: pbr v\d+\.\d+\.\d+/);
  });

  test('lists all expected skills', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    const expectedSkills = [
      'begin', 'build', 'config', 'continue', 'debug', 'discuss',
      'explore', 'health', 'help', 'import', 'milestone', 'note',
      'pause', 'plan', 'quick', 'resume', 'review', 'scan',
      'setup', 'status', 'todo',
    ];
    for (const skill of expectedSkills) {
      expect(result).toContain(`Skill: /pbr:${skill}`);
    }
  });

  test('lists all expected agents', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    const expectedAgents = [
      'researcher', 'planner', 'plan-checker', 'executor', 'verifier',
      'integration-checker', 'debugger', 'codebase-mapper', 'synthesizer', 'general',
    ];
    for (const agent of expectedAgents) {
      expect(result).toContain(`Agent: ${agent}`);
    }
  });

  test('validates hooks.json', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toContain('hooks.json validated');
  });

  test('exits with code 0 on valid plugin', () => {
    // execSync throws on non-zero exit
    expect(() => {
      execSync(`node "${SCRIPT}"`, { timeout: 10000 });
    }).not.toThrow();
  });

  describe('error conditions (temp plugin directory)', () => {
    test('missing required file (no hooks/hooks.json) produces validation warning', () => {
      const tmpDir = makeTempPlugin();
      // Remove hooks.json to trigger the "hooks are optional" warning path
      fs.unlinkSync(path.join(tmpDir, 'hooks', 'hooks.json'));

      const result = runScriptAgainst(tmpDir);
      // Missing hooks.json is a warning, not an error — exits 0
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('hooks/hooks.json not found');
      cleanup(tmpDir);
    });

    test('missing SKILL.md in skill directory produces validation error', () => {
      const tmpDir = makeTempPlugin();
      // Add a skill dir without SKILL.md
      fs.mkdirSync(path.join(tmpDir, 'skills', 'broken-skill'), { recursive: true });

      const result = runScriptAgainst(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('missing SKILL.md');
      cleanup(tmpDir);
    });

    test('malformed plugin.json produces parse error', () => {
      const tmpDir = makeTempPlugin();
      // Overwrite plugin.json with invalid JSON
      fs.writeFileSync(
        path.join(tmpDir, '.claude-plugin', 'plugin.json'),
        '{ name: "broken", version: INVALID }'
      );

      const result = runScriptAgainst(tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('plugin.json is not valid JSON');
      cleanup(tmpDir);
    });

    // This check is effectively dead — contexts/ was removed from PBR.
    // Test documents the existing behavior until the check itself is removed.
    test('contexts/ directory check always warns when absent (documents dead check)', () => {
      const tmpDir = makeTempPlugin();
      // contexts/ does NOT exist in our temp plugin (not created by makeTempPlugin)

      const result = runScriptAgainst(tmpDir);
      // The validator should warn about missing contexts/ but still exit 0
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('contexts/ directory not found');
      expect(result.output).toContain('contexts are optional');
      cleanup(tmpDir);
    });
  });
});
