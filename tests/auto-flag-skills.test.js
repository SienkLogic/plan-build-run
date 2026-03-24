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

      test('argument-hint includes --auto', async () => {
        // Extract argument-hint from frontmatter
        const match = content.match(/argument-hint:\s*"([^"]+)"/);
        expect(match).not.toBeNull();
        expect(match[1]).toContain('--auto');
      });

      test('argument table documents --auto', async () => {
        // --auto appears in table rows, e.g. "| `3 --auto` |" or "| `--auto` |"
        expect(content).toMatch(/\|[^|]*--auto[^|]*\|/);
      });

      test('has auto_mode gate logic', async () => {
        expect(content).toMatch(/auto_mode|auto mode|--auto/i);
      });
    });
  }

  test('skills in SKILLS_WITH_AUTO list all exist', async () => {
    for (const skill of SKILLS_WITH_AUTO) {
      const skillPath = path.join(SKILLS_DIR, skill, 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    }
  });
});

describe('checkpoint auto-resolve in build skill', () => {
  let buildContent;
  beforeAll(() => {
    buildContent = fs.readFileSync(
      path.join(SKILLS_DIR, 'build', 'SKILL.md'), 'utf8'
    );
  });

  test('references checkpoint_auto_resolve config', async () => {
    expect(buildContent).toMatch(/checkpoint_auto_resolve/);
  });

  test('documents all config enum values', async () => {
    expect(buildContent).toMatch(/none/);
    expect(buildContent).toMatch(/verify-only/);
    expect(buildContent).toMatch(/verify-and-decision/);
  });

  test('human-action never auto-resolves', async () => {
    // Find the section about human-action and verify it says NEVER
    const humanActionSection = buildContent.match(
      /human-action[\s\S]{0,200}(NEVER|never)/
    );
    expect(humanActionSection).not.toBeNull();
  });
});
