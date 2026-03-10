'use strict';

const express = require('express');
const path = require('path');
const { safeReadFile } = require('../services/planning-reader');

/**
 * Requirements route factory.
 * Parses REQUIREMENTS.md and returns structured requirement data.
 *
 * @param {import('../services/planning-reader').PlanningReader} planningReader
 * @returns {express.Router}
 */
function createRequirementsRouter(planningReader) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const content = await safeReadFile(path.join(planningReader.planningDir, 'REQUIREMENTS.md'));
      if (!content) return res.json({ requirements: [], sections: [] });
      const reqs = [];
      const regex = /^- \[([ x])\] \*\*(\w+-\d+)\*\*:\s*(.+)$/gm;
      let match;
      while ((match = regex.exec(content)) !== null) {
        reqs.push({
          id: match[2],
          description: match[3].trim(),
          status: match[1] === 'x' ? 'complete' : 'pending',
        });
      }
      res.json({ requirements: reqs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRequirementsRouter;
