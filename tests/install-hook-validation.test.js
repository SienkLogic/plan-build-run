'use strict';

const fs = require('fs');
const path = require('path');

const installJsPath = path.join(__dirname, '..', 'bin', 'install.js');

describe('install.js hook registration guards', () => {
  let src;
  let lines;

  beforeAll(() => {
    src = fs.readFileSync(installJsPath, 'utf8');
    lines = src.split(/\r?\n/);
  });

  test('install.js exists and is readable', async () => {
    expect(fs.existsSync(installJsPath)).toBe(true);
    expect(src.length).toBeGreaterThan(0);
  });

  test('every addHookEntry() call has an fs.existsSync() guard within 15 lines', async () => {
    const unguarded = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip the function definition itself
      if (line.includes('function addHookEntry')) continue;
      if (!line.includes('addHookEntry(')) continue;

      // Look backward up to 15 lines for an existsSync guard
      let found = false;
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        if (lines[j].includes('existsSync')) {
          found = true;
          break;
        }
      }

      if (!found) {
        unguarded.push({ line: i + 1, code: line.trim() });
      }
    }

    expect(unguarded).toEqual([]);

    // Sanity check: we found a reasonable number of guarded calls
    const totalCalls = (src.match(/addHookEntry\(/g) || []).length;
    // Subtract 1 for the function definition
    expect(totalCalls - 1).toBeGreaterThanOrEqual(15);
  });

  test('each unique hook script referenced by directHookCmd has an existsSync check', async () => {
    // Extract the hook configuration section
    const startIdx = src.indexOf('// --- SessionStart:');
    const endIdx = src.indexOf('// Legacy pbr-context-monitor');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const hookSection = src.slice(startIdx, endIdx);

    // Collect all unique script names referenced via directHookCmd
    const scriptRefs = hookSection.match(/directHookCmd\('([^']+)'\)/g) || [];
    const uniqueScripts = [...new Set(
      scriptRefs.map(r => r.match(/directHookCmd\('([^']+)'\)/)[1])
    )];

    // Scripts whose existsSync guard uses a named variable (e.g., preBashScript)
    // or are nested inside a parent dispatch guard
    const knownGuardPatterns = {
      'pre-bash-dispatch.js': 'preBashScript',
      'pre-write-dispatch.js': 'preWriteScript',
      'validate-commit.js': 'parent:pre-bash-dispatch.js',
      'check-skill-workflow.js': 'parent:pre-write-dispatch.js',
    };

    for (const script of uniqueScripts) {
      // Direct guard: existsSync referencing this script by name or variable
      const hasDirectGuard =
        hookSection.includes(`existsSync(path.join(hooksDir, '${script}')`) ||
        hookSection.includes(`existsSync(${script.replace('.js', 'Script')})`);

      if (!hasDirectGuard) {
        const guardPattern = knownGuardPatterns[script];
        expect(guardPattern).toBeDefined();

        if (guardPattern.startsWith('parent:')) {
          // Nested inside a parent dispatch script's guard block
          const parentScript = guardPattern.slice(7);
          const parentVar = knownGuardPatterns[parentScript];
          const hasParentGuard =
            hookSection.includes(`existsSync(${parentVar})`) ||
            hookSection.includes(`existsSync(path.join(hooksDir, '${parentScript}')`);
          expect(hasParentGuard).toBe(true);
        } else {
          // Guard uses a named variable
          expect(hookSection.includes(`existsSync(${guardPattern})`)).toBe(true);
        }
      }
    }

    expect(uniqueScripts.length).toBeGreaterThanOrEqual(10);
  });

  test('missing hook scripts produce skip warnings', async () => {
    let existsSyncGuards = 0;
    let warningMessages = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('existsSync') &&
          (lines[i].includes('hooksDir') || lines[i].includes('Script'))) {
        existsSyncGuards++;
      }
      if (lines[i].includes('Skipping') && lines[i].includes('not found')) {
        warningMessages++;
      }
    }

    // At least 10 existsSync guards in the hook section
    expect(existsSyncGuards).toBeGreaterThanOrEqual(10);
    // At least some guards have skip warnings for user feedback
    expect(warningMessages).toBeGreaterThanOrEqual(1);
  });

  test('addHookEntry function validates identifier parameter', async () => {
    // Verify the addHookEntry function exists and takes expected parameters
    const fnMatch = src.match(/function addHookEntry\(([^)]+)\)/);
    expect(fnMatch).not.toBeNull();
    const params = fnMatch[1].split(',').map(p => p.trim());
    expect(params).toEqual(['event', 'matcher', 'commandSuffix', 'identifier']);
  });
});
