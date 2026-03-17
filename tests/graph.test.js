/**
 * Tests for plan-build-run/bin/lib/graph.cjs
 *
 * Graph builder module: builds, queries, and incrementally updates
 * a dependency graph from intel data and source analysis.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper: create a temp .planning directory with intel data
function makeTempPlanning(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-test-'));
  const planningDir = path.join(tmp, '.planning');
  const intelDir = path.join(planningDir, 'intel');
  const codebaseDir = path.join(planningDir, 'codebase');
  fs.mkdirSync(intelDir, { recursive: true });
  fs.mkdirSync(codebaseDir, { recursive: true });

  // Write config.json if needed
  const configDir = planningDir;
  const config = {
    version: 2,
    features: {
      architecture_graph: opts.graphEnabled !== false,
      architecture_guard: opts.guardEnabled !== false
    }
  };
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));

  // Write files.json
  if (opts.files !== false) {
    const filesData = opts.filesData || {
      _meta: { updated_at: new Date().toISOString(), version: 1 },
      entries: {
        'src/app.js': {
          exports: ['start', 'stop'],
          imports: ['src/db.js', 'src/config.js'],
          type: 'script',
          lines: 120
        },
        'src/db.js': {
          exports: ['connect', 'query'],
          imports: ['src/config.js'],
          type: 'script',
          lines: 80
        },
        'src/config.js': {
          exports: ['load'],
          imports: [],
          type: 'script',
          lines: 40
        }
      }
    };
    fs.writeFileSync(path.join(intelDir, 'files.json'), JSON.stringify(filesData, null, 2));
  }

  // Write deps.json
  if (opts.deps !== false) {
    const depsData = opts.depsData || {
      _meta: { updated_at: new Date().toISOString(), version: 1 },
      entries: {
        express: { version: '4.18.0', type: 'runtime', used_by: ['src/app.js'] },
        mysql2: { version: '3.0.0', type: 'runtime', used_by: ['src/db.js'] }
      }
    };
    fs.writeFileSync(path.join(intelDir, 'deps.json'), JSON.stringify(depsData, null, 2));
  }

  // Create fake source files for pattern detection if projectRoot provided
  if (opts.createSourceFiles) {
    const projectRoot = tmp;
    // Create hook-like file
    const scriptsDir = path.join(projectRoot, 'plugins', 'pbr', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'my-hook.js'),
      `const { logHook } = require('./hook-logger');\nmodule.exports = function() {};\n`);

    // Create agent file
    const agentsDir = path.join(projectRoot, 'plugins', 'pbr', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'test-agent.md'),
      `---\nname: test-agent\ndescription: "Test"\ntools:\n  - Read\n---\nBody.\n`);

    // Create lib module
    const libDir = path.join(projectRoot, 'plan-build-run', 'bin', 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, 'test-lib.cjs'),
      `'use strict';\nfunction helper() {}\nmodule.exports = { helper };\n`);
  }

  return { tmp, planningDir, intelDir, codebaseDir };
}

function cleanupTemp(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

// Clear config cache between tests
beforeEach(() => {
  try {
    const { configClearCache } = require('../plan-build-run/bin/lib/config.cjs');
    configClearCache();
  } catch (_e) { /* ignore */ }
});

