'use strict';

/**
 * lib/graph-cli.js -- CLI handler for pbr-tools.js graph subcommand.
 *
 * Commands:
 *   graph build [--dir <path>]           Build/rebuild the architecture graph
 *   graph query <file-path> [--depth N] [--direction dependents|dependencies|both]
 *                                         Query a node's connections
 *   graph impact <file-path>             Get all transitively impacted files
 *   graph stats                          Get node_count, edge_count, pattern_count
 */

const path = require('path');

/**
 * Handle the graph subcommand routing.
 * @param {string} subcommand - The subcommand (build, query, impact, stats)
 * @param {string[]} args - Full args array from CLI
 * @param {string} planningDir - Resolved .planning directory
 * @param {string} cwd - Project root
 * @param {Function} output - Output function from pbr-tools
 * @param {Function} error - Error function from pbr-tools
 */
function handleGraphCommand(subcommand, args, planningDir, cwd, output, error) {
  const graph = require('./graph');

  if (subcommand === 'build') {
    const result = graph.buildGraph(planningDir, cwd);
    output(result);

  } else if (subcommand === 'query') {
    const filePath = args[2];
    if (!filePath) error('Usage: graph query <file-path> [--depth N] [--direction dependents|dependencies|both]');

    // Parse --depth
    const depthIdx = args.indexOf('--depth');
    const depthEq = args.find(a => a.startsWith('--depth='));
    let depth = 1;
    if (depthIdx !== -1 && args[depthIdx + 1]) {
      depth = parseInt(args[depthIdx + 1], 10) || 1;
    } else if (depthEq) {
      depth = parseInt(depthEq.split('=')[1], 10) || 1;
    }

    // Parse --direction
    const dirIdx = args.indexOf('--direction');
    const direction = dirIdx !== -1 && args[dirIdx + 1] ? args[dirIdx + 1] : 'both';

    const g = graph.loadGraph(planningDir);
    if (!g) {
      output({ error: 'No graph found. Run: graph build' });
      return;
    }
    const result = graph.queryGraph(g, filePath, { depth, direction });
    output(result);

  } else if (subcommand === 'impact') {
    const filePath = args[2];
    if (!filePath) error('Usage: graph impact <file-path>');

    const g = graph.loadGraph(planningDir);
    if (!g) {
      output({ error: 'No graph found. Run: graph build' });
      return;
    }
    const result = graph.getImpactedFiles(g, filePath);
    output(result);

  } else if (subcommand === 'stats') {
    const g = graph.loadGraph(planningDir);
    if (!g) {
      output({ error: 'No graph found. Run: graph build' });
      return;
    }
    const meta = g._meta || {};
    output({
      node_count: meta.node_count || Object.keys(g.nodes || {}).length,
      edge_count: meta.edge_count || (g.edges || []).length,
      pattern_count: Object.keys(g.patterns || {}).length,
      last_updated: meta.updated_at || null
    });

  } else {
    error(`Unknown graph subcommand: ${subcommand}\nAvailable: build, query, impact, stats`);
  }
}

module.exports = { handleGraphCommand };
