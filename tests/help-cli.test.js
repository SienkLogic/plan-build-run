'use strict';

const path = require('path');
const { helpList, skillMetadata } = require('../plugins/pbr/scripts/lib/help');

const pluginRoot = path.resolve(__dirname, '..', 'plugins', 'pbr');

describe('helpList', () => {
  test('returns array of skills with required fields', async () => {
    const result = helpList(pluginRoot);
    expect(result.skills).toBeInstanceOf(Array);
    expect(result.skills.length).toBeGreaterThan(25);
    for (const skill of result.skills) {
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
    }
  });

  test('skills are sorted alphabetically by name', async () => {
    const result = helpList(pluginRoot);
    const names = result.skills.map(s => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('includes known skills', async () => {
    const result = helpList(pluginRoot);
    const names = result.skills.map(s => s.name);
    expect(names).toContain('quick');
    expect(names).toContain('build');
    expect(names).toContain('plan');
    expect(names).toContain('help');
  });
});

describe('skillMetadata', () => {
  test('returns metadata for existing skill', async () => {
    const result = skillMetadata('quick', pluginRoot);
    expect(result.name).toBe('quick');
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(0);
    expect(result.allowed_tools).toBeInstanceOf(Array);
    expect(result).toHaveProperty('argument_hint');
  });

  test('returns error for nonexistent skill', async () => {
    const result = skillMetadata('nonexistent-xyz', pluginRoot);
    expect(result).toHaveProperty('error');
    expect(Array.isArray(result.available)).toBe(true);
    expect(result.available.length).toBeGreaterThan(0);
  });
});
