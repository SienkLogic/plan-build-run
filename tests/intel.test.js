/**
 * tests/intel.test.js -- Unit tests for intel.cjs library module.
 *
 * Uses isolated temp directories (fs.mkdtempSync) for each test.
 * Covers: config gate, intelQuery, intelStatus, intelDiff,
 *         saveRefreshSnapshot, ensureIntelDir.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  intelQuery,
  intelUpdate,
  intelStatus,
  intelDiff,
  saveRefreshSnapshot,
  ensureIntelDir,
  isIntelEnabled,
  intelSnapshot,
  intelValidate,
  intelExtractExports,
  intelPatchMeta,
  INTEL_FILES,
  INTEL_DIR
} = require('../plugins/pbr/scripts/lib/intel');

// Suppress config cache between tests
const { configClearCache } = require('../plugins/pbr/scripts/lib/config');

/**
 * Create a temp directory with .planning/intel/ structure and a config.json.
 * @param {object} [configOverrides] - Override config values
 * @returns {{ planningDir: string, intelDir: string, cleanup: Function }}
 */
function createTempProject(configOverrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-intel-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  const intelDir = path.join(planningDir, 'intel');

  fs.mkdirSync(intelDir, { recursive: true });

  const config = { intel: { enabled: true }, ...configOverrides };
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  return {
    planningDir,
    intelDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true })
  };
}

/**
 * Write a JSON intel file with _meta and entries.
 * @param {string} intelDir
 * @param {string} filename
 * @param {object} entries
 * @param {string} [updatedAt]
 */
function writeIntelFile(intelDir, filename, entries, updatedAt) {
  const data = {
    _meta: {
      updated_at: updatedAt || new Date().toISOString(),
      version: 1,
      source: 'test'
    },
    entries
  };
  fs.writeFileSync(path.join(intelDir, filename), JSON.stringify(data, null, 2), 'utf8');
}

afterEach(() => {
  configClearCache();
});

// ─── Config gate ─────────────────────────────────────────────────────────────

