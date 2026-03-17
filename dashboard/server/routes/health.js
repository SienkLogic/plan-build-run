'use strict';

const express = require('express');
const path = require('path');

const router = express.Router();
const startTime = Date.now();

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
    const fs = require('fs');
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_e) {
    return {};
  }
}

/**
 * GET /api/health
 * Returns server health information.
 */
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '4.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/features
 * Returns per-feature health status for Phase 15 DX features.
 */
router.get('/features', (req, res) => {
  try {
    const planningDir = getPlanningDir(req);
    const config = loadConfig(planningDir);
    const features = (config && config.features) || {};

    const featureChecks = [
      {
        name: 'progress_visualization',
        module: '../../../plan-build-run/bin/lib/progress-visualization.cjs',
        fn: 'getProgressData',
      },
      {
        name: 'contextual_help',
        module: '../../../plan-build-run/bin/lib/contextual-help.cjs',
        fn: 'getContextualHelp',
      },
      {
        name: 'team_onboarding',
        module: '../../../plan-build-run/bin/lib/onboarding-generator.cjs',
        fn: 'generateOnboardingGuide',
      },
    ];

    const results = featureChecks.map(({ name, module: modPath, fn }) => {
      const enabled = features[name] !== false; // default true

      if (!enabled) {
        return { feature: name, enabled: false, status: 'disabled', detail: 'Feature disabled in config' };
      }

      try {
        const mod = require(modPath);
        const result = mod[fn](planningDir, config);
        // If module returns enabled:false, it's degraded (STATE.md likely missing)
        const status = result && result.enabled === false ? 'degraded' : 'healthy';
        return { feature: name, enabled: true, status, detail: status === 'healthy' ? 'OK' : 'Module returned disabled stub' };
      } catch (err) {
        return { feature: name, enabled: true, status: 'degraded', detail: err.message };
      }
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
