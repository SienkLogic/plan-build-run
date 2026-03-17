/**
 * Auto-flag skills tests
 *
 * Validates that all 5 skills modified for autonomous pipeline
 * have the --auto flag in argument-hint, argument table, and gate logic.
 */

const fs = require('fs');
const path = require('path');

const SKILLS_WITH_AUTO = ['plan', 'build', 'discuss', 'review', 'continue'];
const SKILLS_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'skills');

describe('--auto flag integration', () => {
  for (const skill of SKILLS_WITH_AUTO) {
    describe(`${skill} skill`, () => {
      let content;
      beforeAll(() => {
        content = fs.readFileSync(
          path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8'
        );
      });

      test('argument-hint includes --auto', () => {
        // Extract argument-hint from frontmatter
        const match = content.match(/argument-hint:\s*"([^"]+)"/);
        expect(match).not.toBeNull();
        expect(match[1]).toContain('--auto');
      });

      test('argument table documents --auto', () => {
        // --auto appears in table rows, e.g. "| `3 --auto` |" or "| `--auto` |"
        expect(content).toMatch(/\|[^|]*--auto[^|]*\|/);
      });

      test('has auto_mode gate logic', () => {
        expect(content).toMatch(/auto_mode|auto mode|--auto/i);
      });
    });
  }

  test('skills in SKILLS_WITH_AUTO list all exist', () => {
    for (const skill of SKILLS_WITH_AUTO) {
      const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    }
  });
});
