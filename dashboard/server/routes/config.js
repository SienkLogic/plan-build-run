'use strict';

const express = require('express');

/**
 * Config route factory.
 * @param {import('../services/planning-reader').PlanningReader} planningReader
 * @returns {express.Router}
 */
const VALID_MODES = ['autonomous', 'supervised', 'manual'];
const VALID_DEPTHS = ['minimal', 'standard', 'thorough'];
const VALID_STRATEGIES = ['conservative', 'balanced', 'aggressive'];

function createConfigRouter(planningReader) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const config = await planningReader.getConfig();
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/', async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Request body must be a JSON object' });
      }

      const errors = [];
      if (req.body.version !== undefined && (!Number.isInteger(req.body.version) || req.body.version < 1)) {
        errors.push('version must be a positive integer');
      }
      if (req.body.mode !== undefined && !VALID_MODES.includes(req.body.mode)) {
        errors.push('mode must be one of: ' + VALID_MODES.join(', '));
      }
      if (req.body.depth !== undefined && !VALID_DEPTHS.includes(req.body.depth)) {
        errors.push('depth must be one of: ' + VALID_DEPTHS.join(', '));
      }
      if (req.body.context_strategy !== undefined && !VALID_STRATEGIES.includes(req.body.context_strategy)) {
        errors.push('context_strategy must be one of: ' + VALID_STRATEGIES.join(', '));
      }
      for (const key of ['features', 'models', 'parallelization', 'planning', 'git', 'gates', 'safety']) {
        if (req.body[key] !== undefined && (typeof req.body[key] !== 'object' || Array.isArray(req.body[key]) || req.body[key] === null)) {
          errors.push(key + ' must be a plain object');
        }
      }
      if (errors.length > 0) {
        return res.status(400).json({ error: 'Validation error', details: errors });
      }

      const updated = await planningReader.writeConfig(req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createConfigRouter;
