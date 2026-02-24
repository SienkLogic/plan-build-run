const { checkDocSprawl, isBlockDocSprawlEnabled } = require('../plugins/pbr/scripts/check-doc-sprawl');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-cds-'));
  const planningDir = path.join(tmpDir, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return { tmpDir, planningDir };
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function enableBlockDocSprawl(planningDir) {
  fs.writeFileSync(path.join(planningDir, 'config.json'),
    JSON.stringify({ hooks: { blockDocSprawl: true } }));
}

describe('check-doc-sprawl.js', () => {
  describe('isBlockDocSprawlEnabled', () => {
    test('returns false when no config.json', () => {
      const { tmpDir } = makeTmpDir();
      expect(isBlockDocSprawlEnabled(tmpDir)).toBe(false);
      cleanup(tmpDir);
    });

    test('returns false when blockDocSprawl not set', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      fs.writeFileSync(path.join(planningDir, 'config.json'), '{"depth": "standard"}');
      expect(isBlockDocSprawlEnabled(tmpDir)).toBe(false);
      cleanup(tmpDir);
    });

    test('returns true when blockDocSprawl enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      expect(isBlockDocSprawlEnabled(tmpDir)).toBe(true);
      cleanup(tmpDir);
    });
  });

  describe('checkDocSprawl', () => {
    test('returns null for non-doc files', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'app.js') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for empty file_path', () => {
      const result = checkDocSprawl({ tool_input: {} });
      expect(result).toBeNull();
    });

    test('returns null when blockDocSprawl is disabled', () => {
      const { tmpDir } = makeTmpDir();
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'random-doc.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('uses process.cwd() when cwd argument is omitted', () => {
      const { tmpDir } = makeTmpDir();
      const originalCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        // No config = disabled, so should return null regardless
        const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'random-doc.md') } });
        expect(result).toBeNull();
      } finally {
        process.chdir(originalCwd);
        cleanup(tmpDir);
      }
    });

    test('returns null for existing files (edit, not create)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const filePath = path.join(tmpDir, 'existing-notes.md');
      fs.writeFileSync(filePath, '# Notes');
      const result = checkDocSprawl({ tool_input: { file_path: filePath } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for README.md (allowlisted)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'README.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for CLAUDE.md (allowlisted, case-insensitive)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'CLAUDE.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for CONTRIBUTING.md (allowlisted)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'CONTRIBUTING.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for CHANGELOG.md (allowlisted)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'CHANGELOG.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for LICENSE.md (allowlisted)', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'LICENSE.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for files in .planning/ directory', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(planningDir, 'phases', '01-init', 'PLAN.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('returns null for files in .claude/ directory', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const claudeDir = path.join(tmpDir, '.claude', 'rules');
      fs.mkdirSync(claudeDir, { recursive: true });
      const result = checkDocSprawl({ tool_input: { file_path: path.join(claudeDir, 'custom-rule.md') } }, tmpDir);
      expect(result).toBeNull();
      cleanup(tmpDir);
    });

    test('blocks new .md file outside allowlist when enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'random-thoughts.md') } }, tmpDir);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      expect(result.output.decision).toBe('block');
      expect(result.output.reason).toContain('[Doc Sprawl]');
      expect(result.output.reason).toContain('random-thoughts.md');
      cleanup(tmpDir);
    });

    test('blocks new .txt file outside allowlist when enabled', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { file_path: path.join(tmpDir, 'notes.txt') } }, tmpDir);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      expect(result.output.decision).toBe('block');
      cleanup(tmpDir);
    });

    test('blocks nested .md file outside allowed dirs', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const nestedDir = path.join(tmpDir, 'src', 'docs');
      fs.mkdirSync(nestedDir, { recursive: true });
      const result = checkDocSprawl({ tool_input: { file_path: path.join(nestedDir, 'api-guide.md') } }, tmpDir);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      cleanup(tmpDir);
    });

    test('uses tool_input.path as fallback', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const result = checkDocSprawl({ tool_input: { path: path.join(tmpDir, 'stray-doc.md') } }, tmpDir);
      expect(result).not.toBeNull();
      expect(result.exitCode).toBe(2);
      cleanup(tmpDir);
    });
  });

  describe('pre-write-dispatch integration', () => {
    const DISPATCH_SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pre-write-dispatch.js');

    test('blocks doc sprawl through dispatcher', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      enableBlockDocSprawl(planningDir);
      const filePath = path.join(tmpDir, 'unwanted-notes.md');
      const input = JSON.stringify({ tool_input: { file_path: filePath } });

      try {
        execSync(`node "${DISPATCH_SCRIPT}"`, {
          input,
          encoding: 'utf8',
          timeout: 5000,
          cwd: tmpDir,
        });
        // Should not reach here — script should exit with code 2
        expect(true).toBe(false);
      } catch (e) {
        expect(e.status).toBe(2);
        const output = JSON.parse(e.stdout);
        expect(output.decision).toBe('block');
        expect(output.reason).toContain('[Doc Sprawl]');
      }
      cleanup(tmpDir);
    });

    test('allows doc creation when blockDocSprawl is disabled', () => {
      const { tmpDir } = makeTmpDir();
      const filePath = path.join(tmpDir, 'unwanted-notes.md');
      const input = JSON.stringify({ tool_input: { file_path: filePath } });

      const result = execSync(`node "${DISPATCH_SCRIPT}"`, {
        input,
        encoding: 'utf8',
        timeout: 5000,
        cwd: tmpDir,
      });
      expect(result).toBe('');
      cleanup(tmpDir);
    });
  });
});
