'use strict';

const path = require('path');
const { skillSection, resolveSkillPath, listAvailableSkills } = require('../plugins/pbr/scripts/lib/skill-section');

// Plugin root resolves to plugins/pbr/ from the repo root
const pluginRoot = path.join(__dirname, '..', 'plugins', 'pbr');

describe('skillSection', () => {
  // --- Happy path ---

  test('returns object with expected fields for build step-0', () => {
    const result = skillSection('build', 'step-0', pluginRoot);
    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('skill', 'build');
    expect(result).toHaveProperty('section', 'step-0');
    expect(result).toHaveProperty('heading');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('char_count');
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);
  });

  test('char_count matches actual content length for build step-0', () => {
    const result = skillSection('build', 'step-0', pluginRoot);
    expect(result).not.toHaveProperty('error');
    expect(result.char_count).toBe(result.content.length);
  });

  test('fuzzy matches "step 6" to "Step 6: Wave Loop" heading', () => {
    const result = skillSection('build', 'step 6', pluginRoot);
    expect(result).not.toHaveProperty('error');
    expect(result.heading).toMatch(/step 6/i);
    expect(result.skill).toBe('build');
  });

  test('returns Step 1 (Parse and Validate) for build step-1', () => {
    const result = skillSection('build', 'step-1', pluginRoot);
    expect(result).not.toHaveProperty('error');
    expect(result.heading).toMatch(/step 1/i);
    expect(result.content.length).toBeGreaterThan(0);
  });

  test('returns Error Handling section for build error-handling query', () => {
    const result = skillSection('build', 'error handling', pluginRoot);
    expect(result).not.toHaveProperty('error');
    expect(result.heading).toMatch(/error handling/i);
  });

  test('returns Automated Verification section for review step-3', () => {
    const result = skillSection('review', 'step-3', pluginRoot);
    expect(result).not.toHaveProperty('error');
    expect(result.heading).toMatch(/step 3/i);
    expect(result.content.length).toBeGreaterThan(0);
  });

  // --- Section not found ---

  test('returns { error, available } when section not found in build', () => {
    const result = skillSection('build', 'nonexistent-section', pluginRoot);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/nonexistent-section/);
    expect(result).toHaveProperty('available');
    expect(Array.isArray(result.available)).toBe(true);
    expect(result.available.length).toBeGreaterThan(0);
  });

  test('returns { error, available } when "header" section not found in plan', () => {
    // plan SKILL.md has no "header" heading — graceful error listing actual headings
    const result = skillSection('plan', 'header', pluginRoot);
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('available');
    expect(Array.isArray(result.available)).toBe(true);
    // available should list real headings from plan SKILL.md
    expect(result.available.length).toBeGreaterThan(0);
    const headingTexts = result.available.map(h => h.heading || h);
    expect(headingTexts.some(h => /context budget/i.test(h))).toBe(true);
  });

  // --- Empty / invalid section query ---

  test('returns { error: "Section query required" } for empty string', () => {
    const result = skillSection('build', '', pluginRoot);
    expect(result).toHaveProperty('error', 'Section query required');
  });

  test('returns { error: "Section query required" } for whitespace-only query', () => {
    const result = skillSection('build', '   ', pluginRoot);
    expect(result).toHaveProperty('error', 'Section query required');
  });

  // --- Invalid skill ---

  test('returns { error: "Skill not found: ..." } for nonexistent skill', () => {
    const result = skillSection('nonexistent-skill', 'step-0', pluginRoot);
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/skill not found/i);
    expect(result.error).toMatch(/nonexistent-skill/);
  });
});

describe('resolveSkillPath', () => {
  test('resolves to correct path for "build" skill', () => {
    const skillPath = resolveSkillPath('build', pluginRoot);
    expect(skillPath).not.toBeNull();
    expect(skillPath).toMatch(/skills[/\\]build[/\\]SKILL\.md$/);
  });

  test('returns null for nonexistent skill', () => {
    const skillPath = resolveSkillPath('nonexistent-skill', pluginRoot);
    expect(skillPath).toBeNull();
  });
});

describe('listAvailableSkills', () => {
  test('returns array of skill names', () => {
    const skills = listAvailableSkills(pluginRoot);
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills).toContain('build');
    expect(skills).toContain('plan');
  });

  test('returns empty array for invalid pluginRoot', () => {
    const skills = listAvailableSkills('/nonexistent/path');
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBe(0);
  });
});
