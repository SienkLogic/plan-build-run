/**
 * Tests for hooks/lib/quick-init.js — Quick task directory creation.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const { quickInit, generateQuickSlug } = require('../hooks/lib/quick-init');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

describe('generateQuickSlug', () => {
  test('converts text to kebab-case slug', () => {
    expect(generateQuickSlug('Fix the auth bug')).toBe('fix-auth-bug');
  });

  test('strips stop words', () => {
    const slug = generateQuickSlug('add a new feature to the login flow');
    expect(slug).not.toContain('-a-');
    expect(slug).not.toContain('-the-');
  });

  test('returns "task" for empty input', () => {
    expect(generateQuickSlug('')).toBe('task');
    expect(generateQuickSlug(null)).toBe('task');
    expect(generateQuickSlug(undefined)).toBe('task');
  });

  test('returns "task" for only stop words', () => {
    expect(generateQuickSlug('the a an')).toBe('task');
  });

  test('limits to first 5 meaningful words', () => {
    const slug = generateQuickSlug('alpha bravo charlie delta echo foxtrot golf');
    const words = slug.split('-');
    expect(words.length).toBeLessThanOrEqual(5);
  });

  test('trims at last hyphen if over 50 chars', () => {
    const long = 'superlongword1 superlongword2 superlongword3 superlongword4 superlongword5';
    const slug = generateQuickSlug(long);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  test('strips special characters', () => {
    expect(generateQuickSlug('fix: bug #123!')).toBe('fix-bug-123');
  });
});

describe('quickInit', () => {
  test('creates directory and PLAN.md', () => {
    const result = quickInit('Fix the login bug', planningDir);
    expect(result.error).toBeUndefined();
    expect(result.number).toBe('001');
    expect(result.task_id).toBe('quick-001');

    // Verify directory and PLAN.md exist
    const fullDir = path.join(planningDir, 'quick', `001-${result.slug}`);
    expect(fs.existsSync(fullDir)).toBe(true);
    expect(fs.existsSync(path.join(fullDir, 'PLAN.md'))).toBe(true);

    // Verify PLAN.md has frontmatter
    const content = fs.readFileSync(path.join(fullDir, 'PLAN.md'), 'utf8');
    expect(content).toContain('task_id: "quick-001"');
    expect(content).toContain('Fix the login bug');
  });

  test('sequential numbering increments', () => {
    const r1 = quickInit('First task', planningDir);
    expect(r1.number).toBe('001');

    const r2 = quickInit('Second task', planningDir);
    expect(r2.number).toBe('002');
  });

  test('returns error for empty description', () => {
    const result = quickInit('', planningDir);
    expect(result.error).toBe('Description required');
  });

  test('returns error for null description', () => {
    const result = quickInit(null, planningDir);
    expect(result.error).toBe('Description required');
  });

  test('returns error when .planning dir does not exist', () => {
    const result = quickInit('Fix bug', path.join(tmpDir, 'nonexistent'));
    expect(result.error).toContain('.planning/');
  });

  test('result contains expected fields', () => {
    const result = quickInit('Test task', planningDir);
    expect(result).toHaveProperty('number');
    expect(result).toHaveProperty('slug');
    expect(result).toHaveProperty('dir');
    expect(result).toHaveProperty('plan_path');
    expect(result).toHaveProperty('task_id');
  });
});
