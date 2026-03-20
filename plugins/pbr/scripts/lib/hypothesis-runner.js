/**
 * lib/hypothesis-runner.cjs — Competing hypotheses for Plan-Build-Run.
 *
 * Spawns multiple agents with different approach prompts on the same task,
 * then scores and selects the best result.
 * Part of Phase 13: Multi-Agent Evolution (experimental).
 */

const { TeamCoordinator } = require('./team-coordinator');

const MAX_HYPOTHESES = 3;

class HypothesisRunner {
  /**
   * Create a HypothesisRunner instance.
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
   * Create task definitions for competing hypothesis agents.
   * Each hypothesis gets a separate worktree-isolated agent with a unique prompt.
   *
   * @param {object} opts
   * @param {object[]} opts.hypotheses - Array of { name, prompt } objects
   * @param {string} opts.planId - Plan identifier
   * @param {string} opts.baseAgent - Agent type to use for all hypotheses (e.g., 'executor')
   * @returns {{ skipped: boolean, reason?: string, tasks?: object[], warning?: string }}
   */
  runHypotheses({ hypotheses = [], planId, baseAgent } = {}) {
    const features = this.config.features || {};
    if (!features.competing_hypotheses) {
      return { skipped: true, reason: 'competing_hypotheses disabled' };
    }

    let warning;
    let activeHypotheses = hypotheses;
    if (hypotheses.length > MAX_HYPOTHESES) {
      activeHypotheses = hypotheses.slice(0, MAX_HYPOTHESES);
      warning = `Capped to 3 hypotheses (received ${hypotheses.length})`;
    }

    const tasks = activeHypotheses.map(h => ({
      agentType: baseAgent,
      isolation: 'worktree',
      planId,
      hypothesisName: h.name,
      context: h.prompt
    }));

    return { skipped: false, tasks, warning };
  }

  /**
   * Score a single hypothesis result.
   * Formula: testsPassed * 100 - filesModified.length
   *
   * @param {object} result - Hypothesis result
   * @returns {number} Numeric score
   * @private
   */
  _scoreHypothesis(result) {
    const testsPassed = result.testsPassed || 0;
    const fileCount = (result.filesModified || []).length;
    return testsPassed * 100 - fileCount;
  }

  /**
   * Compare hypothesis results and select the winner.
   * Primary sort: testsPassed descending. Tiebreak: fewer filesModified wins.
   *
   * @param {object[]} hypothesisResults - Array of result objects
   * @param {string} hypothesisResults[].name - Hypothesis name
   * @param {number} hypothesisResults[].testsPassed - Number of tests that passed
   * @param {number} hypothesisResults[].testsTotal - Total number of tests
   * @param {string[]} hypothesisResults[].filesModified - Files modified
   * @param {string} hypothesisResults[].status - 'success' or 'failed'
   * @returns {{ winner: object, rankings: object[], scores: object }}
   */
  compareResults(hypothesisResults = []) {
    const scores = {};
    for (const r of hypothesisResults) {
      scores[r.name] = this._scoreHypothesis(r);
    }

    const rankings = [...hypothesisResults].sort((a, b) => {
      return scores[b.name] - scores[a.name];
    });

    return {
      winner: rankings[0] || null,
      rankings,
      scores
    };
  }

  /**
   * Format a markdown comparison report from hypothesis results.
   *
   * @param {object} comparisonResult - Output from compareResults()
   * @returns {string} Markdown table string
   */
  formatReport(comparisonResult) {
    const { winner, rankings, scores } = comparisonResult;
    const lines = [
      '| Hypothesis | Tests Passed | Files Modified | Score | Winner |',
      '|------------|-------------|----------------|-------|--------|'
    ];

    for (const r of rankings) {
      const isWinner = winner && r.name === winner.name;
      const fileCount = (r.filesModified || []).length;
      const winnerMark = isWinner ? '<-- WINNER' : '';
      lines.push(`| ${r.name} | ${r.testsPassed || 0}/${r.testsTotal || 0} | ${fileCount} | ${scores[r.name]} | ${winnerMark} |`);
    }

    return lines.join('\n');
  }
}

module.exports = { HypothesisRunner };
