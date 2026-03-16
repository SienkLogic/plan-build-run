'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

/**
 * Memory route factory.
 * Reads memory entries from .planning/memory/ or agent memory dirs.
 * Also exposes PROJECT.md ## Context via /project-context sub-route.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @param {import('../services/planning-reader').PlanningReader} [options.planningReader] - Optional PlanningReader instance
 * @returns {express.Router}
 */
function createMemoryRouter({ planningDir, planningReader }) {
  const router = express.Router();

  /**
   * GET / - Return memory entries, optionally filtered by ?type=
   */
  router.get('/', async (req, res) => {
    try {
      const typeFilter = req.query.type;
      const memoryDir = path.join(planningDir, 'memory');
      const entries = [];

      let files = [];
      try {
        files = await fs.promises.readdir(memoryDir);
      } catch (_e) {
        // No memory directory — return empty
        return res.json([]);
      }

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        try {
          const content = await fs.promises.readFile(
            path.join(memoryDir, file), 'utf-8'
          );
          const { frontmatter, body } = parseFrontmatter(content);
          const entry = {
            file,
            type: frontmatter.type || 'general',
            title: frontmatter.title || file.replace('.md', ''),
            content: body.slice(0, 500),
            ...frontmatter,
          };
          entries.push(entry);
        } catch (_e) {
          // Skip unreadable files
        }
      }

      if (typeFilter) {
        return res.json(entries.filter(e => e.type === typeFilter));
      }

      res.json(entries);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /project-context - Return ## Context section from PROJECT.md.
   * Falls back to legacy CONTEXT.md if PROJECT.md has no ## Context.
   */
  router.get('/project-context', async (_req, res) => {
    try {
      if (planningReader && typeof planningReader.getProjectContext === 'function') {
        const result = await planningReader.getProjectContext();
        return res.json(result);
      }

      // Fallback: read PROJECT.md directly if no planningReader provided
      const projectPath = path.join(planningDir, 'PROJECT.md');
      try {
        const content = await fs.promises.readFile(projectPath, 'utf-8');
        const { body } = parseFrontmatter(content);
        const contextMatch = body.match(/## Context\n([\s\S]*?)(?=\n## |\s*$)/);
        if (contextMatch) {
          return res.json({ context: contextMatch[1].trim() });
        }
      } catch (_e) { /* no PROJECT.md */ }

      // Legacy fallback: CONTEXT.md
      const contextPath = path.join(planningDir, 'CONTEXT.md');
      try {
        const content = await fs.promises.readFile(contextPath, 'utf-8');
        const { body } = parseFrontmatter(content);
        return res.json({ context: body.trim() || null });
      } catch (_e) { /* no CONTEXT.md */ }

      res.json({ context: null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createMemoryRouter;
