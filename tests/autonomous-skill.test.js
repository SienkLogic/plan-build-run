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
const COMMAND_PATH = path.join(__dirname, '..', 'commands', 'pbr', 'autonomous.md');
const SYNC_PATH = path.join(__dirname, '..', 'plan-build-run', 'skills', 'autonomous', 'SKILL.md');

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

  test('command registration exists', () => {
    expect(fs.existsSync(COMMAND_PATH)).toBe(true);
    const cmdContent = fs.readFileSync(COMMAND_PATH, 'utf8');
    expect(cmdContent).toMatch(/pbr:autonomous/);
  });

  test('synced to plan-build-run/skills/', () => {
    expect(fs.existsSync(SYNC_PATH)).toBe(true);
    const syncContent = fs.readFileSync(SYNC_PATH, 'utf8');
    expect(syncContent).toEqual(content);
  });
});
