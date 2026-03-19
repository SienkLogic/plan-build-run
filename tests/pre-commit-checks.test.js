'use strict';

const path = require('path');

// Mock child_process and fs before requiring the module
jest.mock('child_process');
jest.mock('fs');

// Mock hook-logger to avoid file system writes during tests
jest.mock('../hooks/hook-logger', () => ({
  logHook: jest.fn()
}));

const { execSync } = require('child_process');
const fs = require('fs');
const { checkRequirePaths, checkMirrorSync, checkLintErrors } = require('../hooks/lib/pre-commit-checks');

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no staged files
  execSync.mockReturnValue('');
  // Default: readFileSync returns empty string
  fs.readFileSync.mockReturnValue('');
  // Default: existsSync returns true
  fs.existsSync.mockReturnValue(true);
});

// -------------------------------------------------------------------------
// checkRequirePaths
// -------------------------------------------------------------------------

describe('checkRequirePaths', () => {
  test('returns null when no JS files are staged', () => {
    execSync.mockReturnValue('README.md\npackage.json\n');
    expect(checkRequirePaths({})).toBeNull();
  });

  test('returns null when no staged files at all', () => {
    execSync.mockReturnValue('');
    expect(checkRequirePaths({})).toBeNull();
  });

  test('returns warnings for broken require paths', () => {
    execSync.mockReturnValue('hooks/my-hook.js\n');
    fs.readFileSync.mockReturnValue("const foo = require('./missing-file');");
    fs.existsSync.mockReturnValue(false);

    const result = checkRequirePaths({});
    expect(result).not.toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Broken require path');
    expect(result.warnings[0]).toContain('missing-file');
  });

  test('returns null when all require paths are valid', () => {
    execSync.mockReturnValue('hooks/my-hook.js\n');
    fs.readFileSync.mockReturnValue("const foo = require('./valid-module');");
    fs.existsSync.mockReturnValue(true);

    expect(checkRequirePaths({})).toBeNull();
  });

  test('ignores non-JS files', () => {
    execSync.mockReturnValue('docs/guide.md\nREADME.txt\n');
    expect(checkRequirePaths({})).toBeNull();
  });

  test('ignores files outside hooks/ and plan-build-run/bin/', () => {
    execSync.mockReturnValue('src/app.js\nlib/util.js\n');
    expect(checkRequirePaths({})).toBeNull();
  });

  test('skips dynamic require expressions', () => {
    execSync.mockReturnValue('hooks/my-hook.js\n');
    fs.readFileSync.mockReturnValue("const m = require('./${name}');");
    fs.existsSync.mockReturnValue(false);

    // Dynamic expression with template literal should be skipped
    expect(checkRequirePaths({})).toBeNull();
  });

  test('handles .cjs files under plan-build-run/bin/', () => {
    execSync.mockReturnValue('plan-build-run/bin/tool.cjs\n');
    fs.readFileSync.mockReturnValue("const x = require('./broken');");
    fs.existsSync.mockReturnValue(false);

    const result = checkRequirePaths({});
    expect(result).not.toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// -------------------------------------------------------------------------
// checkMirrorSync
// -------------------------------------------------------------------------

describe('checkMirrorSync', () => {
  test('returns null when no files are staged', () => {
    execSync.mockReturnValue('');
    expect(checkMirrorSync({})).toBeNull();
  });

  test('returns null when both mirror sides are staged', () => {
    execSync.mockReturnValue('commands/pbr/foo.md\nplugins/pbr/commands/foo.md\n');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('same content');

    expect(checkMirrorSync({})).toBeNull();
  });

  test('returns warning when only one side of mirror pair is staged with different content', () => {
    execSync.mockReturnValue('commands/pbr/foo.md\n');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation((filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('commands/pbr/foo.md')) return 'content A';
      if (normalized.includes('plugins/pbr/commands/foo.md')) return 'content B';
      return '';
    });

    const result = checkMirrorSync({});
    expect(result).not.toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Mirror drift');
    expect(result.warnings[0]).toContain('foo.md');
  });

  test('returns null when files are outside mirror pairs', () => {
    execSync.mockReturnValue('hooks/my-hook.js\nsrc/app.js\n');
    expect(checkMirrorSync({})).toBeNull();
  });

  test('returns null when mirror counterpart does not exist on disk', () => {
    execSync.mockReturnValue('commands/pbr/new-file.md\n');
    fs.existsSync.mockImplementation((filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('commands/pbr/new-file.md')) return true;
      return false; // counterpart doesn't exist
    });

    expect(checkMirrorSync({})).toBeNull();
  });
});

// -------------------------------------------------------------------------
// checkLintErrors
// -------------------------------------------------------------------------

describe('checkLintErrors', () => {
  test('returns null when no JS files are staged', () => {
    execSync.mockReturnValue('README.md\n');
    expect(checkLintErrors({})).toBeNull();
  });

  test('returns null when eslint passes (no errors)', () => {
    // First call: git diff --cached returns staged files
    // Second call: eslint exits 0 (no errors)
    execSync
      .mockReturnValueOnce('hooks/my-hook.js\n')  // getStagedFiles
      .mockReturnValueOnce('');                     // eslint success

    expect(checkLintErrors({})).toBeNull();
  });

  test('returns warnings when eslint finds errors', () => {
    execSync
      .mockReturnValueOnce('hooks/my-hook.js\n')  // getStagedFiles
      .mockImplementationOnce(() => {               // eslint fails
        const err = new Error('eslint failed');
        err.stdout = '3 errors found';
        err.stderr = '';
        throw err;
      });

    const result = checkLintErrors({});
    expect(result).not.toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Lint errors');
    expect(result.warnings[0]).toContain('3');
  });

  test('returns null gracefully when eslint is not found (ENOENT)', () => {
    execSync
      .mockReturnValueOnce('hooks/my-hook.js\n')  // getStagedFiles
      .mockImplementationOnce(() => {               // eslint not found
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

    expect(checkLintErrors({})).toBeNull();
  });

  test('returns null when no staged files at all', () => {
    execSync.mockReturnValue('');
    expect(checkLintErrors({})).toBeNull();
  });
});
