'use strict';

const express = require('express');
const path = require('path');

const router = express.Router();

/**
 * Resolve the planning directory from request app config.
 */
function getPlanningDir(req) {
  return req.app.locals.options.planningDir;
}

/**
 * Load config from the planning directory.
 */
function loadConfig(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const fs = require('fs');
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_e) {
    return {};
  }
}

/**
 * GET /api/progress
 * Returns phase dependency graph, agent activity, and summary stats.
 */
router.get('/', (req, res) => {
  try {
    const planningDir = getPlanningDir(req);
    const config = loadConfig(planningDir);
    const { getProgressData } = require('../../../plugins/pbr/scripts/lib/progress-visualization');
    const result = getProgressData(planningDir, config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/progress/onboarding
 * Returns the generated onboarding guide.
 */
router.get('/onboarding', (req, res) => {
  try {
    const planningDir = getPlanningDir(req);
    const config = loadConfig(planningDir);
    const { generateOnboardingGuide } = require('../../../plugins/pbr/scripts/lib/onboarding-generator');
    const result = generateOnboardingGuide(planningDir, config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/progress/help-context
 * Returns contextual help suggestions based on current state.
 */
router.get('/help-context', (req, res) => {
  try {
    const planningDir = getPlanningDir(req);
    const config = loadConfig(planningDir);
    const { getContextualHelp } = require('../../../plugins/pbr/scripts/lib/contextual-help');
    const result = getContextualHelp(planningDir, config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
