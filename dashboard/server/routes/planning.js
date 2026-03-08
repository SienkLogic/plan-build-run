'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const VALID_TYPES = ['milestones', 'phases', 'todos', 'notes', 'quick', 'research'];

const TYPE_METHOD_MAP = {
  milestones: 'getMilestones',
  phases: 'getPhases',
  todos: 'getTodos',
  notes: 'getNotes',
  quick: 'getQuick',
  research: 'getResearch',
};

/**
 * Mtime-based optimistic locking middleware.
 * Compares If-Unmodified-Since header against file mtime.
 * Returns 409 if the file was modified after the given timestamp.
 * @param {string} planningDir - Absolute path to .planning/ directory
 */
function checkMtime(planningDir) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();

    const mtimeHeader = req.headers['if-unmodified-since'];
    if (!mtimeHeader) return next();

    const mtimeTarget = req.mtimeTarget;
    if (!mtimeTarget) return next();

    const filePath = path.isAbsolute(mtimeTarget)
      ? mtimeTarget
      : path.join(planningDir, mtimeTarget);

    try {
      const stat = fs.statSync(filePath);
      const headerMs = parseFloat(mtimeHeader);
      if (!isNaN(headerMs) && stat.mtimeMs > headerMs) {
        return res.status(409).json({
          error: 'File modified since last read',
          currentMtime: stat.mtimeMs,
        });
      }
    } catch (_e) {
      // File doesn't exist yet — allow write
    }

    next();
  };
}

/**
 * Planning route factory.
 * @param {import('../services/planning-reader').PlanningReader} planningReader
 * @returns {express.Router}
 */
function createPlanningRouter(planningReader) {
  const router = express.Router();
  const planningDir = planningReader.planningDir;

  // Apply mtime locking middleware
  router.use(checkMtime(planningDir));

  // --- Decisions (must be before /:type catch-all) ---
  router.get('/decisions', async (_req, res) => {
    try {
      const decisions = await planningReader.getDecisions();
      res.json(decisions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/decisions', async (req, res) => {
    try {
      const { phase, text } = req.body;
      if (!phase || !text) return res.status(400).json({ error: 'phase and text are required' });
      req.mtimeTarget = 'STATE.md';
      const decision = await planningReader.createDecision(phase, text);
      res.status(201).json(decision);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Notes CRUD (before /:type catch-all) ---
  router.post('/notes', async (req, res) => {
    try {
      const { title, content, tags } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const note = await planningReader.createNote(title, content || '', tags || []);
      res.status(201).json(note);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/notes/:id', async (req, res) => {
    try {
      req.mtimeTarget = path.join('notes', req.params.id);
      const { title, content, tags } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const note = await planningReader.updateNote(req.params.id, title, content || '', tags || []);
      res.json(note);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/notes/:id', async (req, res) => {
    try {
      req.mtimeTarget = path.join('notes', req.params.id);
      const result = await planningReader.deleteNote(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Todos CRUD (before /:type catch-all) ---
  router.post('/todos', async (req, res) => {
    try {
      const { title, priority, phase, notes } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const todo = await planningReader.createTodo(title, priority, phase, notes || '');
      res.status(201).json(todo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/todos/:id/toggle', async (req, res) => {
    try {
      const { currentStatus } = req.body;
      if (!currentStatus) return res.status(400).json({ error: 'currentStatus is required' });
      const dir = currentStatus === 'pending' ? 'pending' : 'done';
      req.mtimeTarget = path.join('todos', dir, req.params.id);
      const todo = await planningReader.toggleTodo(req.params.id, currentStatus);
      res.json(todo);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/todos/:id', async (req, res) => {
    try {
      const { status } = req.body;
      const dir = status === 'done' ? 'done' : 'pending';
      req.mtimeTarget = path.join('todos', dir, req.params.id);
      const result = await planningReader.deleteTodo(req.params.id, status || 'pending');
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Phase tasks (before /:type catch-all) ---
  router.put('/phases/:phaseSlug/tasks/:taskIndex', async (req, res) => {
    try {
      const { completed } = req.body;
      if (typeof completed !== 'boolean') return res.status(400).json({ error: 'completed (boolean) is required' });
      const task = await planningReader.togglePhaseTask(
        req.params.phaseSlug,
        parseInt(req.params.taskIndex, 10),
        completed
      );
      res.json(task);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Files (raw .md file listing, viewing, editing) ---
  router.get('/files', async (_req, res) => {
    try {
      const files = await planningReader.getFiles();
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/files/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      if (!filename.endsWith('.md')) {
        return res.status(400).json({ error: 'Filename must end with .md' });
      }
      const file = await planningReader.getFileContent(filename);
      res.json(file);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/files/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      if (!filename.endsWith('.md')) {
        return res.status(400).json({ error: 'Filename must end with .md' });
      }
      req.mtimeTarget = filename;
      const result = await planningReader.writeFile(filename, req.body.content);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- GET /:type catch-all (must be last) ---
  router.get('/:type', async (req, res) => {
    const { type } = req.params;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid planning type: "${type}". Valid types: ${VALID_TYPES.join(', ')}`,
      });
    }

    try {
      const method = TYPE_METHOD_MAP[type];
      const data = await planningReader[method]();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createPlanningRouter;
