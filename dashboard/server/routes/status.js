'use strict';

const express = require('express');

/**
 * Status route factory.
 * @param {import('../services/planning-reader').PlanningReader} planningReader
 * @returns {express.Router}
 */
function createStatusRouter(planningReader) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const status = await planningReader.getStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createStatusRouter;
