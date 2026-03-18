/**
 * Tests for plugins/pbr/scripts/architecture-guard.js
 *
 * PostToolUse hook that checks written files for architecture pattern
 * conformance: CJS libs, hook scripts, agent definitions, skill definitions.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getLogFilename } = require('../hooks/hook-logger');
const { clearRootCache } = require('../hooks/lib/resolve-root');

// Helper: create a temp project with .planning
function makeTempProject(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-guard-test-'));
  const planningDir = path.join(tmp, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const config = {
    version: 2,
    features: {
      architecture_graph: true,
      architecture_guard: opts.guardEnabled !== false
    }
  };
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config, null, 2));

  return { tmp, planningDir };
}

function cleanupTemp(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

// Helper: write a temp file and return its absolute path
function writeFile(tmp, relPath, content) {
  const absPath = path.join(tmp, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
  return absPath;
}

// Load module under test
const {
  checkCjsLib,
  checkHookScript,
  checkAgentDef,
  checkSkillDef,
  runGuard
} = require('../plugins/pbr/scripts/architecture-guard.js');

describe('architecture-guard.js', () => {
  describe('checkCjsLib', () => {
    test('detects missing module.exports in lib/*.cjs files', () => {
      const content = "'use strict';\nfunction helper() {}\n// exports missing";
      const result = checkCjsLib('plan-build-run/bin/lib/my-util.cjs', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/module\.exports/i);
    });

    test('detects missing use strict in lib/*.cjs files', () => {
      const content = 'function helper() {}\nmodule.exports = { helper };';
      const result = checkCjsLib('plan-build-run/bin/lib/my-util.cjs', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/use strict/i);
    });

    test('returns null for conforming lib/*.cjs files', () => {
      const content = "'use strict';\nfunction helper() {}\nmodule.exports = { helper };";
      const result = checkCjsLib('plan-build-run/bin/lib/my-util.cjs', content);
      expect(result).toBeNull();
    });

    test('returns null for non-lib files', () => {
      const content = 'function x() {}'; // missing both
      const result = checkCjsLib('src/utils.js', content);
      expect(result).toBeNull(); // not a lib/*.cjs path
    });
  });

  describe('checkHookScript', () => {
    test('detects hook script missing logHook import', () => {
      const content = "const fs = require('fs');\nprocess.stdin.on('data', () => {});";
      const result = checkHookScript('plugins/pbr/scripts/my-hook.js', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/logHook|hook-logger/i);
    });

    test('detects hook script missing stdin read', () => {
      const content = "const { logHook } = require('./hook-logger');\n// no stdin";
      const result = checkHookScript('plugins/pbr/scripts/my-hook.js', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/stdin/i);
    });

    test('returns null for conforming hook scripts', () => {
      const content = "const { logHook } = require('./hook-logger');\nprocess.stdin.on('data', (c) => {});";
      const result = checkHookScript('plugins/pbr/scripts/my-hook.js', content);
      expect(result).toBeNull();
    });

    test('returns null for non-hook-script paths', () => {
      const content = 'function x() {}'; // missing both
      const result = checkHookScript('src/something.js', content);
      expect(result).toBeNull(); // not a plugins/pbr/scripts path
    });
  });

  describe('checkAgentDef', () => {
    test('detects agent .md file missing required frontmatter fields (name, description)', () => {
      const content = '---\ntools:\n  - Read\n---\nBody.';
      const result = checkAgentDef('plugins/pbr/agents/my-agent.md', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/name|description/i);
    });

    test('detects agent .md file missing tools list', () => {
      const content = '---\nname: my-agent\ndescription: "Test agent"\n---\nBody.';
      const result = checkAgentDef('plugins/pbr/agents/my-agent.md', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/tools/i);
    });

    test('returns null for conforming agent definition', () => {
      const content = '---\nname: my-agent\ndescription: "Test"\ntools:\n  - Read\n---\nBody.';
      const result = checkAgentDef('plugins/pbr/agents/my-agent.md', content);
      expect(result).toBeNull();
    });

    test('returns null for non-agent paths', () => {
      const content = 'no frontmatter';
      const result = checkAgentDef('docs/README.md', content);
      expect(result).toBeNull(); // not a plugins/pbr/agents path
    });
  });

  describe('checkSkillDef', () => {
    test('detects skill SKILL.md missing required frontmatter fields (name, description)', () => {
      const content = '---\nallowed-tools: Read\n---\nBody.';
      const result = checkSkillDef('plugins/pbr/skills/my-skill/SKILL.md', content);
      expect(result).toBeTruthy();
      expect(result).toMatch(/name|description/i);
    });

    test('returns null for conforming skill definition', () => {
      const content = '---\nname: my-skill\ndescription: "Does stuff"\n---\nBody.';
      const result = checkSkillDef('plugins/pbr/skills/my-skill/SKILL.md', content);
      expect(result).toBeNull();
    });

    test('returns null for non-skill paths', () => {
      const content = 'no frontmatter';
      const result = checkSkillDef('docs/README.md', content);
      expect(result).toBeNull();
    });
  });

  describe('runGuard', () => {
    test('returns null for files matching established patterns', () => {
      const { tmp, planningDir } = makeTempProject();
      try {
        writeFile(tmp, 'plugins/pbr/scripts/good-hook.js',
          "const { logHook } = require('./hook-logger');\nprocess.stdin.on('data', (c) => {});");
        const relPath = 'plugins/pbr/scripts/good-hook.js';
        const result = runGuard(planningDir, tmp, relPath);
        expect(result).toBeNull();
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('skips check when features.architecture_guard is disabled', () => {
      const { tmp, planningDir } = makeTempProject({ guardEnabled: false });
      try {
        // File that would normally fail
        writeFile(tmp, 'plan-build-run/bin/lib/bad.cjs', 'function x() {}');
        const result = runGuard(planningDir, tmp, 'plan-build-run/bin/lib/bad.cjs');
        expect(result).toBeNull();
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns additionalContext with violation description when pattern violated', () => {
      const { tmp, planningDir } = makeTempProject();
      try {
        // CJS lib missing both 'use strict' and module.exports
        writeFile(tmp, 'plan-build-run/bin/lib/bad.cjs', 'function helper() {}');
        const result = runGuard(planningDir, tmp, 'plan-build-run/bin/lib/bad.cjs');
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('additionalContext');
        expect(result.additionalContext).toMatch(/Architecture guard/i);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('logs violations to daily hooks log with architecture_guard event type', () => {
      const savedCwd = process.cwd();
      const { tmp, planningDir } = makeTempProject();
      clearRootCache();
      process.chdir(tmp);
      try {
        writeFile(tmp, 'plan-build-run/bin/lib/bad.cjs', 'function helper() {}');
        runGuard(planningDir, tmp, 'plan-build-run/bin/lib/bad.cjs');

        const logPath = path.join(planningDir, 'logs', getLogFilename());
        expect(fs.existsSync(logPath)).toBe(true);
        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
        const entry = JSON.parse(lines[lines.length - 1]);
        expect(entry.event).toBe('architecture_guard');
      } finally {
        process.chdir(savedCwd);
        clearRootCache();
        cleanupTemp(tmp);
      }
    });
  });
});
