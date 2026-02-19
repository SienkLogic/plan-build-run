const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PBR_DIR = path.join(ROOT, 'plugins', 'pbr');
const CURSOR_DIR = path.join(ROOT, 'plugins', 'cursor-pbr');

describe('cross-plugin compatibility', () => {
  test('both plugin manifests are valid', () => {
    // Both plugins must have hooks.json that parses as valid JSON
    const pbrHooks = JSON.parse(
      fs.readFileSync(path.join(PBR_DIR, 'hooks', 'hooks.json'), 'utf8')
    );
    const cursorHooks = JSON.parse(
      fs.readFileSync(path.join(CURSOR_DIR, 'hooks', 'hooks.json'), 'utf8')
    );

    expect(pbrHooks).toHaveProperty('hooks');
    expect(cursorHooks).toHaveProperty('hooks');

    // Both must have agents, skills, and hooks directories
    for (const dir of [PBR_DIR, CURSOR_DIR]) {
      expect(fs.existsSync(path.join(dir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'skills'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'hooks'))).toBe(true);
    }
  });

  test('no conflicting script paths', () => {
    const pbrHooks = JSON.parse(
      fs.readFileSync(path.join(PBR_DIR, 'hooks', 'hooks.json'), 'utf8')
    );
    const cursorHooks = JSON.parse(
      fs.readFileSync(path.join(CURSOR_DIR, 'hooks', 'hooks.json'), 'utf8')
    );

    // Extract script names from hook commands
    function extractScriptNames(hooks) {
      const names = [];
      for (const [, entries] of Object.entries(hooks.hooks)) {
        for (const entry of entries) {
          const hookList = entry.hooks || [];
          for (const h of hookList) {
            if (h.command) {
              // Scripts are referenced at the end of the command string
              const match = h.command.match(/['"]\s+([\w-]+\.js)\s*$/);
              if (match) names.push(match[1]);
            }
          }
        }
      }
      return names;
    }

    const pbrScripts = extractScriptNames(pbrHooks);
    const cursorScripts = extractScriptNames(cursorHooks);

    // Both should reference the same underlying scripts (cursor delegates to pbr)
    // The key check: cursor-pbr should NOT have its own scripts/ directory
    // that would shadow pbr scripts
    const cursorScriptsDir = path.join(CURSOR_DIR, 'scripts');
    if (fs.existsSync(cursorScriptsDir)) {
      const cursorOwnScripts = fs.readdirSync(cursorScriptsDir);
      const pbrOwnScripts = fs.readdirSync(path.join(PBR_DIR, 'scripts'));
      // If cursor has its own scripts, they should not duplicate pbr scripts
      const duplicates = cursorOwnScripts.filter(s => pbrOwnScripts.includes(s));
      expect(duplicates).toEqual([]);
    }

    // Both plugins should reference scripts that exist
    expect(pbrScripts.length).toBeGreaterThan(0);
    expect(cursorScripts.length).toBeGreaterThan(0);
  });

  test('shared .planning/ format', () => {
    // Both plugins reference the same STATE.md and config.json patterns
    // Verify by checking that skills in both plugins reference .planning/ paths
    const pbrBuildSkill = fs.readFileSync(
      path.join(PBR_DIR, 'skills', 'build', 'SKILL.md'), 'utf8'
    );
    const cursorBuildSkill = fs.readFileSync(
      path.join(CURSOR_DIR, 'skills', 'build', 'SKILL.md'), 'utf8'
    );

    // Both should reference STATE.md
    expect(pbrBuildSkill).toMatch(/STATE\.md/);
    expect(cursorBuildSkill).toMatch(/STATE\.md/);

    // Both should reference .planning/
    expect(pbrBuildSkill).toMatch(/\.planning/);
    expect(cursorBuildSkill).toMatch(/\.planning/);
  });

  test('agent names consistent', () => {
    const pbrAgents = fs.readdirSync(path.join(PBR_DIR, 'agents'))
      .filter(f => f.endsWith('.md'))
      .sort();
    const cursorAgents = fs.readdirSync(path.join(CURSOR_DIR, 'agents'))
      .filter(f => f.endsWith('.md'))
      .sort();

    expect(cursorAgents).toEqual(pbrAgents);
  });

  test('skill names consistent', () => {
    const pbrSkills = fs.readdirSync(path.join(PBR_DIR, 'skills'))
      .filter(f => fs.statSync(path.join(PBR_DIR, 'skills', f)).isDirectory())
      .sort();
    const cursorSkills = fs.readdirSync(path.join(CURSOR_DIR, 'skills'))
      .filter(f => fs.statSync(path.join(CURSOR_DIR, 'skills', f)).isDirectory())
      .sort();

    expect(cursorSkills).toEqual(pbrSkills);
  });

  test('config.json compatible', () => {
    // Both plugins should be able to use the same config.json
    // Verify by checking that config references in both plugins point
    // to the same .planning/config.json path
    const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'fake-project', '.planning');
    if (fs.existsSync(path.join(fixturePath, 'config.json'))) {
      const config = JSON.parse(
        fs.readFileSync(path.join(fixturePath, 'config.json'), 'utf8')
      );
      // Config should be a valid object usable by both plugins
      expect(typeof config).toBe('object');
      expect(config).not.toBeNull();
    }

    // Both plugins' status skills should reference config.json
    const pbrStatusSkill = fs.readFileSync(
      path.join(PBR_DIR, 'skills', 'status', 'SKILL.md'), 'utf8'
    );
    const cursorStatusSkill = fs.readFileSync(
      path.join(CURSOR_DIR, 'skills', 'status', 'SKILL.md'), 'utf8'
    );

    expect(pbrStatusSkill).toMatch(/config/i);
    expect(cursorStatusSkill).toMatch(/config/i);
  });

  test('no file conflicts', () => {
    // cursor-pbr files should not overlap with pbr files
    // (excluding intentionally shared structures like agents/, skills/)
    function getRelativeFiles(dir) {
      const files = [];
      function walk(current, prefix) {
        if (!fs.existsSync(current)) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const rel = prefix ? path.join(prefix, entry.name) : entry.name;
          if (entry.isDirectory()) {
            walk(path.join(current, entry.name), rel);
          } else {
            files.push(rel);
          }
        }
      }
      walk(dir, '');
      return files;
    }

    const pbrFiles = getRelativeFiles(PBR_DIR);
    const cursorFiles = getRelativeFiles(CURSOR_DIR);

    // Files that are expected to have the same relative path (structural mirrors)
    const expectedShared = ['hooks/hooks.json'];

    // Filter out expected shared paths and agent/skill files (those ARE meant to match)
    const unexpectedOverlap = cursorFiles.filter(f => {
      if (expectedShared.includes(f.split(path.sep).join('/'))) return false;
      if (f.startsWith('agents' + path.sep)) return false;
      if (f.startsWith('skills' + path.sep)) return false;
      if (f.startsWith('templates' + path.sep)) return false;
      if (f.startsWith('references' + path.sep)) return false;
      return pbrFiles.includes(f);
    });

    expect(unexpectedOverlap).toEqual([]);
  });

  describe('hook event and matcher sync', () => {
    let pbrHooks, cursorHooks;

    beforeAll(() => {
      pbrHooks = JSON.parse(
        fs.readFileSync(path.join(PBR_DIR, 'hooks', 'hooks.json'), 'utf8')
      );
      cursorHooks = JSON.parse(
        fs.readFileSync(path.join(CURSOR_DIR, 'hooks', 'hooks.json'), 'utf8')
      );
    });

    test('same hook event types registered', () => {
      const pbrEvents = Object.keys(pbrHooks.hooks).sort();
      const cursorEvents = Object.keys(cursorHooks.hooks).sort();
      expect(cursorEvents).toEqual(pbrEvents);
    });

    test('same matchers per hook event', () => {
      for (const event of Object.keys(pbrHooks.hooks)) {
        const pbrMatchers = pbrHooks.hooks[event]
          .map(e => e.matcher || '(all)')
          .sort();
        const cursorMatchers = cursorHooks.hooks[event]
          .map(e => e.matcher || '(all)')
          .sort();
        expect(cursorMatchers).toEqual(pbrMatchers);
      }
    });

    test('same scripts referenced per matcher', () => {
      // Extract script name from the end of a hook command string
      function scriptName(command) {
        const match = command.match(/([\w-]+\.js)(\s+\w+)?\s*$/);
        return match ? match[1] : command;
      }

      for (const event of Object.keys(pbrHooks.hooks)) {
        const pbrEntries = pbrHooks.hooks[event];
        const cursorEntries = cursorHooks.hooks[event];

        const pbrScripts = pbrEntries.flatMap(e =>
          (e.hooks || []).map(h => `${e.matcher || '(all)'}:${scriptName(h.command)}`)
        ).sort();
        const cursorScripts = cursorEntries.flatMap(e =>
          (e.hooks || []).map(h => `${e.matcher || '(all)'}:${scriptName(h.command)}`)
        ).sort();

        expect(cursorScripts).toEqual(pbrScripts);
      }
    });
  });

  describe('skill content sync', () => {
    /**
     * Parse YAML frontmatter from a SKILL.md file.
     * Returns an object with the frontmatter fields we care about.
     */
    function parseFrontmatter(content) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return {};
      const fm = {};
      for (const line of match[1].split('\n')) {
        const kv = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
        if (kv) fm[kv[1]] = kv[2];
      }
      return fm;
    }

    /**
     * Extract markdown heading names (### level) from skill content.
     * These represent subcommands and structural sections.
     * Normalizes parenthetical annotations so cosmetic wording differences
     * (e.g., "delegated to subagents" vs "delegated to agents") don't fail.
     */
    function extractHeadings(content) {
      return [...content.matchAll(/^###\s+(.+)$/gm)]
        .map(m => m[1]
          .replace(/[`—]/g, '')
          .replace(/\(.*?\)/g, '')  // strip parenthetical annotations
          .trim()
        );
    }

    const skillDirs = fs.readdirSync(path.join(PBR_DIR, 'skills'))
      .filter(f => {
        const p = path.join(PBR_DIR, 'skills', f);
        return fs.statSync(p).isDirectory() && f !== 'shared';
      });

    test.each(skillDirs)('skill "%s" has matching argument-hint', (skill) => {
      const pbrContent = fs.readFileSync(
        path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );
      const cursorContent = fs.readFileSync(
        path.join(CURSOR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );

      const pbrFm = parseFrontmatter(pbrContent);
      const cursorFm = parseFrontmatter(cursorContent);

      // argument-hint defines the user-facing CLI interface — must match
      if (pbrFm['argument-hint']) {
        expect(cursorFm['argument-hint']).toBe(pbrFm['argument-hint']);
      }
    });

    test.each(skillDirs)('skill "%s" has matching subcommand headings', (skill) => {
      const pbrContent = fs.readFileSync(
        path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );
      const cursorContent = fs.readFileSync(
        path.join(CURSOR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );

      const pbrHeadings = extractHeadings(pbrContent);
      const cursorHeadings = extractHeadings(cursorContent);

      // Subcommand headings define the skill's behavior structure — must match
      expect(cursorHeadings).toEqual(pbrHeadings);
    });

    test.each(skillDirs)('skill "%s" has matching description', (skill) => {
      const pbrContent = fs.readFileSync(
        path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );
      const cursorContent = fs.readFileSync(
        path.join(CURSOR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );

      const pbrFm = parseFrontmatter(pbrContent);
      const cursorFm = parseFrontmatter(cursorContent);

      expect(cursorFm.description).toBe(pbrFm.description);
    });
  });
});