describe('graph.cjs', () => {
  const graph = require('../plan-build-run/bin/lib/graph.cjs');

  describe('buildGraph', () => {
    test('returns valid graph structure with nodes and edges', () => {
      const { tmp, planningDir } = makeTempPlanning({ createSourceFiles: true });
      try {
        const result = graph.buildGraph(planningDir, tmp);
        expect(result).toHaveProperty('_meta');
        expect(result).toHaveProperty('nodes');
        expect(result).toHaveProperty('edges');
        expect(result).toHaveProperty('patterns');
        expect(result._meta).toHaveProperty('version', 1);
        expect(result._meta).toHaveProperty('node_count');
        expect(result._meta).toHaveProperty('edge_count');
        expect(result._meta).toHaveProperty('updated_at');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('creates nodes from intel files.json entries', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const result = graph.buildGraph(planningDir, tmp);
        expect(result.nodes['src/app.js']).toBeDefined();
        expect(result.nodes['src/db.js']).toBeDefined();
        expect(result.nodes['src/config.js']).toBeDefined();
        expect(result.nodes['src/app.js'].exports).toContain('start');
        expect(result.nodes['src/app.js'].size_lines).toBe(120);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('creates edges from intel deps.json import relationships', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const result = graph.buildGraph(planningDir, tmp);
        // app.js imports db.js and config.js
        const appEdges = result.edges.filter(e => e.from === 'src/app.js');
        expect(appEdges.length).toBeGreaterThanOrEqual(2);
        expect(appEdges.some(e => e.to === 'src/db.js' && e.type === 'import')).toBe(true);
        expect(appEdges.some(e => e.to === 'src/config.js' && e.type === 'import')).toBe(true);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('detects architectural patterns (hook dispatch, lib modules, agent files)', () => {
      const { tmp, planningDir } = makeTempPlanning({ createSourceFiles: true });
      try {
        const result = graph.buildGraph(planningDir, tmp);
        // Should detect commonjs-lib pattern from lib/*.cjs files
        expect(result.patterns).toBeDefined();
        const patternNames = Object.keys(result.patterns);
        expect(patternNames.length).toBeGreaterThan(0);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns disabled response when features.architecture_graph is false', () => {
      const { tmp, planningDir } = makeTempPlanning({ graphEnabled: false });
      try {
        const result = graph.buildGraph(planningDir, tmp);
        expect(result).toHaveProperty('disabled', true);
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('queryGraph', () => {
    test('returns node with dependents and dependencies', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const g = graph.buildGraph(planningDir, tmp);
        const result = graph.queryGraph(g, 'src/db.js');
        expect(result).toHaveProperty('node');
        expect(result).toHaveProperty('dependents');
        expect(result).toHaveProperty('dependencies');
        expect(result).toHaveProperty('impact_radius');
        // app.js depends on db.js, so db.js should have app.js as dependent
        expect(result.dependents).toContain('src/app.js');
        // db.js imports config.js
        expect(result.dependencies).toContain('src/config.js');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('with depth option limits traversal', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const g = graph.buildGraph(planningDir, tmp);
        const result = graph.queryGraph(g, 'src/config.js', { depth: 1 });
        // config.js is imported by app.js and db.js
        expect(result.dependents.length).toBeGreaterThan(0);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns empty result for unknown node', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const g = graph.buildGraph(planningDir, tmp);
        const result = graph.queryGraph(g, 'nonexistent/file.js');
        expect(result.node).toBeNull();
        expect(result.dependents).toEqual([]);
        expect(result.dependencies).toEqual([]);
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('getImpactedFiles', () => {
    test('returns transitive dependents for a given file', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const g = graph.buildGraph(planningDir, tmp);
        // config.js is imported by db.js and app.js
        // db.js is imported by app.js
        // So changing config.js impacts db.js and app.js
        const impacted = graph.getImpactedFiles(g, 'src/config.js');
        expect(impacted).toContain('src/db.js');
        expect(impacted).toContain('src/app.js');
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('updateGraphIncremental', () => {
    test('updates single node and its edges without full rebuild', () => {
      const { tmp, planningDir, intelDir } = makeTempPlanning();
      try {
        // First build
        const g1 = graph.buildGraph(planningDir, tmp);
        const nodeCountBefore = g1._meta.node_count;

        // Update files.json to add a new file
        const filesData = JSON.parse(fs.readFileSync(path.join(intelDir, 'files.json'), 'utf8'));
        filesData.entries['src/utils.js'] = {
          exports: ['format'],
          imports: [],
          type: 'script',
          lines: 20
        };
        fs.writeFileSync(path.join(intelDir, 'files.json'), JSON.stringify(filesData, null, 2));

        // Write graph.json to simulate it existing
        const graphPath = path.join(planningDir, 'codebase', 'graph.json');
        fs.writeFileSync(graphPath, JSON.stringify(g1, null, 2));

        const g2 = graph.updateGraphIncremental(planningDir, tmp, 'src/utils.js');
        expect(g2._meta.node_count).toBeGreaterThanOrEqual(nodeCountBefore);
        expect(g2.nodes['src/utils.js']).toBeDefined();
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('loadGraph', () => {
    test('returns null when graph.json absent', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const result = graph.loadGraph(planningDir);
        expect(result).toBeNull();
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns graph when graph.json exists', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        graph.buildGraph(planningDir, tmp);
        const result = graph.loadGraph(planningDir);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('nodes');
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('graphHealthCheck', () => {
    test('returns healthy when graph.json exists and is recent', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        graph.buildGraph(planningDir, tmp);
        const result = graph.graphHealthCheck(planningDir);
        expect(result).toHaveProperty('feature', 'architecture_graph');
        expect(result).toHaveProperty('status', 'healthy');
        expect(result).toHaveProperty('nodes');
        expect(result).toHaveProperty('edges');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns degraded when graph.json is stale (>24h old)', () => {
      const { tmp, planningDir, codebaseDir } = makeTempPlanning();
      try {
        graph.buildGraph(planningDir, tmp);
        // Overwrite graph.json with stale timestamp
        const graphPath = require('path').join(codebaseDir, 'graph.json');
        const g = JSON.parse(require('fs').readFileSync(graphPath, 'utf8'));
        g._meta.updated_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        require('fs').writeFileSync(graphPath, JSON.stringify(g, null, 2));

        const result = graph.graphHealthCheck(planningDir);
        expect(result).toHaveProperty('status', 'degraded');
        expect(result.reason).toMatch(/stale/i);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns disabled when features.architecture_graph is false', () => {
      const { tmp, planningDir } = makeTempPlanning({ graphEnabled: false });
      try {
        const result = graph.graphHealthCheck(planningDir);
        expect(result).toHaveProperty('feature', 'architecture_graph');
        expect(result).toHaveProperty('status', 'disabled');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns degraded when graph.json does not exist', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        // No buildGraph call - graph.json absent
        const result = graph.graphHealthCheck(planningDir);
        expect(result).toHaveProperty('status', 'degraded');
        expect(result.reason).toMatch(/not found/i);
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('guardHealthCheck', () => {
    test('returns healthy when architecture_guard is enabled', () => {
      const { tmp, planningDir } = makeTempPlanning();
      try {
        const result = graph.guardHealthCheck(planningDir);
        expect(result).toHaveProperty('feature', 'architecture_guard');
        expect(result).toHaveProperty('status', 'healthy');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns disabled when features.architecture_guard is false', () => {
      const { tmp, planningDir } = makeTempPlanning({ guardEnabled: false });
      try {
        const result = graph.guardHealthCheck(planningDir);
        expect(result).toHaveProperty('feature', 'architecture_guard');
        expect(result).toHaveProperty('status', 'disabled');
      } finally {
        cleanupTemp(tmp);
      }
    });
  });
});
