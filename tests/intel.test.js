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
  INTEL_FILES,
  INTEL_DIR
} = require('../plan-build-run/bin/lib/intel.cjs');

// Suppress config cache between tests
const { configClearCache } = require('../plan-build-run/bin/lib/config.cjs');

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
    const { planningDir, intelDir, cleanup } = createTempProject();

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
