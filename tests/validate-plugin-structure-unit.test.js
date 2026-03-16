'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { validate } = require('../hooks/validate-plugin-structure');

let tmpDir;

function makeTempPlugin() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-vps-unit-'));

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
    '---\nname: test-skill\ndescription: "A test skill"\nallowed-tools: Read, Write, Task\n---\n\n# Test Skill\n## Context Budget\nKeep it lean.');

  // skills/shared/ (should be skipped)
  fs.mkdirSync(path.join(tmpDir, 'skills', 'shared'), { recursive: true });

  // agents/test-agent.md
  fs.mkdirSync(path.join(tmpDir, 'agents'));
  fs.writeFileSync(path.join(tmpDir, 'agents', 'test-agent.md'),
    '---\nname: test-agent\ndescription: "A test agent"\n---\n\n# Test Agent\n');

  // hooks/hooks.json
  fs.mkdirSync(path.join(tmpDir, 'hooks'));
  fs.writeFileSync(path.join(tmpDir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }));

  // scripts/ dir
  fs.mkdirSync(path.join(tmpDir, 'scripts'));

  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
  console.warn.mockRestore();
});

describe('validate-plugin-structure unit tests', () => {
  test('returns 0 errors for valid plugin structure', () => {
    const dir = makeTempPlugin();
    const result = validate(dir);
    expect(result.errors).toBe(0);
  });

  test('reports error when plugin.json is missing', () => {
    const dir = makeTempPlugin();
    fs.unlinkSync(path.join(dir, '.claude-plugin', 'plugin.json'));
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when plugin.json has invalid JSON', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'not json');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when plugin.json lacks name', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ version: '1.0.0', description: 'Test' }));
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when plugin.json lacks version', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'test', description: 'Test' }));
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when plugin.json lacks description', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'test', version: '1.0.0' }));
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when SKILL.md is missing from a skill directory', () => {
    const dir = makeTempPlugin();
    fs.mkdirSync(path.join(dir, 'skills', 'broken-skill'), { recursive: true });
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when SKILL.md lacks YAML frontmatter', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'skills', 'test-skill', 'SKILL.md'), '# No frontmatter');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when SKILL.md frontmatter lacks name', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'skills', 'test-skill', 'SKILL.md'),
      '---\ndescription: "test"\n---\n# Skill');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when SKILL.md frontmatter lacks description', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'skills', 'test-skill', 'SKILL.md'),
      '---\nname: test\n---\n# Skill');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('warns when SKILL.md has Task tool but no Context Budget section', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'skills', 'test-skill', 'SKILL.md'),
      '---\nname: test\ndescription: "test"\nallowed-tools: Read, Task\n---\n# Skill');
    const result = validate(dir);
    expect(result.warnings).toBeGreaterThan(0);
  });

  test('reports error when skills/ directory is missing', () => {
    const dir = makeTempPlugin();
    fs.rmSync(path.join(dir, 'skills'), { recursive: true, force: true });
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when agents/ directory is missing', () => {
    const dir = makeTempPlugin();
    fs.rmSync(path.join(dir, 'agents'), { recursive: true, force: true });
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when agent file lacks YAML frontmatter', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'agents', 'test-agent.md'), '# No frontmatter');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when agent frontmatter lacks name', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'agents', 'test-agent.md'),
      '---\ndescription: "test"\n---\n# Agent');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('reports error when agent frontmatter lacks description', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'agents', 'test-agent.md'),
      '---\nname: test\n---\n# Agent');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('warns when contexts/ directory is missing', () => {
    const dir = makeTempPlugin();
    const result = validate(dir);
    expect(result.warnings).toBeGreaterThanOrEqual(1);
  });

  test('validates contexts/ files when present', () => {
    const dir = makeTempPlugin();
    fs.mkdirSync(path.join(dir, 'contexts'));
    fs.writeFileSync(path.join(dir, 'contexts', 'test.md'), '# Test context');
    const result = validate(dir);
    expect(result.errors).toBe(0);
  });

  test('warns when context file does not start with heading', () => {
    const dir = makeTempPlugin();
    fs.mkdirSync(path.join(dir, 'contexts'));
    fs.writeFileSync(path.join(dir, 'contexts', 'test.md'), 'No heading here');
    const result = validate(dir);
    expect(result.warnings).toBeGreaterThan(0);
  });

  test('warns when hooks.json is missing', () => {
    const dir = makeTempPlugin();
    fs.unlinkSync(path.join(dir, 'hooks', 'hooks.json'));
    const result = validate(dir);
    expect(result.warnings).toBeGreaterThan(0);
  });

  test('reports error when hooks.json is invalid JSON', () => {
    const dir = makeTempPlugin();
    fs.writeFileSync(path.join(dir, 'hooks', 'hooks.json'), 'bad json');
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('validates hooks.json script references with run-hook bootstrap pattern', () => {
    const dir = makeTempPlugin();
    // Create a hooks.json with a run-hook.js bootstrap pattern referencing a script
    const hooksJson = {
      hooks: {
        PreToolUse: [{
          hooks: [{
            type: 'command',
            command: `node -e "require('run-hook.js')" existing-script.js`
          }]
        }]
      }
    };
    fs.writeFileSync(path.join(dir, 'hooks', 'hooks.json'), JSON.stringify(hooksJson));
    // Script does NOT exist under scripts/
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('validates hooks.json direct script references', () => {
    const dir = makeTempPlugin();
    const hooksJson = {
      hooks: {
        PostToolUse: [{
          hooks: [{
            type: 'command',
            command: `node ${path.join(dir, 'hooks', 'nonexistent.js')}`
          }]
        }]
      }
    };
    fs.writeFileSync(path.join(dir, 'hooks', 'hooks.json'), JSON.stringify(hooksJson));
    const result = validate(dir);
    expect(result.errors).toBeGreaterThan(0);
  });

  test('skips non-array event hooks in hooks.json', () => {
    const dir = makeTempPlugin();
    const hooksJson = {
      hooks: {
        PreToolUse: 'not-an-array'
      }
    };
    fs.writeFileSync(path.join(dir, 'hooks', 'hooks.json'), JSON.stringify(hooksJson));
    const result = validate(dir);
    // Should not crash, no errors from this
    expect(result.errors).toBe(0);
  });

  test('skips shared/ directory when scanning skills', () => {
    const dir = makeTempPlugin();
    // shared/ exists but has no SKILL.md -- should not cause error
    const result = validate(dir);
    expect(result.errors).toBe(0);
  });
});
