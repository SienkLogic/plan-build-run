'use strict';

const express = require('express');

/**
 * Roadmap route factory.
 * Reads ROADMAP.md via PlanningReader and returns structured milestone + phase data.
 *
 * @param {import('../services/planning-reader').PlanningReader} planningReader
 * @returns {express.Router}
 */
function createRoadmapRouter(planningReader) {
  const router = express.Router();

  /**
   * GET /phases/:slug - Return detail for a single phase (plans, summaries, verifications, context).
   */
  router.get('/phases/:slug', async (req, res) => {
    try {
      const detail = await planningReader.getPhaseDetail(req.params.slug);
      const isEmpty = detail.plans.length === 0 && detail.summaries.length === 0
        && detail.verifications.length === 0 && detail.context.length === 0;
      if (isEmpty) {
        return res.status(404).json({ error: 'Phase not found' });
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET / - Return roadmap phases with milestone header info.
   */
  router.get('/', async (_req, res) => {
    try {
      const [milestones, phases] = await Promise.all([
        planningReader.getMilestones(),
        planningReader.getRoadmapPhases(),
      ]);

      // Build milestone header from first active (or only) milestone
      const activeMilestone = milestones.find(m => !m.archived) || milestones[0] || null;
      const milestone = activeMilestone ? {
        name: activeMilestone.name,
        goal: activeMilestone.description || null,
        phaseCount: phases.length,
        reqCoverage: null,
      } : null;

      // Backward compat: also include flat items array
      const items = milestones.map((ms, i) => ({
        id: ms.id || `ms-${i}`,
        title: ms.title || ms.name,
        tier: ms.archived ? 1 : (ms.version ? 2 : 3),
        st: ms.archived ? 'done' : 'in-progress',
        s: ms.version || '-',
      }));

      res.json({ milestone, phases, items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRoadmapRouter;
