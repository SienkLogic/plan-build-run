'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

/**
 * Sessions route factory.
 * Reads session snapshots from .planning/sessions/ directory.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @returns {express.Router}
 */
function createSessionsRouter({ planningDir }) {
  const router = express.Router();

  /**
   * GET / - Return parsed session objects from .planning/sessions/.
   * Reads .json and .md files, returns array sorted by timestamp descending.
   */
  router.get('/', async (_req, res) => {
    try {
      const sessionsDir = path.join(planningDir, 'sessions');
      const sessions = [];

      let dirEntries = [];
      try {
        dirEntries = await fs.promises.readdir(sessionsDir);
      } catch (_e) {
        // No sessions directory — return empty
        return res.json([]);
      }

      for (const file of dirEntries) {
        const filePath = path.join(sessionsDir, file);

        try {
          if (file.endsWith('.json')) {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            sessions.push({ file, ...parsed });
          } else if (file.endsWith('.md')) {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(raw);
            sessions.push({ file, ...frontmatter, body: body.slice(0, 500) });
          }
        } catch (_e) {
          // Skip unreadable files
        }
      }

      // Sort by timestamp descending
      sessions.sort((a, b) => {
        const tsA = a.timestamp || a.ts || a.date || '';
        const tsB = b.timestamp || b.ts || b.date || '';
        return String(tsB).localeCompare(String(tsA));
      });

      res.json(sessions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createSessionsRouter;
