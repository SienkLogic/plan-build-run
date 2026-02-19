/**
 * Skill AskUserQuestion Audit Tests
 *
 * Validates that all skills correctly include (or intentionally exclude)
 * AskUserQuestion in their allowed-tools, and that no unconverted
 * plain-text gate patterns remain. Also checks that pattern references
 * in skills point to actual patterns in gate-prompts.md.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', 'plugins', 'pbr');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const GATE_PROMPTS_PATH = path.join(PLUGIN_ROOT, 'skills', 'shared', 'gate-prompts.md');

/**
 * Get all skill directory names (excluding 'shared' which is a fragments dir).
 * @returns {string[]}
 */
function getSkillDirs() {
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'shared')
    .map(d => d.name)
    .sort();
}

/**
 * Extract the allowed-tools list from SKILL.md YAML frontmatter.
 * Parses between the first pair of `---` delimiters, finds the
 * `allowed-tools:` line, splits on comma, and trims each tool name.
 *
 * @param {string} content - Full SKILL.md content
 * @returns {string[]}
 */
function parseAllowedTools(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return [];

  const frontmatter = fmMatch[1];
  const toolsLine = frontmatter.split(/\r?\n/).find(l => l.startsWith('allowed-tools:'));
  if (!toolsLine) return [];

  return toolsLine
    .replace('allowed-tools:', '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

/**
 * Extract all pattern slug names from gate-prompts.md.
 * Patterns are defined as `## Pattern: {slug}` headers.
 *
 * @returns {string[]}
 */
function getPatternNames() {
  const content = fs.readFileSync(GATE_PROMPTS_PATH, 'utf8');
  const matches = content.match(/^## Pattern: ([\w-]+)/gm) || [];
  return matches.map(m => m.replace('## Pattern: ', ''));
}

describe('AskUserQuestion skill audit', () => {
  const skillDirs = getSkillDirs();
  const patternNames = getPatternNames();

  // Skills that intentionally do NOT have AskUserQuestion in allowed-tools.
  // - continue, dashboard, health, help, pause: no interactive decision points
  // - note, todo: lightweight utilities, no gate checks
  const EXCLUDED_SKILLS = ['continue', 'dashboard', 'health', 'help', 'note', 'pause', 'todo'];

  test('found expected number of skills (22)', () => {
    expect(skillDirs.length).toBe(22);
  });

  test('excluded skills do not have AskUserQuestion in allowed-tools', () => {
    for (const skillName of EXCLUDED_SKILLS) {
      const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, 'utf8');
      const tools = parseAllowedTools(content);
      expect(tools).not.toContain('AskUserQuestion');
    }
  });

  test('non-excluded skills have AskUserQuestion in allowed-tools', () => {
    const missing = [];
    for (const skillName of skillDirs) {
      if (EXCLUDED_SKILLS.includes(skillName)) continue;
      const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, 'utf8');
      const tools = parseAllowedTools(content);
      if (!tools.includes('AskUserQuestion')) {
        missing.push(skillName);
      }
    }
    expect(missing).toEqual([]);
  });

  test('no plain-text gate patterns remain (Type approved/continue)', () => {
    const violations = [];
    // Patterns that indicate unconverted gate checks
    const plainTextGates = [
      /→\s*Type\s+"?approved"?/i,
      /→\s*Type\s+"?continue"?/i,
      /→\s*Type\s+"?done"?\s+when/i,
    ];

    for (const skillName of skillDirs) {
      const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, 'utf8');

      for (const pattern of plainTextGates) {
        const matches = content.match(pattern);
        if (matches) {
          // Check if this is inside a "do NOT use" or example context
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              // Check surrounding lines for "do NOT" or "example" context
              const context = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
              if (!/do NOT|freeform|example|Anti-Pattern/i.test(context)) {
                violations.push({
                  skill: skillName,
                  line: i + 1,
                  text: lines[i].trim()
                });
              }
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map(v => `  ${v.skill}/SKILL.md:${v.line} — ${v.text}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} unconverted plain-text gate(s):\n${details}`
      );
    }
  });

  test('pattern references in skills match actual patterns in gate-prompts.md', () => {
    const unknownRefs = [];

    for (const skillName of skillDirs) {
      const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, 'utf8');

      // Find gate-prompt pattern slug references in skills.
      // Gate prompt slugs always contain at least one hyphen (e.g., "yes-no",
      // "approve-revise-abort"), so we require a hyphen to avoid false positives
      // from generic phrases like "Glob pattern" or "logging patterns".
      const patternRefs = content.match(/(?:pattern[:\s]+|Use\s+(?:the\s+)?(?:\*\*)?)([\w-]+-[\w-]+)(?:\*\*)?\s+pattern/gi) || [];
      for (const ref of patternRefs) {
        const slugMatch = ref.match(/([\w-]+-[\w-]+)\s+pattern/i);
        if (slugMatch) {
          const slug = slugMatch[1].replace(/\*\*/g, '');
          if (!patternNames.includes(slug) && slug !== 'AskUserQuestion') {
            unknownRefs.push({ skill: skillName, pattern: slug });
          }
        }
      }
    }

    if (unknownRefs.length > 0) {
      const details = unknownRefs
        .map(r => `  ${r.skill}/SKILL.md references unknown pattern: ${r.pattern}`)
        .join('\n');
      throw new Error(
        `Found ${unknownRefs.length} unknown pattern reference(s):\n${details}`
      );
    }
  });
});