describe('Config gate', () => {
  test('all functions return disabled when intel.enabled is false', () => {
    const { planningDir, cleanup } = createTempProject({ intel: { enabled: false } });

    try {
      const expected = { disabled: true, message: expect.stringContaining('disabled') };

      expect(intelQuery('test', planningDir)).toEqual(expected);
      expect(intelStatus(planningDir)).toEqual(expected);
      expect(intelDiff(planningDir)).toEqual(expected);
      expect(intelUpdate(planningDir)).toEqual(expected);
    } finally {
      cleanup();
    }
  });

  test('isIntelEnabled returns true when no config exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-intel-noconfig-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    try {
      expect(isIntelEnabled(planningDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('isIntelEnabled returns true when intel key is absent', () => {
    const { planningDir, cleanup } = createTempProject({});
    // Remove the intel key by writing config without it
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ mode: 'interactive' }, null, 2),
      'utf8'
    );

    try {
      expect(isIntelEnabled(planningDir)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ─── intelQuery ──────────────────────────────────────────────────────────────

describe('intelQuery', () => {
  test('finds matches in files.json entries', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    writeIntelFile(intelDir, 'files.json', {
      'src/auth.js': { exports: ['login', 'logout'], imports: ['jwt'], type: 'module' },
      'src/db.js': { exports: ['connect'], imports: ['pg'], type: 'module' },
      'src/utils.js': { exports: ['hash'], imports: [], type: 'module' }
    });

    try {
      const result = intelQuery('auth', planningDir);
      expect(result.term).toBe('auth');
      expect(result.total).toBeGreaterThan(0);

      const fileMatch = result.matches.find(m => m.source === 'files.json');
      expect(fileMatch).toBeDefined();
      expect(fileMatch.entries.length).toBeGreaterThan(0);
      expect(fileMatch.entries[0].key).toBe('src/auth.js');
    } finally {
      cleanup();
    }
  });

  test('finds matches in apis.json entries', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    writeIntelFile(intelDir, 'apis.json', {
      '/api/users': { method: 'GET', params: ['id'], file: 'routes/users.js', description: 'List users' },
      '/api/auth/login': { method: 'POST', params: ['email', 'password'], file: 'routes/auth.js', description: 'User login' }
    });

    try {
      const result = intelQuery('login', planningDir);
      expect(result.total).toBeGreaterThan(0);

      const apiMatch = result.matches.find(m => m.source === 'apis.json');
      expect(apiMatch).toBeDefined();
    } finally {
      cleanup();
    }
  });

  test('finds matches in arch.md text', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    fs.writeFileSync(
      path.join(intelDir, 'arch.md'),
      '---\nupdated_at: 2026-03-17T00:00:00Z\n---\n\n# Architecture\n\nUses layered architecture with MVC pattern.\nDatabase layer uses PostgreSQL.\n',
      'utf8'
    );

    try {
      const result = intelQuery('postgresql', planningDir);
      expect(result.total).toBeGreaterThan(0);

      const archMatch = result.matches.find(m => m.source === 'arch.md');
      expect(archMatch).toBeDefined();
      expect(archMatch.entries.some(line => line.toLowerCase().includes('postgresql'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('returns empty matches for nonexistent term', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    writeIntelFile(intelDir, 'files.json', {
      'src/app.js': { exports: ['start'], imports: [], type: 'module' }
    });

    try {
      const result = intelQuery('zzz_nonexistent_zzz', planningDir);
      expect(result.total).toBe(0);
      expect(result.matches).toEqual([]);
    } finally {
      cleanup();
    }
  });

  test('search is case-insensitive', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    writeIntelFile(intelDir, 'files.json', {
      'src/AuthService.js': { exports: ['AuthService'], imports: [], type: 'module' }
    });

    try {
      const result = intelQuery('authservice', planningDir);
      expect(result.total).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});

// ─── intelStatus ─────────────────────────────────────────────────────────────

describe('intelStatus', () => {
  test('reports exists/missing correctly for partial intel files', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    // Create only 2 of the 5 intel files
    writeIntelFile(intelDir, 'files.json', {});
    writeIntelFile(intelDir, 'deps.json', {});

    try {
      const result = intelStatus(planningDir);
      expect(result.files['files.json'].exists).toBe(true);
      expect(result.files['deps.json'].exists).toBe(true);
      expect(result.files['apis.json'].exists).toBe(false);
      expect(result.files['arch.md'].exists).toBe(false);
      expect(result.files['stack.json'].exists).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('reports stale: true for files older than 24 hours', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeIntelFile(intelDir, 'files.json', {}, twentyFiveHoursAgo);

    try {
      const result = intelStatus(planningDir);
      expect(result.files['files.json'].stale).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('reports stale: false for recently updated files', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    writeIntelFile(intelDir, 'files.json', {}, oneHourAgo);

    try {
      const result = intelStatus(planningDir);
      expect(result.files['files.json'].stale).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('overall_stale is true when any file is missing', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    // Only create one file
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    writeIntelFile(intelDir, 'files.json', {}, oneHourAgo);

    try {
      const result = intelStatus(planningDir);
      expect(result.overall_stale).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ─── intelDiff ───────────────────────────────────────────────────────────────

describe('intelDiff', () => {
  test('returns no_baseline when no snapshot exists', () => {
    const { planningDir, cleanup } = createTempProject();

    try {
      const result = intelDiff(planningDir);
      expect(result.no_baseline).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('detects changed files after snapshot', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    // Create a file, take snapshot, modify file
    writeIntelFile(intelDir, 'files.json', { 'a.js': { type: 'module' } });
    saveRefreshSnapshot(planningDir);

    // Modify the file
    writeIntelFile(intelDir, 'files.json', { 'a.js': { type: 'module' }, 'b.js': { type: 'test' } });

    try {
      const result = intelDiff(planningDir);
      expect(result.changed).toContain('files.json');
    } finally {
      cleanup();
    }
  });

  test('detects added files after snapshot', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    // Take snapshot with only files.json
    writeIntelFile(intelDir, 'files.json', {});
    saveRefreshSnapshot(planningDir);

    // Add a new file
    writeIntelFile(intelDir, 'apis.json', { '/test': { method: 'GET' } });

    try {
      const result = intelDiff(planningDir);
      expect(result.added).toContain('apis.json');
    } finally {
      cleanup();
    }
  });

  test('detects removed files after snapshot', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    // Create files, take snapshot, remove one
    writeIntelFile(intelDir, 'files.json', {});
    writeIntelFile(intelDir, 'deps.json', {});
    saveRefreshSnapshot(planningDir);

    // Remove deps.json
    fs.unlinkSync(path.join(intelDir, 'deps.json'));

    try {
      const result = intelDiff(planningDir);
      expect(result.removed).toContain('deps.json');
    } finally {
      cleanup();
    }
  });
});

// ─── saveRefreshSnapshot ─────────────────────────────────────────────────────

describe('saveRefreshSnapshot', () => {
  test('writes .last-refresh.json with file hashes', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    writeIntelFile(intelDir, 'files.json', { 'x.js': {} });
    writeIntelFile(intelDir, 'deps.json', { lodash: { version: '4.0.0' } });

    try {
      const result = saveRefreshSnapshot(planningDir);
      expect(result.saved).toBe(true);
      expect(result.files).toBe(2);
      expect(result.timestamp).toBeDefined();

      // Verify the snapshot file exists and has hashes
      const snapshotPath = path.join(intelDir, '.last-refresh.json');
      expect(fs.existsSync(snapshotPath)).toBe(true);

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      expect(snapshot.hashes['files.json']).toBeDefined();
      expect(snapshot.hashes['deps.json']).toBeDefined();
      expect(typeof snapshot.hashes['files.json']).toBe('string');
      expect(snapshot.hashes['files.json'].length).toBe(64); // SHA-256 hex length
    } finally {
      cleanup();
    }
  });
});

// ─── ensureIntelDir ──────────────────────────────────────────────────────────

describe('ensureIntelDir', () => {
  test('creates intel directory when absent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-intel-ensure-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    try {
      const result = ensureIntelDir(planningDir);
      expect(fs.existsSync(result)).toBe(true);
      expect(result).toBe(path.join(planningDir, 'intel'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('no error when directory already exists', () => {
    const { planningDir, intelDir: _intelDir, cleanup } = createTempProject();

    try {
      // Should not throw
      const result = ensureIntelDir(planningDir);
      expect(fs.existsSync(result)).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ─── intelUpdate (stub) ──────────────────────────────────────────────────────

describe('intelUpdate', () => {
  test('returns spawn_agent action when enabled', () => {
    const { planningDir, cleanup } = createTempProject();

    try {
      const result = intelUpdate(planningDir);
      expect(result.action).toBe('spawn_agent');
      expect(result.message).toContain('pbr:intel');
    } finally {
      cleanup();
    }
  });
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe('Constants', () => {
  test('INTEL_FILES has all 5 expected files', () => {
    expect(Object.keys(INTEL_FILES)).toEqual(['files', 'apis', 'deps', 'arch', 'stack']);
    expect(INTEL_FILES.files).toBe('files.json');
    expect(INTEL_FILES.arch).toBe('arch.md');
  });

  test('INTEL_DIR is correct', () => {
    expect(INTEL_DIR).toBe('.planning/intel');
  });
});

// ─── intelSnapshot ──────────────────────────────────────────────────────────

describe('intelSnapshot', () => {
  test('writes .last-refresh.json with accurate timestamp', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();
    writeIntelFile(intelDir, 'files.json', { 'a.js': { exports: [] } });
    writeIntelFile(intelDir, 'deps.json', { lodash: { version: '4.0.0' } });

    try {
      const before = Date.now();
      const result = intelSnapshot(planningDir);
      const after = Date.now();

      expect(result.saved).toBe(true);
      const ts = new Date(result.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);

      const snapshotPath = path.join(intelDir, '.last-refresh.json');
      expect(fs.existsSync(snapshotPath)).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('returns disabled when intel is off', () => {
    const { planningDir, cleanup } = createTempProject({ intel: { enabled: false } });

    try {
      const result = intelSnapshot(planningDir);
      expect(result.disabled).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ─── intelValidate ──────────────────────────────────────────────────────────

describe('intelValidate', () => {
  test('returns valid:true for correct intel files', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();
    const now = new Date().toISOString();

    writeIntelFile(intelDir, 'files.json', { 'a.js': { exports: ['foo', 'bar'], type: 'module' } }, now);
    writeIntelFile(intelDir, 'apis.json', {}, now);
    writeIntelFile(intelDir, 'deps.json', { lodash: { version: '4.0', type: 'production', used_by: ['a.js'] } }, now);
    writeIntelFile(intelDir, 'stack.json', {}, now);
    fs.writeFileSync(path.join(intelDir, 'arch.md'), '---\nupdated_at: ' + now + '\n---\n# Arch\n', 'utf8');

    try {
      const result = intelValidate(planningDir);
      expect(result.valid).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('warns on description-style exports', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    writeIntelFile(intelDir, 'files.json', {
      'b.js': { exports: ['CLI dispatcher'], type: 'module' }
    });

    try {
      const result = intelValidate(planningDir);
      expect(result.warnings.some(w => w.includes('CLI dispatcher'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('warns on stale timestamps', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeIntelFile(intelDir, 'files.json', {}, old);

    try {
      const result = intelValidate(planningDir);
      expect(result.warnings.some(w => w.includes('hours old') || w.includes('>24 hr'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('errors on missing files', () => {
    const { planningDir, cleanup } = createTempProject();
    // No intel files written — all 5 missing

    try {
      const result = intelValidate(planningDir);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('errors on invalid JSON', () => {
    const { planningDir, intelDir, cleanup } = createTempProject();

    fs.writeFileSync(path.join(intelDir, 'files.json'), '{broken json!!!', 'utf8');

    try {
      const result = intelValidate(planningDir);
      expect(result.errors.some(e => e.includes('invalid JSON'))).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ─── intelExtractExports ────────────────────────────────────────────────────

describe('intelExtractExports', () => {
  function writeTempFile(content) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-extract-'));
    const filePath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
  }

  test('extracts CJS module.exports keys', () => {
    const { filePath, cleanup } = writeTempFile(
      'function foo() {}\nfunction bar() {}\nconst baz = 1;\nmodule.exports = {\n  foo,\n  bar,\n  baz\n};\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toEqual(expect.arrayContaining(['foo', 'bar', 'baz']));
      expect(r.method).toBe('module.exports');
    } finally { cleanup(); }
  });

  test('extracts exports.X patterns', () => {
    const { filePath, cleanup } = writeTempFile(
      'exports.hello = function() {};\nexports.world = 42;\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toContain('hello');
      expect(r.exports).toContain('world');
    } finally { cleanup(); }
  });

  test('extracts ESM export function', () => {
    const { filePath, cleanup } = writeTempFile(
      'export function doThing() {\n  return 1;\n}\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toContain('doThing');
      expect(r.method).toBe('esm');
    } finally { cleanup(); }
  });

  test('extracts ESM export const/let', () => {
    const { filePath, cleanup } = writeTempFile(
      'export const MY_VAR = 42;\nexport let counter = 0;\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toContain('MY_VAR');
      expect(r.exports).toContain('counter');
      expect(r.method).toBe('esm');
    } finally { cleanup(); }
  });

  test('extracts ESM export default function', () => {
    const { filePath, cleanup } = writeTempFile(
      'export default function App() {\n  return null;\n}\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toContain('App');
      expect(r.method).toBe('esm');
    } finally { cleanup(); }
  });

  test('extracts ESM named export block', () => {
    const { filePath, cleanup } = writeTempFile(
      'const foo = 1;\nconst bar = 2;\nconst baz = 3;\nexport { foo, bar as baz };\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toContain('foo');
      expect(r.exports).toContain('bar');
      expect(r.exports).not.toContain('baz');
      expect(r.method).toBe('esm');
    } finally { cleanup(); }
  });

  test('returns empty for nonexistent file', () => {
    const r = intelExtractExports('/no/such/file/anywhere.js');
    expect(r.exports).toEqual([]);
    expect(r.method).toBe('none');
  });

  test('handles mixed CJS and ESM', () => {
    const { filePath, cleanup } = writeTempFile(
      'module.exports = { alpha };\nexport function beta() {}\n'
    );
    try {
      const r = intelExtractExports(filePath);
      expect(r.exports).toContain('alpha');
      expect(r.exports).toContain('beta');
      expect(r.method).toBe('mixed');
    } finally { cleanup(); }
  });
});

// ─── intelPatchMeta ─────────────────────────────────────────────────────────

describe('intelPatchMeta', () => {
  test('patches _meta.updated_at to current time', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-patch-'));
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, JSON.stringify({
      _meta: { updated_at: '2020-01-01T00:00:00Z', version: 1 },
      entries: {}
    }, null, 2), 'utf8');

    try {
      const before = Date.now();
      const result = intelPatchMeta(filePath);
      expect(result.patched).toBe(true);

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const ts = new Date(data._meta.updated_at).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('increments version', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-patch-'));
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, JSON.stringify({
      _meta: { updated_at: '2020-01-01T00:00:00Z', version: 1 },
      entries: {}
    }, null, 2), 'utf8');

    try {
      intelPatchMeta(filePath);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(data._meta.version).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns error for nonexistent file', () => {
    const result = intelPatchMeta('/no/such/path/data.json');
    expect(result.patched).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('returns error for invalid JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-patch-'));
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{not valid json!!!', 'utf8');

    try {
      const result = intelPatchMeta(filePath);
      expect(result.patched).toBe(false);
      expect(result.error).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
