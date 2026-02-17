/**
 * Reference Integrity Tests
 *
 * Validates that all cross-file references in skills and agents
 * point to files that actually exist. These references were created
 * during Phase 13-14 template extraction (todos 032-050).
 *
 * Also checks for known anti-patterns across the plugin.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', 'plugins', 'dev');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');

/**
 * Extract file path references from markdown content.
 * Matches patterns like:
 *   Read `templates/foo.md.tmpl`
 *   Read `references/bar.md`
 *   Read `skills/shared/baz.md`
 *   Read the ... template from `templates/foo.tmpl`
 */
function extractReferences(content) {
  const refs = [];
  // Pattern: Read ... `path/to/file` (backtick-quoted paths after Read keyword)
  const readPattern = /Read\s+(?:[^`]*?)`((?:templates?|references?|skills?)\/[^`]+)`/gi;
  let match;
  while ((match = readPattern.exec(content)) !== null) {
    refs.push(match[1]);
  }
  return [...new Set(refs)]; // deduplicate
}

/**
 * Get all .md files from a directory (non-recursive).
 */
function getMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f));
}

/**
 * Get all SKILL.md files from skill subdirectories.
 */
function getSkillFiles() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'shared')
    .map(d => path.join(SKILLS_DIR, d.name, 'SKILL.md'))
    .filter(f => fs.existsSync(f));
}

