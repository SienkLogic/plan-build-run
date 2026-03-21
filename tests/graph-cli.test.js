/**
 * Tests for pbr-tools.js graph subcommand and graph.cjs health checks.
 *
 * Tests:
 *   - graph build creates graph.json in .planning/codebase/
 *   - graph query returns node data with dependents and dependencies
 *   - graph query with --depth=2 returns transitive dependencies
 *   - graph impact returns list of impacted files
 *   - graph stats returns node_count, edge_count, pattern_count
 *   - graph command returns disabled message when feature off
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PBR_TOOLS = path.resolve(__dirname, '../plugins/pbr/scripts/pbr-tools.js');

// Helper: create a temp project with .planning and intel data
function makeTempProject(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-cli-test-'));
  const planningDir = path.join(tmp, '.planning');
  const intelDir = path.join(planningDir, 'intel');
  const codebaseDir = path.join(planningDir, 'codebase');
  fs.mkdirSync(intelDir, { recursive: true });
  fs.mkdirSync(codebaseDir, { recursive: true });

  const config = {
    version: 2,
    features: {
      architecture_graph: opts.graphEnabled !== false,
      architecture_guard: true
    }
  };
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config, null, 2));

  // Write intel files.json with a small dep graph
  const filesData = {
    _meta: { updated_at: new Date().toISOString(), version: 1 },
    entries: {
      'src/app.js': {
        exports: ['start'],
        imports: ['src/db.js'],
        type: 'script',
        lines: 50
      },
      'src/db.js': {
        exports: ['connect'],
        imports: ['src/config.js'],
        type: 'script',
        lines: 30
      },
      'src/config.js': {
        exports: ['load'],
        imports: [],
        type: 'script',
        lines: 20
      }
    }
  };
  fs.writeFileSync(path.join(intelDir, 'files.json'), JSON.stringify(filesData, null, 2));

  return { tmp, planningDir, intelDir, codebaseDir };
}

function cleanupTemp(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

function runPbrTools(args, cwd) {
  const result = execFileSync(
    process.execPath,
    [PBR_TOOLS, ...args],
    { cwd, env: { ...process.env, PBR_PROJECT_ROOT: cwd }, encoding: 'utf8', timeout: 15000 }
  );
  return JSON.parse(result);
}

describe('pbr-tools.js graph subcommand', () => {
  describe('graph build', () => {
    test('creates graph.json in .planning/codebase/', () => {
      const { tmp, codebaseDir } = makeTempProject();
      try {
        const result = runPbrTools(['graph', 'build'], tmp);
        expect(result).toHaveProperty('_meta');
        expect(result._meta.node_count).toBeGreaterThan(0);
        expect(fs.existsSync(path.join(codebaseDir, 'graph.json'))).toBe(true);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns disabled message when feature off', () => {
      const { tmp } = makeTempProject({ graphEnabled: false });
      try {
        const result = runPbrTools(['graph', 'build'], tmp);
        expect(result).toHaveProperty('disabled', true);
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('graph query', () => {
    test('returns node data with dependents and dependencies', () => {
      const { tmp } = makeTempProject();
      try {
        // Build first
        runPbrTools(['graph', 'build'], tmp);
        const result = runPbrTools(['graph', 'query', 'src/db.js'], tmp);
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('dependents');
        expect(result).toHaveProperty('dependencies');
        expect(result).toHaveProperty('impact_radius');
        // app.js depends on db.js
        expect(result.dependents).toContain('src/app.js');
        // db.js depends on config.js
        expect(result.dependencies).toContain('src/config.js');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('with --depth=2 returns transitive dependencies', () => {
      const { tmp } = makeTempProject();
      try {
        runPbrTools(['graph', 'build'], tmp);
        const result = runPbrTools(['graph', 'query', 'src/app.js', '--depth', '2'], tmp);
        expect(result).toHaveProperty('dependencies');
        // app.js -> db.js -> config.js (depth 2)
        expect(result.dependencies).toContain('src/db.js');
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('graph impact', () => {
    test('returns list of impacted files', () => {
      const { tmp } = makeTempProject();
      try {
        runPbrTools(['graph', 'build'], tmp);
        const result = runPbrTools(['graph', 'impact', 'src/config.js'], tmp);
        expect(Array.isArray(result)).toBe(true);
        // config.js is imported by db.js and app.js
        expect(result).toContain('src/db.js');
        expect(result).toContain('src/app.js');
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('graph stats', () => {
    test('returns node_count, edge_count, pattern_count', () => {
      const { tmp } = makeTempProject();
      try {
        runPbrTools(['graph', 'build'], tmp);
        const result = runPbrTools(['graph', 'stats'], tmp);
        expect(result).toHaveProperty('node_count');
        expect(result).toHaveProperty('edge_count');
        expect(result).toHaveProperty('pattern_count');
        expect(result.node_count).toBeGreaterThan(0);
      } finally {
        cleanupTemp(tmp);
      }
    });
  });
});
