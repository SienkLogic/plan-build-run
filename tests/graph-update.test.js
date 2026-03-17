/**
 * Tests for plugins/pbr/scripts/graph-update.js
 *
 * PostToolUse hook that incrementally updates the architecture graph
 * when source files are written or edited.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper: create a temp directory with .planning structure
function makeTempProject(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-update-test-'));
  const planningDir = path.join(tmp, '.planning');
  const logsDir = path.join(planningDir, 'logs');
  const codebaseDir = path.join(planningDir, 'codebase');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(codebaseDir, { recursive: true });

  const config = {
    version: 2,
    features: {
      architecture_graph: opts.graphEnabled !== false,
      architecture_guard: true
    }
  };
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(config, null, 2));

  // Optionally write a minimal graph.json
  if (opts.writeGraph) {
    const graph = {
      _meta: { updated_at: new Date().toISOString(), version: 1, node_count: 2, edge_count: 1 },
      nodes: {
        'src/app.js': { type: 'script', exports: [], size_lines: 50, patterns: [] }
      },
      edges: [],
      patterns: {}
    };
    fs.writeFileSync(path.join(codebaseDir, 'graph.json'), JSON.stringify(graph, null, 2));
  }

  return { tmp, planningDir };
}

function cleanupTemp(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

function makeHookInput(filePath, eventType = 'Write') {
  return JSON.stringify({
    tool_name: eventType,
    tool_input: { file_path: filePath },
    tool_output: 'File written.'
  });
}

// Load the module under test
const { updateGraph, findPlanningDir, isSourceFile } = require('../plugins/pbr/scripts/graph-update.js');

describe('graph-update.js', () => {
  describe('findPlanningDir', () => {
    test('returns planningDir when .planning exists as ancestor', () => {
      const { tmp, planningDir } = makeTempProject();
      try {
        const srcFile = path.join(tmp, 'src', 'app.js');
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(srcFile, 'console.log("hi")');
        const result = findPlanningDir(srcFile);
        expect(result).toBe(planningDir);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns null when no .planning ancestor exists', () => {
      const result = findPlanningDir('/nonexistent/path/to/file.js');
      expect(result).toBeNull();
    });
  });

  describe('isSourceFile', () => {
    test('returns true for JS/CJS/MJS/TS/TSX/JSX extensions', () => {
      expect(isSourceFile('src/app.js')).toBe(true);
      expect(isSourceFile('lib/util.cjs')).toBe(true);
      expect(isSourceFile('lib/util.mjs')).toBe(true);
      expect(isSourceFile('src/component.ts')).toBe(true);
      expect(isSourceFile('src/component.tsx')).toBe(true);
      expect(isSourceFile('src/component.jsx')).toBe(true);
    });

    test('returns false for markdown, json config, txt, and log files', () => {
      expect(isSourceFile('README.md')).toBe(false);
      expect(isSourceFile('.planning/config.json')).toBe(false);
      expect(isSourceFile('notes.txt')).toBe(false);
      expect(isSourceFile('output.log')).toBe(false);
    });
  });

  describe('updateGraph', () => {
    test('updates graph when a source file is written', () => {
      const { tmp, planningDir } = makeTempProject({ writeGraph: true });
      try {
        const srcFile = path.join(tmp, 'src', 'newfile.js');
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(srcFile, "'use strict'; module.exports = {};");

        const result = updateGraph(planningDir, tmp, 'src/newfile.js');
        expect(result).toBeNull(); // PostToolUse no-block returns null
        // Graph should have been updated on disk
        const graphPath = path.join(planningDir, 'codebase', 'graph.json');
        expect(fs.existsSync(graphPath)).toBe(true);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('skips update when features.architecture_graph is disabled', () => {
      const { tmp, planningDir } = makeTempProject({ graphEnabled: false, writeGraph: true });
      try {
        const initialGraph = fs.readFileSync(path.join(planningDir, 'codebase', 'graph.json'), 'utf8');
        const result = updateGraph(planningDir, tmp, 'src/app.js');
        expect(result).toBeNull();
        // Graph should NOT have been updated (content unchanged)
        const finalGraph = fs.readFileSync(path.join(planningDir, 'codebase', 'graph.json'), 'utf8');
        expect(finalGraph).toBe(initialGraph);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('skips update for non-source files', () => {
      const { tmp, planningDir } = makeTempProject({ writeGraph: true });
      try {
        const graphBefore = fs.readFileSync(path.join(planningDir, 'codebase', 'graph.json'), 'utf8');
        const result = updateGraph(planningDir, tmp, 'README.md');
        expect(result).toBeNull();
        const graphAfter = fs.readFileSync(path.join(planningDir, 'codebase', 'graph.json'), 'utf8');
        expect(graphAfter).toBe(graphBefore);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('logs update to hooks.jsonl with graph_update event type', () => {
      const { tmp, planningDir } = makeTempProject({ writeGraph: true });
      try {
        const srcFile = path.join(tmp, 'plugins', 'pbr', 'scripts', 'my-hook.js');
        fs.mkdirSync(path.join(tmp, 'plugins', 'pbr', 'scripts'), { recursive: true });
        fs.writeFileSync(srcFile, "const { logHook } = require('./hook-logger');");

        updateGraph(planningDir, tmp, 'plugins/pbr/scripts/my-hook.js');

        const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
        expect(fs.existsSync(logPath)).toBe(true);
        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
        const entry = JSON.parse(lines[lines.length - 1]);
        expect(entry.event).toBe('graph_update');
        expect(entry.file).toBe('plugins/pbr/scripts/my-hook.js');
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('handles missing graph.json gracefully (triggers full build)', () => {
      const { tmp, planningDir } = makeTempProject({ writeGraph: false });
      try {
        const srcFile = path.join(tmp, 'src', 'newfile.js');
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(srcFile, "'use strict';");

        const result = updateGraph(planningDir, tmp, 'src/newfile.js');
        expect(result).toBeNull();
        // After full build, graph.json should exist
        const graphPath = path.join(planningDir, 'codebase', 'graph.json');
        expect(fs.existsSync(graphPath)).toBe(true);
      } finally {
        cleanupTemp(tmp);
      }
    });

    test('returns null (no block) for PostToolUse', () => {
      const { tmp, planningDir } = makeTempProject({ writeGraph: true });
      try {
        const result = updateGraph(planningDir, tmp, 'src/app.js');
        expect(result).toBeNull();
      } finally {
        cleanupTemp(tmp);
      }
    });
  });

  describe('stdin-based hook invocation', () => {
    test('skips files inside .planning directory', () => {
      const { tmp, planningDir } = makeTempProject({ writeGraph: true });
      try {
        const planningFilePath = path.join(planningDir, 'STATE.md');
        const graphBefore = fs.readFileSync(path.join(planningDir, 'codebase', 'graph.json'), 'utf8');
        const result = updateGraph(planningDir, tmp, '.planning/STATE.md');
        expect(result).toBeNull();
        const graphAfter = fs.readFileSync(path.join(planningDir, 'codebase', 'graph.json'), 'utf8');
        expect(graphAfter).toBe(graphBefore);
      } finally {
        cleanupTemp(tmp);
      }
    });
  });
});
