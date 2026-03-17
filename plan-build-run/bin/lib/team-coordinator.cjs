/**
 * lib/team-coordinator.cjs — Multi-agent team coordination for Plan-Build-Run.
 *
 * Provides worktree-isolated agent spawning and result merging.
 * Part of Phase 13: Multi-Agent Evolution (experimental).
 */

const { configLoad } = require('./config.cjs');

class TeamCoordinator {
  /**
   * Create a TeamCoordinator instance.
   *
   * @param {object} opts
   * @param {string} [opts.planningDir] - Path to .planning directory
   * @param {object} [opts.config] - Pre-loaded config object (if not provided, loads from planningDir)
   */
  constructor({ planningDir, config } = {}) {
    this.config = config || configLoad(planningDir) || {};
  }

  /**
   * Build task definitions for a team of agents to run in worktree isolation.
   * Does NOT spawn agents directly — returns task definitions for the caller (build skill) to execute.
   *
   * @param {object} opts
   * @param {string[]} opts.agents - Agent types to include (e.g., ['executor', 'verifier'])
   * @param {string} opts.planId - Plan identifier (e.g., '13-01')
   * @param {string} [opts.context] - Additional context to pass to agents
   * @returns {{ skipped: boolean, reason?: string, tasks?: object[] }}
   */
  spawnTeam({ agents = [], planId, context } = {}) {
    const features = this.config.features || {};
    if (!features.agent_teams) {
      return { skipped: true, reason: 'agent_teams disabled' };
    }

    const tasks = agents.map(agentType => ({
      agentType,
      isolation: 'worktree',
      planId,
      context: context || undefined
    }));

    return { skipped: false, tasks };
  }

  /**
   * Merge results from multiple agent executions into a comparison object.
   *
   * @param {object[]} agentResults - Array of agent result objects
   * @param {string} agentResults[].agentType - Agent type that produced this result
   * @param {string} agentResults[].status - 'success' or 'failed'
   * @param {string[]} [agentResults[].files] - Files modified by this agent
   * @returns {{ results: object[], allSucceeded: boolean, failedAgents: string[], filesModified: string[] }}
   */
  mergeResults(agentResults = []) {
    const allSucceeded = agentResults.every(r => r.status === 'success');
    const failedAgents = agentResults
      .filter(r => r.status !== 'success')
      .map(r => r.agentType);
    const filesModified = [...new Set(agentResults.flatMap(r => r.files || []))];

    return { results: agentResults, allSucceeded, failedAgents, filesModified };
  }
}

module.exports = { TeamCoordinator };
