'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HELPERS_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'gates', 'helpers');

describe('helpers.js readActiveSkill', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-helpers-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    // Clear require cache to get fresh module state
    delete require.cache[require.resolve(HELPERS_PATH)];
  });

  afterEach(() => {
    delete require.cache[require.resolve(HELPERS_PATH)];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns activeSkill from .session.json when present', () => {
    fs.writeFileSync(
      path.join(planningDir, '.session.json'),
      JSON.stringify({ activeSkill: 'build', sessionStart: Date.now() })
    );
    // Also write a different value in .active-skill to confirm session.json wins
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan');
    const { readActiveSkill } = require(HELPERS_PATH);
    const result = readActiveSkill(planningDir);
    expect(result).toBe('build');
  });

  it('falls back to .active-skill when .session.json has no activeSkill field', () => {
    fs.writeFileSync(
      path.join(planningDir, '.session.json'),
      JSON.stringify({ sessionStart: Date.now() }) // no activeSkill field
    );
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'review');
    const { readActiveSkill } = require(HELPERS_PATH);
    const result = readActiveSkill(planningDir);
    expect(result).toBe('review');
  });

  it('falls back to .active-skill when .session.json is absent', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
    const { readActiveSkill } = require(HELPERS_PATH);
    const result = readActiveSkill(planningDir);
    expect(result).toBe('quick');
  });

  it('returns null when neither .session.json nor .active-skill exists', () => {
    const { readActiveSkill } = require(HELPERS_PATH);
    const result = readActiveSkill(planningDir);
    expect(result).toBeNull();
  });

  it('returns empty string when .active-skill file is empty', () => {
    // The function returns the trimmed file content directly — empty file yields ''
    fs.writeFileSync(path.join(planningDir, '.active-skill'), '');
    const { readActiveSkill } = require(HELPERS_PATH);
    const result = readActiveSkill(planningDir);
    expect(result).toBe('');
  });

  it('trims whitespace from .active-skill file content', () => {
    fs.writeFileSync(path.join(planningDir, '.active-skill'), '  build  \n');
    const { readActiveSkill } = require(HELPERS_PATH);
    const result = readActiveSkill(planningDir);
    expect(result).toBe('build');
  });
});
