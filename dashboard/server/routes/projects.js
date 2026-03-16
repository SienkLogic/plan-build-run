'use strict';

const express = require('express');

/**
 * Projects route factory.
 * For MVP, returns the current project derived from planningDir.
 *
 * @param {import('../services/planning-reader').PlanningReader} planningReader
 * @returns {express.Router}
 */
function createProjectsRouter(planningReader) {
  const router = express.Router();
  let activeProjectId = 'current';

  router.get('/', (_req, res) => {
    const projectPath = planningReader.planningDir.replace(/[/\\]\.planning\/?$/, '');
    res.json([
      {
        id: 'current',
        name: require('path').basename(projectPath),
        path: projectPath,
        active: activeProjectId === 'current',
      },
    ]);
  });

  router.put('/:id/active', (req, res) => {
    activeProjectId = req.params.id;
    res.json({ active: activeProjectId });
  });

  return router;
}

module.exports = createProjectsRouter;
