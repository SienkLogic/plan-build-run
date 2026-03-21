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

  test('SKILL.md exists', () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
  });

  test('has correct frontmatter name', () => {
    expect(content).toMatch(/name:\s*autonomous/);
  });

  test('has Skill in allowed-tools', () => {
    expect(content).toMatch(/allowed-tools:.*Skill/);
  });

  test('has --from argument', () => {
    expect(content).toMatch(/--from/);
  });

  test('config gate checks workflow.autonomous', () => {
    expect(content).toMatch(/workflow\.autonomous/);
  });

  test('chains discuss -> plan -> build -> verify', () => {
    // All 4 sub-skills must be referenced
    expect(content).toMatch(/pbr:discuss/);
    expect(content).toMatch(/pbr:plan/);
    expect(content).toMatch(/pbr:build/);
    expect(content).toMatch(/pbr:review/);
  });

  test('has dynamic phase detection', () => {
    expect(content).toMatch(/re-read roadmap|dynamic phase|rebuild.*phase list/i);
  });

  test('stops on human-action checkpoint', () => {
    expect(content).toMatch(/human-action/);
    expect(content).toMatch(/stop|STOP/);
  });

  test('has gap closure retry', () => {
    expect(content).toMatch(/gap.*closure|--gaps/i);
  });

  test('writes .active-skill at startup', () => {
    expect(content).toMatch(/Write.*\.active-skill.*autonomous/i);
    expect(content).toMatch(/CRITICAL.*active-skill/i);
  });

  test('deletes .active-skill at completion', () => {
    expect(content).toMatch(/Delete.*\.active-skill/i);
  });

  test('invokes milestone complete via Skill()', () => {
    expect(content).toMatch(/Skill\(.*pbr:milestone.*complete/);
    // Old display-only pattern should be replaced by Skill() call
    expect(content).not.toMatch(/Run `\/pbr:milestone` to archive/);
  });

  test('cleans up .active-skill on hard stops', () => {
    // Hard Stops section must reference .active-skill cleanup
    expect(content).toMatch(/Hard Stops/);
    expect(content).toMatch(/hard stop.*active-skill|active-skill.*stop message/i);
  });

  test('re-writes .active-skill on resume', () => {
    expect(content).toMatch(/Re-write.*active-skill.*resum|resum.*Re-write.*active-skill/i);
  });

  test('command registration exists', () => {
    expect(fs.existsSync(COMMAND_PATH)).toBe(true);
    const cmdContent = fs.readFileSync(COMMAND_PATH, 'utf8');
    expect(cmdContent).toMatch(/pbr:autonomous/);
  });

});
