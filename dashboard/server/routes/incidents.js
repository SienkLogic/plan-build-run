'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

/**
 * Incidents route factory.
 * Reads incident JSONL files from .planning/incidents/ directory.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @returns {express.Router}
 */
function createIncidentsRouter({ planningDir }) {
  const router = express.Router();

  /**
   * GET / - Return parsed incident objects from .planning/incidents/.
   * Reads all .jsonl files, parses each line as JSON, returns flat array
   * sorted by timestamp descending.
   * Supports ?severity= query param filter.
   */
  router.get('/', async (req, res) => {
    try {
      const incidentsDir = path.join(planningDir, 'incidents');
      const severityFilter = req.query.severity;
      const incidents = [];

      let dirEntries = [];
      try {
        dirEntries = await fs.promises.readdir(incidentsDir);
      } catch (_e) {
        // No incidents directory — return empty
        return res.json([]);
      }

      for (const file of dirEntries) {
        if (!file.endsWith('.jsonl')) continue;
        try {
          const raw = await fs.promises.readFile(
            path.join(incidentsDir, file), 'utf-8'
          );
          const lines = raw.split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              incidents.push(obj);
            } catch (_e) {
              // Skip malformed lines
            }
          }
        } catch (_e) {
          // Skip unreadable files
        }
      }

      // Sort by timestamp descending
      incidents.sort((a, b) => {
        const tsA = a.timestamp || a.ts || '';
        const tsB = b.timestamp || b.ts || '';
        return tsB.localeCompare(tsA);
      });

      if (severityFilter) {
        return res.json(incidents.filter(i => i.severity === severityFilter));
      }

      res.json(incidents);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createIncidentsRouter;
