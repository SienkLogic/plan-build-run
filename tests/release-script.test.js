'use strict';

const { execSync } = require('child_process');

// Mock child_process before requiring the module
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

const { getVersionTags, SEMVER_TAG } = require('../scripts/clean-changelog.js');

describe('clean-changelog getVersionTags', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('filters out non-semver tags', () => {
    execSync.mockReturnValue(
      'plan-build-run-v2.12.1\nplan-build-run-v9.0\nplan-build-run-v2.11.0\nplan-build-run-v11.0\n'
    );
    const tags = getVersionTags();
    expect(tags).toEqual(['plan-build-run-v2.12.1', 'plan-build-run-v2.11.0']);
  });

  test('excludes tags like plan-build-run-v9.0 and plan-build-run-v11.0', () => {
    execSync.mockReturnValue(
      'plan-build-run-v9.0\nplan-build-run-v11.0\n'
    );
    const tags = getVersionTags();
    expect(tags).toEqual([]);
  });

  test('includes valid semver tags like plan-build-run-v2.12.1 and plan-build-run-v0.1.0', () => {
    execSync.mockReturnValue(
      'plan-build-run-v2.12.1\nplan-build-run-v0.1.0\nplan-build-run-v1.0.0\n'
    );
    const tags = getVersionTags();
    expect(tags).toEqual([
      'plan-build-run-v2.12.1',
      'plan-build-run-v0.1.0',
      'plan-build-run-v1.0.0',
    ]);
  });

  test('returns empty array when git command fails', () => {
    execSync.mockImplementation(() => { throw new Error('git not found'); });
    const tags = getVersionTags();
    expect(tags).toEqual([]);
  });
});

describe('SEMVER_TAG regex', () => {
  test('matches valid semver tags', () => {
    expect(SEMVER_TAG.test('plan-build-run-v2.12.1')).toBe(true);
    expect(SEMVER_TAG.test('plan-build-run-v0.1.0')).toBe(true);
    expect(SEMVER_TAG.test('plan-build-run-v10.20.30')).toBe(true);
  });

  test('rejects non-semver tags', () => {
    expect(SEMVER_TAG.test('plan-build-run-v9.0')).toBe(false);
    expect(SEMVER_TAG.test('plan-build-run-v11.0')).toBe(false);
    expect(SEMVER_TAG.test('plan-build-run-v1')).toBe(false);
    expect(SEMVER_TAG.test('plan-build-run-v1.2.3.4')).toBe(false);
    expect(SEMVER_TAG.test('v2.12.1')).toBe(false);
  });
});
