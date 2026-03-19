/**
 * Tests for hooks/lib/skill-section.js — SKILL.md section extraction.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { skillSection, resolveSkillPath, listAvailableSkills } = require('../hooks/lib/skill-section');

let tmpDir, pluginRoot;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skill-section-test-')));
  pluginRoot = tmpDir;
  // Create skills directory with a test skill
  const skillDir = path.join(pluginRoot, 'skills', 'test-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: test-skill',
    '---',
    '',
    '## Overview',
    '',
    'This is the overview section.',
    '',
    '## Step 1: Setup',
    '',
    'Setup instructions here.',
    '',
    '## Step 2: Execute',
    '',
    'Execute instructions here.',
    ''
  ].join('\n'));

  // Create another skill for listing
  const otherDir = path.join(pluginRoot, 'skills', 'other-skill');
  fs.mkdirSync(otherDir, { recursive: true });
  fs.writeFileSync(path.join(otherDir, 'SKILL.md'), '---\nname: other\n---\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveSkillPath', () => {
  test('returns path for existing skill', () => {
    const result = resolveSkillPath('test-skill', pluginRoot);
    expect(result).toBe(path.join(pluginRoot, 'skills', 'test-skill', 'SKILL.md'));
  });

  test('returns null for nonexistent skill', () => {
    expect(resolveSkillPath('nonexistent', pluginRoot)).toBeNull();
  });
});

describe('listAvailableSkills', () => {
  test('returns array of skill names', () => {
    const skills = listAvailableSkills(pluginRoot);
    expect(skills).toContain('test-skill');
    expect(skills).toContain('other-skill');
  });

  test('returns empty array for nonexistent skills dir', () => {
    const result = listAvailableSkills(path.join(tmpDir, 'nonexistent'));
    expect(result).toEqual([]);
  });
});

describe('skillSection', () => {
  test('extracts a section by heading', () => {
    const result = skillSection('test-skill', 'Overview', pluginRoot);
    expect(result.skill).toBe('test-skill');
    expect(result.content).toContain('overview section');
  });

  test('returns error for empty section query', () => {
    const result = skillSection('test-skill', '', pluginRoot);
    expect(result.error).toContain('Section query required');
  });

  test('returns error for nonexistent skill', () => {
    const result = skillSection('nonexistent', 'Overview', pluginRoot);
    expect(result.error).toContain('Skill not found');
    expect(result.available).toBeDefined();
  });

  test('returns error for nonexistent section', () => {
    const result = skillSection('test-skill', 'NonexistentSection', pluginRoot);
    expect(result.error).toContain('not found');
    expect(result.available).toBeDefined();
  });

  test('handles hyphenated queries via normalization', () => {
    const result = skillSection('test-skill', 'step-1', pluginRoot);
    // Should match "Step 1: Setup" via fuzzy matching
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Setup instructions');
  });
});