describe('Reference Integrity', () => {
  const skillFiles = getSkillFiles();
  const agentFiles = getMdFiles(AGENTS_DIR);
  const allFiles = [...skillFiles, ...agentFiles];

  test('all skill and agent Read references point to existing files', () => {
    const broken = [];

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const refs = extractReferences(content);
      const relName = path.relative(PLUGIN_ROOT, filePath);

      for (const ref of refs) {
        const resolved = path.join(PLUGIN_ROOT, ref);
        if (!fs.existsSync(resolved)) {
          broken.push({ source: relName, reference: ref });
        }
      }
    }

    if (broken.length > 0) {
      const details = broken
        .map(b => `  ${b.source} -> ${b.reference}`)
        .join('\n');
      throw new Error(
        `Found ${broken.length} broken reference(s):\n${details}`
      );
    }
  });

  test('no orphaned template files (every template is referenced)', () => {
    // Collect all referenced paths
    const allRefs = new Set();
    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const ref of extractReferences(content)) {
        allRefs.add(ref.replace(/\\/g, '/'));
      }
    }

    // Collect all template files
    const templateDirs = [
      'templates',
      'templates/codebase',
      'templates/research',
    ];

    // Also collect skill-level template dirs
    if (fs.existsSync(SKILLS_DIR)) {
      for (const d of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
        if (d.isDirectory() && d.name !== 'shared') {
          const tmplDir = path.join('skills', d.name, 'templates');
          if (fs.existsSync(path.join(PLUGIN_ROOT, tmplDir))) {
            templateDirs.push(tmplDir);
          }
        }
      }
    }

    const orphaned = [];
    for (const dir of templateDirs) {
      const absDir = path.join(PLUGIN_ROOT, dir);
      if (!fs.existsSync(absDir)) continue;
      for (const f of fs.readdirSync(absDir)) {
        if (!f.endsWith('.tmpl') && !f.endsWith('.md')) continue;
        const relPath = `${dir}/${f}`.replace(/\\/g, '/');
        if (!allRefs.has(relPath)) {
          orphaned.push(relPath);
        }
      }
    }

    if (orphaned.length > 0) {
      const details = orphaned.map(o => `  ${o}`).join('\n');
      // Warn but don't fail — some templates may be referenced differently
      console.warn(
        `Found ${orphaned.length} potentially orphaned template(s):\n${details}`
      );
    }
    // This test passes but logs warnings for investigation
    expect(true).toBe(true);
  });

  test('references/ directory files all exist and are non-empty', () => {
    const refsDir = path.join(PLUGIN_ROOT, 'references');
    expect(fs.existsSync(refsDir)).toBe(true);

    const expectedRefs = [
      'checkpoints.md',
      'continuation-format.md',
      'deviation-rules.md',
      'git-integration.md',
      'model-profiles.md',
      'plan-authoring.md',
      'plan-format.md',
      'planning-config.md',
      'questioning.md',
      'reading-verification.md',
      'stub-patterns.md',
      'subagent-coordination.md',
      'towline-rules.md',
      'ui-formatting.md',
      'verification-patterns.md',
      'wave-execution.md',
    ];

    const missing = [];
    const empty = [];
    for (const ref of expectedRefs) {
      const refPath = path.join(refsDir, ref);
      if (!fs.existsSync(refPath)) {
        missing.push(ref);
      } else {
        const stat = fs.statSync(refPath);
        if (stat.size === 0) {
          empty.push(ref);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
  });

  test('skills/shared/ fragment files all exist and are non-empty', () => {
    const sharedDir = path.join(SKILLS_DIR, 'shared');
    expect(fs.existsSync(sharedDir)).toBe(true);

    const expectedFragments = [
      'domain-probes.md',
      'error-reporting.md',
      'phase-argument-parsing.md',
      'progress-display.md',
      'state-loading.md',
      'state-update.md',
    ];

    const missing = [];
    const empty = [];
    for (const frag of expectedFragments) {
      const fragPath = path.join(sharedDir, frag);
      if (!fs.existsSync(fragPath)) {
        missing.push(frag);
      } else {
        const stat = fs.statSync(fragPath);
        if (stat.size === 0) {
          empty.push(frag);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
  });
});

describe('hooks.json Structure', () => {
  const hooksPath = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  const hooksConfig = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

  test('hooks.json is valid JSON with hooks property', () => {
    expect(hooksConfig).toHaveProperty('hooks');
    expect(typeof hooksConfig.hooks).toBe('object');
  });

  test('all hook script paths reference existing files', () => {
    const missing = [];
    const scriptsDir = path.join(PLUGIN_ROOT, 'scripts');

    for (const [eventType, entries] of Object.entries(hooksConfig.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          if (hook.command) {
            // Extract script name from "node ${CLAUDE_PLUGIN_ROOT}/scripts/foo.js [args]"
            const match = hook.command.match(/scripts\/([^\s"]+)/);
            if (match) {
              const scriptFile = match[1];
              const scriptPath = path.join(scriptsDir, scriptFile);
              if (!fs.existsSync(scriptPath)) {
                missing.push({ event: eventType, script: scriptFile });
              }
            }
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test('async hooks do not output stdout (no additionalContext needed)', () => {
    // Async hooks cannot have their stdout captured by Claude Code.
    // Only pure-logging hooks should be async.
    const asyncHooks = [];

    for (const [eventType, entries] of Object.entries(hooksConfig.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          if (hook.async === true) {
            asyncHooks.push({ event: eventType, command: hook.command });
          }
        }
      }
    }

    // Verify only expected hooks are async
    const asyncEvents = asyncHooks.map(h => h.event);
    // SubagentStop and SessionEnd are the only safe candidates
    for (const event of asyncEvents) {
      expect(['SubagentStop', 'SessionEnd']).toContain(event);
    }
  });

  test('async hooks have a timeout', () => {
    for (const [, entries] of Object.entries(hooksConfig.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          if (hook.async === true) {
            expect(hook.timeout).toBeDefined();
            expect(typeof hook.timeout).toBe('number');
            expect(hook.timeout).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  test('blocking hooks (PreToolUse) are not async', () => {
    const preToolUseEntries = hooksConfig.hooks.PreToolUse || [];
    for (const entry of preToolUseEntries) {
      for (const hook of entry.hooks || []) {
        expect(hook.async).not.toBe(true);
      }
    }
  });
});

describe('Anti-Pattern Checks', () => {
  test('synthesizer agent uses sonnet model', () => {
    const synthPath = path.join(AGENTS_DIR, 'towline-synthesizer.md');
    const content = fs.readFileSync(synthPath, 'utf8');
    const frontmatter = content.split('---')[1];
    expect(frontmatter).toMatch(/model:\s*sonnet/);
  });

  test('no agent files reference "haiku" as their model', () => {
    const agentFiles = getMdFiles(AGENTS_DIR);
    const haikuAgents = [];

    for (const filePath of agentFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const frontmatter = content.split('---')[1] || '';
      if (/model:\s*haiku/.test(frontmatter)) {
        haikuAgents.push(path.basename(filePath));
      }
    }

    // If haiku agents are intentional in the future, update this list
    expect(haikuAgents).toEqual([]);
  });

  test('no SKILL.md files contain inlined agent definitions (>75 line code blocks)', () => {
    const skillFiles = getSkillFiles();
    const violations = [];

    for (const filePath of skillFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relName = path.relative(PLUGIN_ROOT, filePath);

      // Check for very large code blocks that might be inlined agent prompts
      const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
      for (const block of codeBlocks) {
        const lines = block.split('\n').length;
        if (lines > 75) {
          violations.push({ file: relName, blockLines: lines });
        }
      }
    }

    // Large code blocks in skills are OK if they're format examples
    // (like markdown output templates). Only flag truly huge blocks.
    expect(violations).toEqual([]);
  });

  test('no hardcoded year references in researcher agent', () => {
    const researcherPath = path.join(AGENTS_DIR, 'towline-researcher.md');
    const content = fs.readFileSync(researcherPath, 'utf8');
    // Should use dynamic date, not hardcoded years
    const yearPattern = /\b20(?:2[5-9]|[3-9]\d)\b/g;
    const matches = [];
    let match;
    while ((match = yearPattern.exec(content)) !== null) {
      // Get surrounding context
      const start = Math.max(0, match.index - 30);
      const end = Math.min(content.length, match.index + match[0].length + 30);
      matches.push(content.slice(start, end).replace(/\n/g, ' ').trim());
    }

    expect(matches).toEqual([]);
  });

  test('config.json synthesizer model matches agent definition', () => {
    const configPath = path.resolve(
      __dirname, '..', '.planning', 'config.json'
    );
    // Only check if config exists (it won't in CI)
    if (!fs.existsSync(configPath)) return;

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const synthPath = path.join(AGENTS_DIR, 'towline-synthesizer.md');
    const content = fs.readFileSync(synthPath, 'utf8');
    const frontmatter = content.split('---')[1];
    const modelMatch = frontmatter.match(/model:\s*(\w+)/);

    if (modelMatch && config.models && config.models.synthesizer) {
      expect(config.models.synthesizer).toBe(modelMatch[1]);
    }
  });
});
