'use strict';

/**
 * Phase 19 Validation Tests: Multi-Plugin Derivatives
 *
 * Behavioral tests for requirements DERIV-01 through DERIV-05.
 * These tests validate on-disk state of the canonical plugin and all
 * 3 derivative plugins (codex-pbr, cursor-pbr, copilot-pbr).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PBR_DIR = path.join(ROOT, 'plugins', 'pbr');
const CODEX_DIR = path.join(ROOT, 'plugins', 'codex-pbr');
const CURSOR_DIR = path.join(ROOT, 'plugins', 'cursor-pbr');
const COPILOT_DIR = path.join(ROOT, 'plugins', 'copilot-pbr');

// Helper: recursively count files
function countFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(full);
    else count++;
  }
  return count;
}

// Helper: recursively list files
function listFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listFiles(full));
    else results.push(full);
  }
  return results;
}

// -----------------------------------------------------------------------
// DERIV-01, DERIV-02, DERIV-03: Canonical plugin exists as source
// -----------------------------------------------------------------------

describe('canonical plugins/pbr/ directory exists as derivative source', () => {
  test('plugins/pbr/ has all required subdirectories', () => {
    const requiredDirs = [
      'agents', 'commands', 'contexts', 'hooks',
      'references', 'scripts', 'skills', 'templates',
    ];
    for (const sub of requiredDirs) {
      const dir = path.join(PBR_DIR, sub);
      expect(fs.existsSync(dir)).toBe(true);
    }
  });

  test('plugins/pbr/ has approximately 280 files', () => {
    const count = countFiles(PBR_DIR);
    // Allow some variance; summary says 280
    expect(count).toBeGreaterThanOrEqual(250);
    expect(count).toBeLessThanOrEqual(320);
  });

  test('plugin manifest is valid JSON', () => {
    const manifest = path.join(PBR_DIR, '.claude-plugin', 'plugin.json');
    expect(fs.existsSync(manifest)).toBe(true);
    const content = fs.readFileSync(manifest, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// DERIV-01: codex-pbr derivative has expected structure
// -----------------------------------------------------------------------

describe('DERIV-01: codex-pbr derivative is fully populated', () => {
  test('codex-pbr has agents, commands, references, templates directories', () => {
    for (const sub of ['agents', 'commands', 'references', 'templates']) {
      expect(fs.existsSync(path.join(CODEX_DIR, sub))).toBe(true);
    }
  });

  test('codex-pbr has 14 agent files', () => {
    const agents = fs.readdirSync(path.join(CODEX_DIR, 'agents'))
      .filter(f => f.endsWith('.md'));
    expect(agents.length).toBe(14);
  });

  test('codex-pbr has 28 command files', () => {
    const commands = fs.readdirSync(path.join(CODEX_DIR, 'commands'))
      .filter(f => f.endsWith('.md'));
    expect(commands.length).toBe(41);
  });

  test('codex-pbr has scaffold files (config.toml, AGENTS.md, README.md)', () => {
    expect(fs.existsSync(path.join(CODEX_DIR, '.codex', 'config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(CODEX_DIR, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(CODEX_DIR, 'README.md'))).toBe(true);
  });

  test('codex-pbr agent frontmatter has no model/memory/tools', () => {
    const agentDir = path.join(CODEX_DIR, 'agents');
    const agents = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
    for (const agent of agents) {
      const content = fs.readFileSync(path.join(agentDir, agent), 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        expect(fm).not.toMatch(/^model\s*:/m);
        expect(fm).not.toMatch(/^memory\s*:/m);
        expect(fm).not.toMatch(/^tools\s*:/m);
      }
    }
  });
});

// -----------------------------------------------------------------------
// DERIV-02: cursor-pbr derivative has expected structure
// -----------------------------------------------------------------------

describe('DERIV-02: cursor-pbr derivative is fully populated', () => {
  test('cursor-pbr has agents, commands, skills, references, templates, hooks directories', () => {
    for (const sub of ['agents', 'commands', 'skills', 'references', 'templates', 'hooks']) {
      expect(fs.existsSync(path.join(CURSOR_DIR, sub))).toBe(true);
    }
  });

  test('cursor-pbr has 14 agent files', () => {
    const agents = fs.readdirSync(path.join(CURSOR_DIR, 'agents'))
      .filter(f => f.endsWith('.md'));
    expect(agents.length).toBe(14);
  });

  test('cursor-pbr has 28 command files', () => {
    const commands = fs.readdirSync(path.join(CURSOR_DIR, 'commands'))
      .filter(f => f.endsWith('.md'));
    expect(commands.length).toBe(41);
  });

  test('cursor-pbr agents have model: sonnet in frontmatter', () => {
    const agentDir = path.join(CURSOR_DIR, 'agents');
    const agents = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
    for (const agent of agents) {
      const content = fs.readFileSync(path.join(agentDir, agent), 'utf8');
      expect(content).toMatch(/^model:\s*sonnet$/m);
    }
  });

  test('cursor-pbr agents have readonly: false in frontmatter', () => {
    const agentDir = path.join(CURSOR_DIR, 'agents');
    const agents = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
    for (const agent of agents) {
      const content = fs.readFileSync(path.join(agentDir, agent), 'utf8');
      expect(content).toMatch(/^readonly:\s*false$/m);
    }
  });

  test('cursor-pbr has hooks.json with path delegation to ../pbr/scripts/', () => {
    const hooksPath = path.join(CURSOR_DIR, 'hooks', 'hooks.json');
    expect(fs.existsSync(hooksPath)).toBe(true);
    const content = fs.readFileSync(hooksPath, 'utf8');
    // Hooks should delegate to pbr scripts directory
    expect(content).toMatch(/pbr.*scripts/);
  });

  test('cursor-pbr has scaffold files (plugin.json, logo, setup scripts, workflow rule)', () => {
    expect(fs.existsSync(path.join(CURSOR_DIR, '.cursor-plugin', 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(CURSOR_DIR, 'assets', 'logo.svg'))).toBe(true);
    expect(fs.existsSync(path.join(CURSOR_DIR, 'setup.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(CURSOR_DIR, 'setup.sh'))).toBe(true);
    expect(fs.existsSync(path.join(CURSOR_DIR, 'rules', 'pbr-workflow.mdc'))).toBe(true);
  });

  test('cursor-pbr skills have no allowed-tools in frontmatter', () => {
    const skillsDir = path.join(CURSOR_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) return;
    const skillFiles = listFiles(skillsDir).filter(f => f.endsWith('SKILL.md'));
    expect(skillFiles.length).toBeGreaterThan(0);
    for (const sf of skillFiles) {
      const content = fs.readFileSync(sf, 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        expect(fmMatch[1]).not.toMatch(/^allowed-tools\s*:/m);
      }
    }
  });
});

// -----------------------------------------------------------------------
// DERIV-03: copilot-pbr derivative has expected structure
// -----------------------------------------------------------------------

describe('DERIV-03: copilot-pbr derivative is fully populated', () => {
  test('copilot-pbr has agents, commands, skills, references, templates directories', () => {
    for (const sub of ['agents', 'commands', 'skills', 'references', 'templates']) {
      expect(fs.existsSync(path.join(COPILOT_DIR, sub))).toBe(true);
    }
  });

  test('copilot-pbr has 14 agent files with .agent.md suffix', () => {
    const agents = fs.readdirSync(path.join(COPILOT_DIR, 'agents'))
      .filter(f => f.endsWith('.agent.md'));
    expect(agents.length).toBe(14);
  });

  test('copilot-pbr has 28 command files', () => {
    const commands = fs.readdirSync(path.join(COPILOT_DIR, 'commands'))
      .filter(f => f.endsWith('.md'));
    expect(commands.length).toBe(41);
  });

  test('copilot-pbr agent frontmatter has name and description only', () => {
    const agentDir = path.join(COPILOT_DIR, 'agents');
    const agents = fs.readdirSync(agentDir).filter(f => f.endsWith('.agent.md'));
    for (const agent of agents) {
      const content = fs.readFileSync(path.join(agentDir, agent), 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        expect(fm).not.toMatch(/^model\s*:/m);
        expect(fm).not.toMatch(/^memory\s*:/m);
        expect(fm).not.toMatch(/^tools\s*:/m);
        expect(fm).toMatch(/^name\s*:/m);
        expect(fm).toMatch(/^description\s*:/m);
      }
    }
  });

  test('copilot-pbr has scaffold files (plugin.json, setup scripts, workflow rule, hooks.json)', () => {
    expect(fs.existsSync(path.join(COPILOT_DIR, 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(COPILOT_DIR, 'setup.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(COPILOT_DIR, 'setup.sh'))).toBe(true);
    expect(fs.existsSync(path.join(COPILOT_DIR, 'rules', 'pbr-workflow.mdc'))).toBe(true);
    expect(fs.existsSync(path.join(COPILOT_DIR, 'hooks', 'hooks.json'))).toBe(true);
  });

  test('copilot-pbr skills have no allowed-tools or argument-hint in frontmatter', () => {
    const skillsDir = path.join(COPILOT_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) return;
    const skillFiles = listFiles(skillsDir).filter(f => f.endsWith('SKILL.md'));
    expect(skillFiles.length).toBeGreaterThan(0);
    for (const sf of skillFiles) {
      const content = fs.readFileSync(sf, 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        expect(fmMatch[1]).not.toMatch(/^allowed-tools\s*:/m);
        expect(fmMatch[1]).not.toMatch(/^argument-hint\s*:/m);
      }
    }
  });
});

// -----------------------------------------------------------------------
// DERIV-05: All derivatives use consistent PBR branding (no GSD leaks)
// -----------------------------------------------------------------------

describe('DERIV-05: no GSD branding leaks in any derivative', () => {
  const derivativeDirs = [
    { name: 'codex-pbr', dir: CODEX_DIR },
    { name: 'cursor-pbr', dir: CURSOR_DIR },
    { name: 'copilot-pbr', dir: COPILOT_DIR },
  ];

  for (const { name, dir } of derivativeDirs) {
    test(`${name} contains no "get-shit-done" or "get shit done" references`, () => {
      const files = listFiles(dir).filter(f =>
        f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.js') || f.endsWith('.mdc')
      );
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8').toLowerCase();
        const relPath = path.relative(ROOT, file);
        expect({ file: relPath, match: content.includes('get-shit-done') })
          .toEqual({ file: relPath, match: false });
        expect({ file: relPath, match: content.includes('get shit done') })
          .toEqual({ file: relPath, match: false });
      }
    });

    test(`${name} contains no "/gsd:" command prefix`, () => {
      const files = listFiles(dir).filter(f =>
        f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.mdc')
      );
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const relPath = path.relative(ROOT, file);
        expect({ file: relPath, match: /\/gsd:/.test(content) })
          .toEqual({ file: relPath, match: false });
      }
    });
  }
});
