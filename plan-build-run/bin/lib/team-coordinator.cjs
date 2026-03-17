/**
 * lib/team-coordinator.cjs — Multi-agent team coordination for Plan-Build-Run.
 *
 * Provides worktree-isolated agent spawning and result merging for parallel
 * multi-agent workflows. When `features.agent_teams` is enabled in the project
 * config, the build skill can run multiple specialist agents simultaneously —
 * each in its own git worktree so they don't step on each other's changes.
 *
 * Part of Phase 13: Multi-Agent Evolution (experimental).
 *
 * @module team-coordinator
 *
 * @example
 * const { TeamCoordinator } = require('./lib/team-coordinator.cjs');
 *
 * // Instantiate with an explicit planning directory
 * const coordinator = new TeamCoordinator({ planningDir: '.planning' });
 *
 * // Build task definitions for executor + verifier running in parallel
 * const result = coordinator.spawnTeam({
 *   agents: ['executor', 'verifier'],
 *   planId: '13-01',
 *   context: 'Focus on the API layer changes in src/api/'
 * });
 *
 * if (!result.skipped) {
 *   // result.tasks is an array of task definition objects ready for Task() calls
 *   console.log(`Spawning ${result.tasks.length} agents for plan ${planId}`);
 * }
 */

'use strict';

const { configLoad } = require('./config.cjs');

/**
 * Coordinates a team of agents running in parallel worktree isolation.
 *
 * The coordinator acts as a planner/dispatcher: it builds task definitions
 * that the build skill then passes to `Task()` calls. This keeps agent
 * spawning logic separate from the skill's orchestration loop.
 *
 * Configuration key: `features.agent_teams` (boolean) in `.planning/config.json`.
 * When false (the default), all `spawnTeam()` calls return `{ skipped: true }`.
 */
class TeamCoordinator {
  /**
   * Create a TeamCoordinator instance.
   *
   * @param {object} [opts={}] - Constructor options
   * @param {string} [opts.planningDir] - Path to the `.planning` directory.
   *   Used to locate `config.json` when no pre-loaded config is provided.
   *   Defaults to the current working directory's `.planning` folder via
   *   `configLoad()`.
   * @param {object} [opts.config] - Pre-loaded config object. When provided,
   *   `planningDir` is ignored and no disk read is performed. Useful in tests
   *   or when the caller already has the config in memory.
   */
  constructor({ planningDir, config } = {}) {
    this.config = config || configLoad(planningDir) || {};
  }

  /**
   * Build task definitions for a team of agents to run in worktree isolation.
   *
   * Does NOT spawn agents directly — returns task definitions for the caller
   * (the build skill) to execute via `Task()`. This separation lets the skill
   * interleave team spawning with its normal wave-execution loop without
   * importing agent-spawning concerns into this library.
   *
   * Task definition shape:
   * ```json
   * {
   *   "agentType": "executor",
   *   "isolation": "worktree",
   *   "planId": "13-01",
   *   "context": "optional extra instructions"
   * }
   * ```
   *
   * @param {object} [opts={}] - Spawn options
   * @param {string[]} [opts.agents=[]] - Agent types to include.
   *   Standard values: `'executor'`, `'verifier'`, `'integration-checker'`.
   *   Each entry produces one task definition in the returned array.
   * @param {string} opts.planId - Plan identifier (e.g., `'13-01'`).
   *   Passed through to each task definition so agents can locate their
   *   PLAN.md and SUMMARY.md artifacts.
   * @param {string} [opts.context] - Optional freeform context string to
   *   include in every task definition. Agents receive this as extra
   *   instructions appended to their standard prompt.
   * @returns {{ skipped: boolean, reason?: string, tasks?: object[] }}
   *   - `skipped: true` when `features.agent_teams` is disabled; includes a
   *     human-readable `reason` string.
   *   - `skipped: false` with a `tasks` array when the feature is active.
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
   * Merge results from multiple agent executions into a single summary object.
   *
   * Intended for use after all Task() calls from a `spawnTeam()` batch have
   * completed. The caller collects each agent's result object and passes them
   * as an array; this method aggregates pass/fail status and the de-duplicated
   * set of files touched across all agents.
   *
   * @param {object[]} [agentResults=[]] - Array of agent result objects.
   *   Each element should describe one agent's outcome.
   * @param {string} agentResults[].agentType - The agent type identifier
   *   (e.g., `'executor'`). Used to populate `failedAgents`.
   * @param {string} agentResults[].status - Outcome string. `'success'`
   *   indicates the agent completed without errors; any other value (e.g.,
   *   `'failed'`, `'partial'`) is treated as a failure.
   * @param {string[]} [agentResults[].files] - List of file paths created or
   *   modified by this agent. May be omitted if unknown.
   * @returns {{
   *   results: object[],
   *   allSucceeded: boolean,
   *   failedAgents: string[],
   *   filesModified: string[]
   * }}
   *   - `results` — the original input array, passed through unchanged.
   *   - `allSucceeded` — `true` only when every agent reported `'success'`.
   *   - `failedAgents` — array of `agentType` values for non-successful agents.
   *   - `filesModified` — de-duplicated union of all `files` arrays.
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
