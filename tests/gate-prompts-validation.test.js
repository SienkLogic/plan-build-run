/**
 * Gate Prompts Validation Tests
 *
 * Validates the structural integrity of all AskUserQuestion gate prompt
 * patterns defined in skills/shared/gate-prompts.md. Each pattern must
 * have a unique name, a short header, 2-4 options, multiSelect: false,
 * and a question template.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', 'plugins', 'pbr');
const GATE_PROMPTS_PATH = path.join(PLUGIN_ROOT, 'skills', 'shared', 'gate-prompts.md');

/**
 * Parse gate-prompts.md into an array of pattern objects.
 * Each pattern starts with `## Pattern: {slug}` and extends until
 * the next `## Pattern:` or end of file.
 *
 * @param {string} content - Full file content
 * @returns {Array<{name: string, content: string, header: string|null, optionCount: number}>}
 */
function parsePatterns(content) {
  const sections = content.split(/^## Pattern: /m);
  // First section is the preamble (before any pattern), skip it
  const patterns = [];

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const nameMatch = section.match(/^([\w-]+)/);
    if (!nameMatch) continue;

    const name = nameMatch[1];

    // Extract header value from `header: "{value}"` or `header: {value}`
    const headerMatch = section.match(/header:\s*"?([^"\n]+)"?/);
    const header = headerMatch ? headerMatch[1].trim() : null;

    // Count `- label:` lines for option count
    const labelMatches = section.match(/- label:/g);
    const optionCount = labelMatches ? labelMatches.length : 0;

    patterns.push({ name, content: section, header, optionCount });
  }

  return patterns;
}

describe('gate-prompts.md validation', () => {
  const content = fs.readFileSync(GATE_PROMPTS_PATH, 'utf8');
  const patterns = parsePatterns(content);

  test('gate-prompts.md exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  test('contains expected number of patterns (21)', () => {
    expect(patterns.length).toBe(21);
  });

  test('all pattern names are unique', () => {
    const names = patterns.map(p => p.name);
    const unique = [...new Set(names)];
    expect(names).toEqual(unique);
  });

  test.each(patterns.map(p => [p.name, p]))(
    'pattern "%s" has header max 12 characters',
    (name, pattern) => {
      if (pattern.header) {
        expect(pattern.header.length).toBeLessThanOrEqual(12);
      }
    }
  );

  test.each(patterns.map(p => [p.name, p]))(
    'pattern "%s" has 2-4 options',
    (name, pattern) => {
      expect(pattern.optionCount).toBeGreaterThanOrEqual(2);
      expect(pattern.optionCount).toBeLessThanOrEqual(4);
    }
  );

  test.each(patterns.map(p => [p.name, p]))(
    'pattern "%s" has multiSelect: false',
    (name, pattern) => {
      expect(pattern.content).toMatch(/multiSelect:\s*false/);
    }
  );

  test.each(patterns.map(p => [p.name, p]))(
    'pattern "%s" has a question template',
    (name, pattern) => {
      expect(pattern.content).toMatch(/question:/);
    }
  );
});
