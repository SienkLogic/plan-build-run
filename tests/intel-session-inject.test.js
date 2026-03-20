const fs = require('fs');
const path = require('path');
const os = require('os');

// We test the exported functions from the hooks/ copy (used by progress-tracker tests)
const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'progress-tracker.js');

describe('intel session injection', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-intel-inject-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.mkdirSync(path.join(planningDir, 'intel'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config) {
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    );
  }

  function writeArchMd(content) {
    fs.writeFileSync(
      path.join(planningDir, 'intel', 'arch.md'),
      content,
      'utf8'
    );
  }

  // Lazy-load the module to pick up fresh state
  function loadModule() {
    // Clear require cache so tests are isolated
    delete require.cache[require.resolve(SCRIPT)];
    return require(SCRIPT);
  }

  describe('getIntelContext', () => {
    test('returns arch.md content when file exists and inject_on_start is true', () => {
      const { getIntelContext } = loadModule();
      writeConfig({ intel: { enabled: true, inject_on_start: true } });
      const config = { intel: { enabled: true, inject_on_start: true } };
      writeArchMd('# Architecture\nThis is the arch summary.');

      const result = getIntelContext(planningDir, config);
      expect(result).toContain('## Codebase Intelligence');
      expect(result).toContain('This is the arch summary.');
    });

    test('returns empty string when inject_on_start is false', () => {
      const { getIntelContext } = loadModule();
      const config = { intel: { enabled: true, inject_on_start: false } };
      writeArchMd('# Architecture\nSome content.');

      const result = getIntelContext(planningDir, config);
      expect(result).toBe('');
    });

    test('returns empty string when intel.enabled is false', () => {
      const { getIntelContext } = loadModule();
      const config = { intel: { enabled: false, inject_on_start: true } };
      writeArchMd('# Architecture\nSome content.');

      const result = getIntelContext(planningDir, config);
      expect(result).toBe('');
    });

    test('returns empty string when arch.md does not exist', () => {
      const { getIntelContext } = loadModule();
      const config = { intel: { enabled: true, inject_on_start: true } };
      // No arch.md written

      const result = getIntelContext(planningDir, config);
      expect(result).toBe('');
    });

    test('returns empty string when config is null', () => {
      const { getIntelContext } = loadModule();
      const result = getIntelContext(planningDir, null);
      expect(result).toBe('');
    });

    test('truncates arch.md to ~2000 chars if longer', () => {
      const { getIntelContext } = loadModule();
      const config = { intel: { enabled: true, inject_on_start: true } };
      const longContent = 'A'.repeat(5000);
      writeArchMd(longContent);

      const result = getIntelContext(planningDir, config);
      // The header adds some chars, but the arch content portion should be <= 2000
      expect(result).toContain('## Codebase Intelligence');
      // Total content from arch.md should be truncated
      const archPortion = result.replace('\n## Codebase Intelligence\n', '');
      expect(archPortion.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('getIntelStalenessWarning', () => {
    test('returns warning when intel file updated_at > 24h ago', () => {
      const { getIntelStalenessWarning } = loadModule();
      const config = { intel: { enabled: true } };
      // Create an arch.md with old mtime
      writeArchMd('# Arch');
      const archPath = path.join(planningDir, 'intel', 'arch.md');
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      fs.utimesSync(archPath, oldTime, oldTime);
      // Create JSON files with old updated_at
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      for (const filename of ['files.json', 'apis.json', 'deps.json', 'stack.json']) {
        fs.writeFileSync(
          path.join(planningDir, 'intel', filename),
          JSON.stringify({ _meta: { updated_at: oldTimestamp }, entries: {} }),
          'utf8'
        );
      }

      const result = getIntelStalenessWarning(planningDir, config);
      expect(result).toContain('Warning');
      expect(result).toContain('stale');
      expect(result).toContain('/pbr:intel update');
    });

    test('returns empty string when all files are fresh', () => {
      const { getIntelStalenessWarning } = loadModule();
      const config = { intel: { enabled: true } };
      // Create all intel files with fresh timestamps
      writeArchMd('# Arch');
      const freshTimestamp = new Date().toISOString();
      for (const filename of ['files.json', 'apis.json', 'deps.json', 'stack.json']) {
        fs.writeFileSync(
          path.join(planningDir, 'intel', filename),
          JSON.stringify({ _meta: { updated_at: freshTimestamp }, entries: {} }),
          'utf8'
        );
      }

      const result = getIntelStalenessWarning(planningDir, config);
      expect(result).toBe('');
    });

    test('returns empty string when intel.enabled is false', () => {
      const { getIntelStalenessWarning } = loadModule();
      const config = { intel: { enabled: false } };

      const result = getIntelStalenessWarning(planningDir, config);
      expect(result).toBe('');
    });

    test('returns warning suggesting /pbr:intel update', () => {
      const { getIntelStalenessWarning } = loadModule();
      const config = { intel: { enabled: true } };
      // Create arch.md with stale mtime
      writeArchMd('# Arch');
      const archPath = path.join(planningDir, 'intel', 'arch.md');
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      fs.utimesSync(archPath, oldTime, oldTime);
      // Other files don't exist (also stale)

      const result = getIntelStalenessWarning(planningDir, config);
      expect(result).toContain('/pbr:intel update');
    });
  });
});
