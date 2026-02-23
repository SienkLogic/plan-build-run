const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PBR_DIR = path.join(ROOT, 'plugins', 'pbr');
const CURSOR_DIR = path.join(ROOT, 'plugins', 'cursor-pbr');
const COPILOT_DIR = path.join(ROOT, 'plugins', 'copilot-pbr');

// All derivative plugins that should stay in sync with the canonical pbr plugin
const DERIVATIVES = [
  { name: 'cursor-pbr', dir: CURSOR_DIR, agentExt: '.md', hasArgumentHint: true, hookFormat: 'command' },
  { name: 'copilot-pbr', dir: COPILOT_DIR, agentExt: '.agent.md', hasArgumentHint: false, hookFormat: 'bash-powershell' },
];

/**
 * Parse YAML frontmatter from a SKILL.md file.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

/**
 * Extract markdown heading names (### level) from skill content.
 * Normalizes parenthetical annotations so cosmetic wording differences don't fail.
 */
function extractHeadings(content) {
  return [...content.matchAll(/^###\s+(.+)$/gm)]
    .map(m => m[1]
      .replace(/[`—]/g, '')
      .replace(/\(.*?\)/g, '')
      .trim()
    );
}

/**
 * Extract script names from hook commands (works for both command-string and bash/powershell formats).
 */
function extractScriptNamesFromHooks(hooks) {
  const names = [];
  for (const [, entries] of Object.entries(hooks.hooks)) {
    for (const entry of entries) {
      const hookList = entry.hooks || [];
      for (const h of hookList) {
        // command-string format (pbr, cursor-pbr)
        if (h.command) {
          const match = h.command.match(/([\w-]+\.js)(\s+\w+)?\s*$/);
          if (match) names.push(match[1]);
        }
        // bash/powershell format (copilot-pbr)
        if (h.bash) {
          const match = h.bash.match(/([\w-]+\.js)(\s+\w+)?\s*$/);
          if (match) names.push(match[1]);
        }
      }
    }
  }
  return names;
}

/**
 * Extract script name from a single hook entry.
 */
function scriptNameFromHook(h) {
  const cmd = h.command || h.bash || '';
  const match = cmd.match(/([\w-]+\.js)(\s+\w+)?\s*$/);
  return match ? match[1] : cmd;
}

/**
 * Get all relative files recursively.
 */
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

/**
 * Normalize agent names by stripping platform-specific extensions.
 * '.agent.md' (copilot) -> stem, '.md' (pbr/cursor) -> stem
 */
function normalizeAgentName(filename) {
  if (filename.endsWith('.agent.md')) return filename.slice(0, -'.agent.md'.length);
  if (filename.endsWith('.md')) return filename.slice(0, -'.md'.length);
  return filename;
}

// Hook events that Copilot CLI supports (subset of full set)
const COPILOT_SUPPORTED_EVENTS = ['sessionStart', 'sessionEnd', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'preCompact', 'stop', 'subagentStart', 'subagentStop', 'taskCompleted', 'configChange', 'userPromptSubmitted', 'errorOccurred'];

// Mapping from PBR/Cursor event names (PascalCase) to Copilot CLI event names (camelCase)
const EVENT_NAME_MAP = {
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PreCompact: 'preCompact',
  Stop: 'stop',
  SubagentStart: 'subagentStart',
  SubagentStop: 'subagentStop',
  TaskCompleted: 'taskCompleted',
  ConfigChange: 'configChange',
  PostToolUseFailure: 'postToolUseFailure',
};

describe('cross-plugin compatibility', () => {
  // eslint-disable-next-line no-unused-vars
  describe.each(DERIVATIVES)('$name', ({ name, dir, agentExt, hasArgumentHint, hookFormat }) => {

    test('plugin manifest is valid', () => {
      const hooks = JSON.parse(
        fs.readFileSync(path.join(dir, 'hooks', 'hooks.json'), 'utf8')
      );
      expect(hooks).toHaveProperty('hooks');

      expect(fs.existsSync(path.join(dir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'skills'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'hooks'))).toBe(true);
    });

    test('no conflicting script paths', () => {
      // Derivative should NOT have its own scripts/ directory that shadows pbr scripts
      const derivScriptsDir = path.join(dir, 'scripts');
      if (fs.existsSync(derivScriptsDir)) {
        const derivOwnScripts = fs.readdirSync(derivScriptsDir);
        const pbrOwnScripts = fs.readdirSync(path.join(PBR_DIR, 'scripts'));
        const duplicates = derivOwnScripts.filter(s => pbrOwnScripts.includes(s));
        expect(duplicates).toEqual([]);
      }

      // Should reference scripts that exist
      const hooks = JSON.parse(
        fs.readFileSync(path.join(dir, 'hooks', 'hooks.json'), 'utf8')
      );
      const scripts = extractScriptNamesFromHooks(hooks);
      expect(scripts.length).toBeGreaterThan(0);
    });

    test('shared .planning/ format', () => {
      const derivBuild = fs.readFileSync(
        path.join(dir, 'skills', 'build', 'SKILL.md'), 'utf8'
      );
      expect(derivBuild).toMatch(/STATE\.md/);
      expect(derivBuild).toMatch(/\.planning/);
    });

    test('agent names consistent', () => {
      const pbrAgents = fs.readdirSync(path.join(PBR_DIR, 'agents'))
        .filter(f => f.endsWith('.md'))
        .map(normalizeAgentName)
        .sort();
      const derivAgents = fs.readdirSync(path.join(dir, 'agents'))
        .filter(f => f.endsWith('.md'))
        .map(normalizeAgentName)
        .sort();
      expect(derivAgents).toEqual(pbrAgents);
    });

    test('skill names consistent', () => {
      const pbrSkills = fs.readdirSync(path.join(PBR_DIR, 'skills'))
        .filter(f => fs.statSync(path.join(PBR_DIR, 'skills', f)).isDirectory())
        .sort();
      const derivSkills = fs.readdirSync(path.join(dir, 'skills'))
        .filter(f => fs.statSync(path.join(dir, 'skills', f)).isDirectory())
        .sort();
      expect(derivSkills).toEqual(pbrSkills);
    });

    test('config.json compatible', () => {
      const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'fake-project', '.planning');
      if (fs.existsSync(path.join(fixturePath, 'config.json'))) {
        const config = JSON.parse(
          fs.readFileSync(path.join(fixturePath, 'config.json'), 'utf8')
        );
        expect(typeof config).toBe('object');
        expect(config).not.toBeNull();
      }

      const derivStatus = fs.readFileSync(
        path.join(dir, 'skills', 'status', 'SKILL.md'), 'utf8'
      );
      expect(derivStatus).toMatch(/config/i);
    });

    test('no file conflicts with pbr', () => {
      const pbrFiles = getRelativeFiles(PBR_DIR);
      const derivFiles = getRelativeFiles(dir);

      const expectedShared = ['hooks/hooks.json'];

      const unexpectedOverlap = derivFiles.filter(f => {
        if (expectedShared.includes(f.split(path.sep).join('/'))) return false;
        if (f.startsWith('agents' + path.sep)) return false;
        if (f.startsWith('skills' + path.sep)) return false;
        if (f.startsWith('templates' + path.sep)) return false;
        if (f.startsWith('references' + path.sep)) return false;
        return pbrFiles.includes(f);
      });

      expect(unexpectedOverlap).toEqual([]);
    });

    // Hook sync tests — platform-aware
    describe('hook event and matcher sync', () => {
      let pbrHooks, derivHooks;

      beforeAll(() => {
        pbrHooks = JSON.parse(
          fs.readFileSync(path.join(PBR_DIR, 'hooks', 'hooks.json'), 'utf8')
        );
        derivHooks = JSON.parse(
          fs.readFileSync(path.join(dir, 'hooks', 'hooks.json'), 'utf8')
        );
      });

      if (hookFormat === 'command') {
        // Cursor: exact event match with PBR (same format, same events)
        test('same hook event types registered', () => {
          const pbrEvents = Object.keys(pbrHooks.hooks).sort();
          const derivEvents = Object.keys(derivHooks.hooks).sort();
          expect(derivEvents).toEqual(pbrEvents);
        });

        test('same matchers per hook event', () => {
          for (const event of Object.keys(pbrHooks.hooks)) {
            const pbrMatchers = pbrHooks.hooks[event]
              .map(e => e.matcher || '(all)')
              .sort();
            const derivMatchers = derivHooks.hooks[event]
              .map(e => e.matcher || '(all)')
              .sort();
            expect(derivMatchers).toEqual(pbrMatchers);
          }
        });

        test('same scripts referenced per matcher', () => {
          for (const event of Object.keys(pbrHooks.hooks)) {
            const pbrEntries = pbrHooks.hooks[event];
            const derivEntries = derivHooks.hooks[event];

            const pbrScripts = pbrEntries.flatMap(e =>
              (e.hooks || []).map(h => `${e.matcher || '(all)'}:${scriptNameFromHook(h)}`)
            ).sort();
            const derivScripts = derivEntries.flatMap(e =>
              (e.hooks || []).map(h => `${e.matcher || '(all)'}:${scriptNameFromHook(h)}`)
            ).sort();

            expect(derivScripts).toEqual(pbrScripts);
          }
        });
      } else {
        // Copilot CLI: subset of events with different naming
        test('covers all supported PBR hook events', () => {
          const derivEvents = Object.keys(derivHooks.hooks).sort();

          // Every event in the derivative should map to a supported Copilot event
          for (const event of derivEvents) {
            expect(COPILOT_SUPPORTED_EVENTS).toContain(event);
          }

          // Every PBR event that HAS a Copilot mapping should be present
          for (const [pbrEvent, copilotEvent] of Object.entries(EVENT_NAME_MAP)) {
            if (copilotEvent && pbrHooks.hooks[pbrEvent]) {
              expect(derivEvents).toContain(copilotEvent);
            }
          }
        });

        test('same matchers for mapped events', () => {
          for (const [pbrEvent, copilotEvent] of Object.entries(EVENT_NAME_MAP)) {
            if (!copilotEvent || !pbrHooks.hooks[pbrEvent] || !derivHooks.hooks[copilotEvent]) continue;

            const pbrMatchers = pbrHooks.hooks[pbrEvent]
              .map(e => e.matcher || '(all)')
              .sort();
            const derivMatchers = derivHooks.hooks[copilotEvent]
              .map(e => e.matcher || '(all)')
              .sort();
            expect(derivMatchers).toEqual(pbrMatchers);
          }
        });

        test('same scripts referenced for mapped events', () => {
          for (const [pbrEvent, copilotEvent] of Object.entries(EVENT_NAME_MAP)) {
            if (!copilotEvent || !pbrHooks.hooks[pbrEvent] || !derivHooks.hooks[copilotEvent]) continue;

            const pbrEntries = pbrHooks.hooks[pbrEvent];
            const derivEntries = derivHooks.hooks[copilotEvent];

            const pbrScripts = pbrEntries.flatMap(e =>
              (e.hooks || []).map(h => `${e.matcher || '(all)'}:${scriptNameFromHook(h)}`)
            ).sort();
            const derivScripts = derivEntries.flatMap(e =>
              (e.hooks || []).map(h => `${e.matcher || '(all)'}:${scriptNameFromHook(h)}`)
            ).sort();

            expect(derivScripts).toEqual(pbrScripts);
          }
        });
      }
    });

    // Skill content sync
    describe('skill content sync', () => {
      const skillDirs = fs.readdirSync(path.join(PBR_DIR, 'skills'))
        .filter(f => {
          const p = path.join(PBR_DIR, 'skills', f);
          return fs.statSync(p).isDirectory() && f !== 'shared';
        });

      if (hasArgumentHint) {
        test.each(skillDirs)('skill "%s" has matching argument-hint', (skill) => {
          const pbrContent = fs.readFileSync(
            path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
          );
          const derivContent = fs.readFileSync(
            path.join(dir, 'skills', skill, 'SKILL.md'), 'utf8'
          );

          const pbrFm = parseFrontmatter(pbrContent);
          const derivFm = parseFrontmatter(derivContent);

          if (pbrFm['argument-hint']) {
            expect(derivFm['argument-hint']).toBe(pbrFm['argument-hint']);
          }
        });
      } else {
        test.each(skillDirs)('skill "%s" has no argument-hint (unsupported)', (skill) => {
          const derivContent = fs.readFileSync(
            path.join(dir, 'skills', skill, 'SKILL.md'), 'utf8'
          );
          const derivFm = parseFrontmatter(derivContent);
          expect(derivFm['argument-hint']).toBeUndefined();
        });
      }

      test.each(skillDirs)('skill "%s" has matching subcommand headings', (skill) => {
        const pbrContent = fs.readFileSync(
          path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
        );
        const derivContent = fs.readFileSync(
          path.join(dir, 'skills', skill, 'SKILL.md'), 'utf8'
        );

        const pbrHeadings = extractHeadings(pbrContent);
        const derivHeadings = extractHeadings(derivContent);
        expect(derivHeadings).toEqual(pbrHeadings);
      });

      test.each(skillDirs)('skill "%s" has matching description', (skill) => {
        const pbrContent = fs.readFileSync(
          path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
        );
        const derivContent = fs.readFileSync(
          path.join(dir, 'skills', skill, 'SKILL.md'), 'utf8'
        );

        const pbrFm = parseFrontmatter(pbrContent);
        const derivFm = parseFrontmatter(derivContent);
        expect(derivFm.description).toBe(pbrFm.description);
      });
    });

    // Verify derivative skills don't reference paths that only exist in the canonical plugin
    describe('skill path references', () => {
      test('dashboard skill references a reachable dashboard path', () => {
        const dashboardSkill = fs.readFileSync(
          path.join(dir, 'skills', 'dashboard', 'SKILL.md'), 'utf8'
        );
        // Derivative plugins are at plugins/{name}/ — dashboard is at ../../dashboard/
        // Skills should NOT reference <plugin-root>/dashboard/ (doesn't exist in derivatives)
        expect(dashboardSkill).not.toMatch(/\$\{.*PLUGIN_ROOT\}\/dashboard/);
        expect(dashboardSkill).not.toMatch(/<plugin-root>\/dashboard/);
      });
    });

    // Verify references/ and templates/ directories have the same files as PBR
    describe('shared resource sync', () => {
      test('references/ files match PBR', () => {
        const pbrRefs = fs.readdirSync(path.join(PBR_DIR, 'references'))
          .filter(f => f.endsWith('.md'))
          .sort();
        const derivRefs = fs.readdirSync(path.join(dir, 'references'))
          .filter(f => f.endsWith('.md'))
          .sort();
        expect(derivRefs).toEqual(pbrRefs);
      });

      test('templates/ files match PBR', () => {
        function listTemplates(base) {
          const files = [];
          function walk(current, prefix) {
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
              const rel = prefix ? path.join(prefix, entry.name) : entry.name;
              if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
              else files.push(rel);
            }
          }
          walk(base, '');
          return files.sort();
        }
        const pbrTemplates = listTemplates(path.join(PBR_DIR, 'templates'));
        const derivTemplates = listTemplates(path.join(dir, 'templates'));
        expect(derivTemplates).toEqual(pbrTemplates);
      });
    });
  });

  describe('content semantics sync', () => {
    const HIGH_RISK_SKILLS = ['quick', 'build', 'begin', 'plan', 'review'];

    test.each(HIGH_RISK_SKILLS)('skill "%s" has same CRITICAL marker count across plugins', (skill) => {
      const pbrContent = fs.readFileSync(
        path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );
      const pbrCriticalCount = (pbrContent.match(/\bCRITICAL\b/g) || []).length;

      for (const { dir } of DERIVATIVES) {
        const derivContent = fs.readFileSync(
          path.join(dir, 'skills', skill, 'SKILL.md'), 'utf8'
        );
        const derivCriticalCount = (derivContent.match(/\bCRITICAL\b/g) || []).length;
        expect(derivCriticalCount).toBe(pbrCriticalCount);
      }
    });

    test.each(HIGH_RISK_SKILLS)('skill "%s" has same numbered step count across plugins', (skill) => {
      const pbrContent = fs.readFileSync(
        path.join(PBR_DIR, 'skills', skill, 'SKILL.md'), 'utf8'
      );
      // Count top-level numbered steps: "## Step N" or "**Step N"
      const pbrSteps = (pbrContent.match(/^#{1,3}\s+Step\s+\d+/gm) || []).length;

      for (const { dir } of DERIVATIVES) {
        const derivContent = fs.readFileSync(
          path.join(dir, 'skills', skill, 'SKILL.md'), 'utf8'
        );
        const derivSteps = (derivContent.match(/^#{1,3}\s+Step\s+\d+/gm) || []).length;
        expect(derivSteps).toBe(pbrSteps);
      }
    });
  });

  describe('references/ content identity', () => {
    test('references/ files are content-identical across all 3 plugins', () => {
      const pbrRefsDir = path.join(PBR_DIR, 'references');
      const pbrFiles = fs.readdirSync(pbrRefsDir).filter(f => f.endsWith('.md')).sort();

      for (const file of pbrFiles) {
        const pbrContent = fs.readFileSync(path.join(pbrRefsDir, file), 'utf8');

        for (const { name, dir: derivDir } of DERIVATIVES) {
          const derivPath = path.join(derivDir, 'references', file);
          expect(fs.existsSync(derivPath)).toBe(true);
          const derivRaw = fs.existsSync(derivPath)
            ? fs.readFileSync(derivPath, 'utf8')
            : '';
          // Strip canonical comment header (first line if it starts with <!-- canonical:)
          const derivContent = derivRaw.replace(/^<!-- canonical:[^\n]*-->\r?\n/, '');
          expect(derivContent).toBe(pbrContent);
          if (derivContent !== pbrContent) {
            throw new Error(
              `references/${file} content differs in ${name}: expected content to match plugins/pbr/references/${file}`
            );
          }
        }
      }
    });
  });

  describe('templates/ content identity', () => {
    function listTemplateFiles(base) {
      const files = [];
      function walk(current, prefix) {
        if (!fs.existsSync(current)) return;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const rel = prefix ? path.join(prefix, entry.name) : entry.name;
          if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
          else files.push(rel);
        }
      }
      walk(base, '');
      return files.sort();
    }

    test('templates/ files are content-identical across all 3 plugins', () => {
      const pbrTmplDir = path.join(PBR_DIR, 'templates');
      const pbrFiles = listTemplateFiles(pbrTmplDir);

      for (const file of pbrFiles) {
        const pbrContent = fs.readFileSync(path.join(pbrTmplDir, file), 'utf8');

        for (const { name, dir: derivDir } of DERIVATIVES) {
          const derivPath = path.join(derivDir, 'templates', file);
          expect(fs.existsSync(derivPath)).toBe(true);
          const derivRaw = fs.existsSync(derivPath)
            ? fs.readFileSync(derivPath, 'utf8')
            : '';
          // Strip canonical comment header (first line if it starts with <!-- canonical:)
          const derivContent = derivRaw.replace(/^<!-- canonical:[^\n]*-->\r?\n/, '');
          expect(derivContent).toBe(pbrContent);
          if (derivContent !== pbrContent) {
            throw new Error(
              `templates/${file} content differs in ${name}: expected content to match plugins/pbr/templates/${file}`
            );
          }
        }
      }
    });
  });

  describe('version sync', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    const manifests = [
      { name: 'pbr', path: path.join(PBR_DIR, '.claude-plugin', 'plugin.json') },
      { name: 'cursor-pbr', path: path.join(CURSOR_DIR, '.cursor-plugin', 'plugin.json') },
      { name: 'copilot-pbr', path: path.join(COPILOT_DIR, 'plugin.json') },
    ];

    test.each(manifests)('$name manifest version matches package.json', ({ name: _name, path: manifestPath }) => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.version).toBe(pkg.version);
    });
  });
});
