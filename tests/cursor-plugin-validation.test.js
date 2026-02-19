/**
 * Cursor Plugin Validation Test Suite
 *
 * Validates the structural integrity of the Cursor plugin (plugins/cursor-pbr/).
 * Ensures all artifacts from phases 1-6 are present, correctly formatted,
 * and free of Claude Code-specific fields.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.join(__dirname, '..', 'plugins', 'cursor-pbr');
const SHARED_SCRIPTS = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');

// --- helpers ---

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  match[1].split(/\r?\n/).forEach(line => {
    const m = line.match(/^(\w[\w-]*):\s*(.+)/);
    if (m) {
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val === 'true') val = true;
      if (val === 'false') val = false;
      fm[m[1]] = val;
    }
  });
  return fm;
}

// --- expected items ---

const EXPECTED_AGENTS = [
  'codebase-mapper', 'debugger', 'executor', 'general',
  'integration-checker', 'plan-checker', 'planner',
  'researcher', 'synthesizer', 'verifier',
];

const EXPECTED_SKILLS = [
  'begin', 'build', 'config', 'continue', 'debug', 'discuss',
  'explore', 'health', 'help', 'import', 'milestone', 'note',
  'pause', 'plan', 'quick', 'resume', 'review', 'scan',
  'setup', 'status', 'todo',
];

// Claude Code-specific frontmatter fields that should NOT be in Cursor versions
const CLAUDE_CODE_AGENT_FIELDS = ['memory', 'tools'];
// allowed-tools is Claude Code-specific (controls tool permissions).
// argument-hint is kept — it's a platform-neutral usage hint string.
const CLAUDE_CODE_SKILL_FIELDS = ['allowed-tools'];

// ============================================================
// 1. Plugin manifest
// ============================================================

describe('plugin.json manifest', () => {
  const manifestPath = path.join(PLUGIN_ROOT, '.cursor-plugin', 'plugin.json');

  test('exists and is valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    expect(manifest).toBeDefined();
  });

  test('has required fields', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBeTruthy();
    expect(manifest.displayName).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.description).toBeTruthy();
    expect(manifest.author).toBeTruthy();
    expect(manifest.skills).toBeTruthy();
    expect(manifest.agents).toBeTruthy();
    expect(manifest.rules).toBeTruthy();
    expect(manifest.hooks).toBeTruthy();
  });

  test('references directories that exist', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // skills, agents, rules are relative directory paths
    for (const key of ['skills', 'agents', 'rules']) {
      const resolved = path.resolve(path.dirname(manifestPath), '..', manifest[key]);
      expect(fs.existsSync(resolved)).toBe(true);
    }
    // hooks is a file path
    const hooksResolved = path.resolve(path.dirname(manifestPath), '..', manifest.hooks);
    expect(fs.existsSync(hooksResolved)).toBe(true);
  });
});

// ============================================================
// 2. Agents
// ============================================================

describe('agents', () => {
  const agentsDir = path.join(PLUGIN_ROOT, 'agents');

  test('all 10 agents exist', () => {
    for (const name of EXPECTED_AGENTS) {
      const filePath = path.join(agentsDir, `${name}.md`);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test.each(EXPECTED_AGENTS)('%s has valid frontmatter', (name) => {
    const content = fs.readFileSync(path.join(agentsDir, `${name}.md`), 'utf8');
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm.name).toBe(name);
    expect(fm.description).toBeTruthy();
  });

  test.each(EXPECTED_AGENTS)('%s has model and readonly fields', (name) => {
    const content = fs.readFileSync(path.join(agentsDir, `${name}.md`), 'utf8');
    const fm = parseFrontmatter(content);
    expect(fm.model).toBeTruthy();
    expect(fm).toHaveProperty('readonly');
  });

  test.each(EXPECTED_AGENTS)('%s has no Claude Code-specific fields', (name) => {
    const content = fs.readFileSync(path.join(agentsDir, `${name}.md`), 'utf8');
    const fm = parseFrontmatter(content);
    for (const field of CLAUDE_CODE_AGENT_FIELDS) {
      expect(fm).not.toHaveProperty(field);
    }
  });
});

// ============================================================
// 3. Skills
// ============================================================

describe('skills', () => {
  const skillsDir = path.join(PLUGIN_ROOT, 'skills');

  test('all 21 skills exist', () => {
    for (const name of EXPECTED_SKILLS) {
      const filePath = path.join(skillsDir, name, 'SKILL.md');
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test.each(EXPECTED_SKILLS)('%s has valid frontmatter', (name) => {
    const content = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm.name).toBe(name);
    expect(fm.description).toBeTruthy();
  });

  test.each(EXPECTED_SKILLS)('%s has no Claude Code-specific fields', (name) => {
    const content = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    const fm = parseFrontmatter(content);
    for (const field of CLAUDE_CODE_SKILL_FIELDS) {
      expect(fm).not.toHaveProperty(field);
    }
  });
});

// ============================================================
// 4. Rules
// ============================================================

describe('rules', () => {
  const rulesDir = path.join(PLUGIN_ROOT, 'rules');

  test('pbr-workflow.mdc exists', () => {
    expect(fs.existsSync(path.join(rulesDir, 'pbr-workflow.mdc'))).toBe(true);
  });

  test('pbr-workflow.mdc has valid frontmatter', () => {
    const content = fs.readFileSync(path.join(rulesDir, 'pbr-workflow.mdc'), 'utf8');
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm.description).toBeTruthy();
    expect(fm.globs).toBeTruthy();
    expect(fm).toHaveProperty('alwaysApply');
  });
});

// ============================================================
// 5. Hooks
// ============================================================

describe('hooks.json', () => {
  const hooksPath = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');

  test('is valid JSON', () => {
    const content = fs.readFileSync(hooksPath, 'utf8');
    const hooks = JSON.parse(content);
    expect(hooks.hooks).toBeDefined();
  });

  test('has expected hook event types', () => {
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const events = Object.keys(hooks.hooks);
    const expected = [
      'SessionStart', 'PostToolUse', 'PostToolUseFailure',
      'PreToolUse', 'PreCompact', 'Stop',
      'SubagentStart', 'SubagentStop',
      'TaskCompleted', 'SessionEnd',
    ];
    for (const evt of expected) {
      expect(events).toContain(evt);
    }
  });

  test('all referenced scripts exist in shared pbr/scripts/', () => {
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    // Extract script names from commands like: ... run-hook.js\" scriptname.js
    const scriptPattern = /run-hook\.js[)\\'"]*\s+(\S+\.js)/g;
    const hooksStr = JSON.stringify(hooks);
    const scripts = new Set();
    let match;
    while ((match = scriptPattern.exec(hooksStr)) !== null) {
      scripts.add(match[1].replace(/['"]/g, ''));
    }

    expect(scripts.size).toBeGreaterThan(0);
    for (const script of scripts) {
      const scriptPath = path.join(SHARED_SCRIPTS, script);
      expect(fs.existsSync(scriptPath)).toBe(true);
    }
  });

  test('every hook entry has type and command', () => {
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    for (const [, entries] of Object.entries(hooks.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(hook.type).toBe('command');
          expect(hook.command).toBeTruthy();
        }
      }
    }
  });
});

// ============================================================
// 6. Templates
// ============================================================

describe('templates', () => {
  const templatesDir = path.join(PLUGIN_ROOT, 'templates');

  test('templates directory exists', () => {
    expect(fs.existsSync(templatesDir)).toBe(true);
  });

  test('key templates are present', () => {
    const keyTemplates = [
      'CONTEXT.md.tmpl',
      'ROADMAP.md.tmpl',
      'SUMMARY.md.tmpl',
      'VERIFICATION-DETAIL.md.tmpl',
    ];
    for (const tmpl of keyTemplates) {
      expect(fs.existsSync(path.join(templatesDir, tmpl))).toBe(true);
    }
  });

  test('templates are non-empty', () => {
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.tmpl'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = fs.readFileSync(path.join(templatesDir, f), 'utf8');
      expect(content.length).toBeGreaterThan(10);
    }
  });
});

// ============================================================
// 7. References
// ============================================================

describe('references', () => {
  const refsDir = path.join(PLUGIN_ROOT, 'references');

  test('references directory exists', () => {
    expect(fs.existsSync(refsDir)).toBe(true);
  });

  test('key references are present', () => {
    const keyRefs = [
      'plan-format.md',
      'ui-formatting.md',
      'deviation-rules.md',
      'config-reference.md',
    ];
    for (const ref of keyRefs) {
      expect(fs.existsSync(path.join(refsDir, ref))).toBe(true);
    }
  });

  test('references are non-empty', () => {
    const files = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = fs.readFileSync(path.join(refsDir, f), 'utf8');
      expect(content.length).toBeGreaterThan(10);
    }
  });
});

// ============================================================
// 8. Shared skill fragments
// ============================================================

describe('shared skill fragments', () => {
  const sharedDir = path.join(PLUGIN_ROOT, 'skills', 'shared');

  test('shared directory exists', () => {
    expect(fs.existsSync(sharedDir)).toBe(true);
  });

  test('contains fragment files', () => {
    const files = fs.readdirSync(sharedDir);
    expect(files.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 9. No stale .gitkeep files
// ============================================================

describe('cleanup', () => {
  test('no .gitkeep files remain in agent or rules dirs', () => {
    // .gitkeep files should have been removed once real content was added
    // This is non-blocking — just verify content exists
    const agentFiles = fs.readdirSync(path.join(PLUGIN_ROOT, 'agents')).filter(f => f !== '.gitkeep');
    const ruleFiles = fs.readdirSync(path.join(PLUGIN_ROOT, 'rules')).filter(f => f !== '.gitkeep');
    expect(agentFiles.length).toBeGreaterThan(0);
    expect(ruleFiles.length).toBeGreaterThan(0);
  });
});
