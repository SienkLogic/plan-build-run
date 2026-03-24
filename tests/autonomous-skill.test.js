/**
 * Autonomous skill tests
 *
 * Validates the /pbr:autonomous SKILL.md structure, config gate,
 * phase chaining, dynamic detection, checkpoint stops,
 * command registration, and sync copy.
 */

const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'autonomous', 'SKILL.md');
const COMMAND_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'commands', 'autonomous.md');
describe('/pbr:autonomous skill', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(SKILL_PATH, 'utf8');
  });

  test('SKILL.md exists', async () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
  });

  test('has correct frontmatter name', async () => {
    expect(content).toMatch(/name:\s*autonomous/);
  });

  test('has Skill in allowed-tools', async () => {
    expect(content).toMatch(/allowed-tools:.*Skill/);
  });

  test('has --from argument', async () => {
    expect(content).toMatch(/--from/);
  });

  test('config gate checks workflow.autonomous', async () => {
    expect(content).toMatch(/workflow\.autonomous/);
  });

  test('chains discuss -> plan -> build -> verify', async () => {
    // All 4 sub-skills must be referenced
    expect(content).toMatch(/pbr:discuss/);
    expect(content).toMatch(/pbr:plan/);
    expect(content).toMatch(/pbr:build/);
    expect(content).toMatch(/pbr:review/);
  });

  test('has dynamic phase detection', async () => {
    expect(content).toMatch(/re-read roadmap|dynamic phase|rebuild.*phase list/i);
  });

  test('stops on human-action checkpoint', async () => {
    expect(content).toMatch(/human-action/);
    expect(content).toMatch(/stop|STOP/);
  });

  test('has gap closure retry', async () => {
    expect(content).toMatch(/gap.*closure|--gaps/i);
  });

  test('writes .active-skill at startup', async () => {
    expect(content).toMatch(/Write.*\.active-skill.*autonomous/i);
    expect(content).toMatch(/CRITICAL.*active-skill/i);
  });

  test('deletes .active-skill at completion', async () => {
    expect(content).toMatch(/Delete.*\.active-skill/i);
  });

  test('invokes milestone complete via Skill()', async () => {
    expect(content).toMatch(/Skill\(.*pbr:milestone.*complete/);
    // Old display-only pattern should be replaced by Skill() call
    expect(content).not.toMatch(/Run `\/pbr:milestone` to archive/);
  });

  test('cleans up .active-skill on hard stops', async () => {
    // Hard Stops section must reference .active-skill cleanup
    expect(content).toMatch(/Hard Stops/);
    expect(content).toMatch(/hard stop.*active-skill|active-skill.*stop message/i);
  });

  test('re-writes .active-skill on resume', async () => {
    expect(content).toMatch(/Re-write.*active-skill.*resum|resum.*Re-write.*active-skill/i);
  });

  test('command registration exists', async () => {
    expect(fs.existsSync(COMMAND_PATH)).toBe(true);
    const cmdContent = fs.readFileSync(COMMAND_PATH, 'utf8');
    expect(cmdContent).toMatch(/pbr:autonomous/);
  });

});
