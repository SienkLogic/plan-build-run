/**
 * lib/team-composer.cjs — Dynamic team assembly for Plan-Build-Run.
 *
 * Analyzes task requirements and selects appropriate agent roles
 * to form a team for execution.
 * Part of Phase 13: Multi-Agent Evolution (experimental).
 */

const { TeamCoordinator } = require('./team-coordinator.cjs');

class TeamComposer {
  /**
   * Create a TeamComposer instance.
   *
   * @param {object} opts
   * @param {string} [opts.planningDir] - Path to .planning directory
   * @param {object} [opts.config] - Pre-loaded config object
   */
  constructor({ planningDir, config } = {}) {
    this.config = config || {};
    this.planningDir = planningDir;
  }

  /**
   * Select agent roles based on task analysis criteria.
   *
   * @param {object} analysis - Task analysis data
   * @param {string} analysis.taskType - Type of task (e.g., 'implementation', 'refactor')
   * @param {string} [analysis.riskLevel] - Risk level ('low', 'medium', 'high')
   * @param {string[]} [analysis.files] - Files to be modified
   * @param {number} [analysis.discovery] - Discovery level (1-3)
   * @returns {object[]} Array of { role } objects
   * @private
   */
  _selectRoles({ taskType, riskLevel, files = [], discovery } = {}) {
    const team = [{ role: 'executor' }];

    if (riskLevel === 'high' || files.length > 5) {
      team.push({ role: 'verifier' });
    }

    if (discovery >= 2) {
      team.push({ role: 'researcher' });
    }

    if (taskType === 'refactor' && files.length > 3) {
      team.push({ role: 'plan-checker' });
    }

    return team;
  }

  /**
   * Compose a team of agents for a given task.
   * Analyzes task requirements and builds TeamCoordinator task definitions.
   *
   * @param {object} opts
   * @param {string} opts.taskType - Type of task
   * @param {string} [opts.riskLevel] - Risk level
   * @param {string[]} [opts.files] - Files to modify
   * @param {number} [opts.discovery] - Discovery level
   * @param {string} [opts.planId] - Plan identifier
   * @returns {{ skipped: boolean, reason?: string, team?: object[], taskDefinitions?: object[] }}
   */
  composeTeam({ taskType, riskLevel, files = [], discovery, planId } = {}) {
    const features = this.config.features || {};
    if (!features.dynamic_teams) {
      return { skipped: true, reason: 'dynamic_teams disabled' };
    }

    const team = this._selectRoles({ taskType, riskLevel, files, discovery });

    const tc = new TeamCoordinator({ config: this.config });
    const agents = team.map(t => t.role);
    const spawnResult = tc.spawnTeam({ agents, planId });

    return {
      skipped: false,
      team,
      taskDefinitions: spawnResult.tasks || []
    };
  }
}

module.exports = { TeamComposer };
