'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

/**
 * Telemetry route factory.
 * Reads hook event log and telemetry data from .planning/.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @returns {express.Router}
 */
function createTelemetryRouter({ planningDir }) {
  const router = express.Router();

  /**
   * GET / - Return telemetry metrics.
   * Reads .hook-events.jsonl for aggregate metrics.
   */
  router.get('/', async (_req, res) => {
    try {
      const eventsPath = path.join(planningDir, '.hook-events.jsonl');
      let events = [];

      try {
        const raw = await fs.promises.readFile(eventsPath, 'utf-8');
        events = raw
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try { return JSON.parse(line); } catch (_e) { return null; }
          })
          .filter(Boolean);
      } catch (_e) {
        // No events file — return empty metrics
      }

      const metrics = {
        totalEvents: events.length,
        hookTypes: {},
        recentEvents: events.slice(-20),
      };

      for (const evt of events) {
        const hook = evt.hook || evt.type || 'unknown';
        metrics.hookTypes[hook] = (metrics.hookTypes[hook] || 0) + 1;
      }

      res.json({
        metrics,
        successData: [],
        contextRadar: {},
        subagentPerf: [],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createTelemetryRouter;
