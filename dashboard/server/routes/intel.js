'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

/**
 * Intel route factory.
 * Reads intel data from .planning/intel/ directory.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @returns {express.Router}
 */
function createIntelRouter({ planningDir }) {
  const router = express.Router();

  /**
   * GET / - Return parsed intel data from .planning/intel/.
   * JSON files (apis.json, deps.json, files.json, stack.json) are returned as keyed object.
   * MD files are parsed with frontmatter and returned in a docs array.
   */
  router.get('/', async (_req, res) => {
    try {
      const intelDir = path.join(planningDir, 'intel');
      const data = { apis: null, deps: null, files: null, stack: null, docs: [] };
      const fileList = [];

      let dirEntries = [];
      try {
        dirEntries = await fs.promises.readdir(intelDir);
      } catch (_e) {
        // No intel directory — return empty
        return res.json({ data, files: [] });
      }

      for (const file of dirEntries) {
        const filePath = path.join(intelDir, file);
        fileList.push(file);

        try {
          if (file.endsWith('.json')) {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            const key = file.replace('.json', '');
            if (key in data && key !== 'docs') {
              data[key] = parsed;
            }
          } else if (file.endsWith('.md')) {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const { frontmatter, body } = parseFrontmatter(raw);
            data.docs.push({ file, ...frontmatter, body });
          }
        } catch (_e) {
          // Skip unreadable files
        }
      }

      res.json({ data, files: fileList });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createIntelRouter;
